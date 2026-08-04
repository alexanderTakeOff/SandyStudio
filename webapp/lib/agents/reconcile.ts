// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/reconcile.ts
//
// Фаза 2 (docs/AUTONOMY-IMPLEMENTATION-PLAN.md) — the reconciler's DECISION CORE.
//
// `planReconcileActions` is a PURE function over the state matrix + critic
// signals: given "where everything is now", it returns the list of high-level
// actions the code muscle should take to advance the episode from an approved
// production plan toward the final cut — WITHOUT any manual approve, except the
// reserved gates the human keeps.
//
// This module performs NO IO and NO mutation. The executor (Фаза 2b) applies
// these actions by reusing the existing approve path + computeNextEvents cascade
// (never a second DAG), guarded by the per-episode arm. Keeping the decision
// pure makes the hard part — WHAT to advance, WHEN to stitch, WHEN to halt —
// exhaustively unit-testable in isolation.
// ──────────────────────────────────────────────────────────────────────────────

import {
  STAGE_ORDER,
  UPSTREAM_OF,
  type StageName,
  type EpisodeStateMatrix,
} from './state-matrix';
import { isShotInPlan, type ProductionPlan } from './production-plan';
import { resolveGateDecision } from './gate-decision';

/** Stages fronted by a critic whose PASS is required before auto-approve. The
 *  plans are critic-gated (EPREV / VPREV); the generated artifacts (ref image,
 *  video) are not — for non-reserved shots they advance mechanically once in
 *  REVIEW. Pilots stay reserved (the Director eyeballs them). */
const STAGE_HAS_CRITIC: Record<StageName, boolean> = {
  ref_plan: true,
  ref_image: false,
  shot_plan: true,
  video: false,
};

/** Map a REV-* file_type to the stage it critiques. */
const STAGE_BY_REV_FILE_TYPE: Record<string, StageName> = {
  'REV-ref_plan': 'ref_plan',
  'REV-shot_plan': 'shot_plan',
};

export type ReconcileAction =
  | { kind: 'approve'; assetId: string; shotId: string; stage: StageName; reason: string }
  | { kind: 'stitch'; reason: string }
  | { kind: 'halt'; shotId: string; stage: StageName; reason: string }
  | { kind: 'wait'; shotId: string | null; stage: StageName | null; reason: string }
  // Re-drive a cell nobody else owns. Two origins, one action:
  //   - Failure-spine Slice 3: a FAILED (never-produced) cell, status null;
  //   - a REJECTED money cell (status REVISION) whose APPROVED plan supersedes it.
  // `assetId` is the UPSTREAM plan's id for money stages (ref_image/video), absent
  // for the authoring stages (ref_plan/shot_plan) which re-run from scratch.
  | { kind: 'refire'; shotId: string; stage: StageName; assetId?: string; reason: string }
  // On-model gate: a rendered ref image whose FROZEN on_model verdict is FAIL.
  // Keeps the cell in REVIEW (no status flip) and escalates to the Director — a
  // rendered image is not auto-revisable, so it must NOT enter the critic
  // REVISE-loop. See the on-model branch in the creative else below.
  | { kind: 'bounce'; shotId: string; stage: StageName; assetId: string; reason: string }
  // Critic REVISE → re-author edge (Phase 2+, 2026-07-18). A plan (ref_plan /
  // shot_plan) a critic flipped to REVISION is re-authored by the producing agent
  // (Designer / Animator) with the critic's notes as hard criteria. next-events.ts
  // left this to "a Director-manual re-trigger today"; the reconciler now owns it,
  // below the critic-revision cap (at cap the critic-loop already HALTed to Director).
  // `assetId` = the REVISION plan's id. Executor collects notes + guards in-flight.
  | { kind: 'reauthor'; shotId: string; stage: StageName; assetId: string; reason: string };

export interface ReconcileContext {
  matrix: EpisodeStateMatrix;
  plan: ProductionPlan | null;
  /** key `${shotId}::${stage}` → latest critic verdict (PASS / REVISE / …). */
  verdicts: Map<string, string>;
  /** key `${shotId}::${stage}` → number of REVISE verdicts recorded so far. */
  reviseCounts: Map<string, number>;
  /** key `${shotId}::${stage}` → number of mechanical refires already fired
   *  (from `reconcile/refire` events). Drives the recovery cap in the refire pass. */
  refireCounts: Map<string, number>;
  /** Shots still gated by the Director (e.g. pilots when 'pilots' is reserved). */
  reservedShots: Set<string>;
  /** Max REVISE cycles for one plan before HALT + escalate (critic_revision_cap). */
  criticCap: number;
  /** Max mechanical refires of a FAILED cell before HALT (reconcile_recovery_cap). */
  recoveryCap: number;
  /** Episode governance mode (1 MANUAL / 2 HYBRID / 3 DELEGATED). Drives the
   *  mode-aware gate decision per cell — see resolveGateDecision. */
  governanceMode: number | null;
}

export function signalKey(shotId: string, stage: StageName): string {
  return `${shotId}::${stage}`;
}

const PASS_VERDICTS = new Set(['PASS', 'PASS_WITH_UNCERTAINTY']);

/**
 * Compute critic signals (latest verdict + REVISE count per shot×stage) from the
 * episode's REV-* rows. Pure — the executor passes the rows it already loaded.
 */
export function collectCriticSignals(
  revRows: ReadonlyArray<{ file_type?: string | null; version?: number | null; metadata?: unknown }>,
): { verdicts: Map<string, string>; reviseCounts: Map<string, number> } {
  const verdicts = new Map<string, string>();
  const latestVersion = new Map<string, number>();
  const reviseCounts = new Map<string, number>();

  for (const row of revRows) {
    const ft = row.file_type ?? '';
    const stage = STAGE_BY_REV_FILE_TYPE[ft];
    if (!stage) continue;
    const meta = (row.metadata ?? null) as { shot_id?: unknown; verdict?: unknown } | null;
    const shotId = meta && typeof meta.shot_id === 'string' ? meta.shot_id : null;
    const verdict = meta && typeof meta.verdict === 'string' ? meta.verdict : null;
    if (!shotId || !verdict) continue;
    const key = signalKey(shotId, stage);
    const v = row.version ?? 0;
    if (!latestVersion.has(key) || v >= (latestVersion.get(key) ?? 0)) {
      latestVersion.set(key, v);
      verdicts.set(key, verdict);
    }
    if (verdict === 'REVISE' || verdict === 'FAIL') {
      reviseCounts.set(key, (reviseCounts.get(key) ?? 0) + 1);
    }
  }
  return { verdicts, reviseCounts };
}

/**
 * Fold the FROZEN verdicts each IMG-episode_ref row carries in its own metadata
 * into a verdicts map keyed `${shot}::ref_image` (latest version wins). There is
 * NO REV-ref_image row — both signals live on the image:
 *   - `shot_reference.on_model.verdict` — the identity detector's PASS / FAIL.
 *   - `shot_reference.review.verdict`   — the EREF reviewer's APPROVE /
 *     REGENERATE / HUMAN_REVIEW on the pixels that shipped.
 *
 * Either one saying "do not ship" is reported as `FAIL`, so the existing on-model
 * bounce branch in `planReconcileActions` holds the cell in REVIEW. E33 (P1 #8):
 * only the on-model axis was folded in, so SH02/SH03/SH04/SH08 — all carrying a
 * final `REGENERATE` — were invisible here and eligible for auto-approve.
 *
 * The executor merges this into the same map `planReconcileActions` consumes.
 * Pure — the executor passes the rows it already loaded.
 */
export function collectOnModelSignals(
  imgRows: ReadonlyArray<{ version?: number | null; metadata?: unknown }>,
): Map<string, string> {
  const verdicts = new Map<string, string>();
  const latestVersion = new Map<string, number>();
  for (const row of imgRows) {
    const meta = (row.metadata ?? null) as { shot_reference?: unknown } | null;
    const sr = (meta?.shot_reference ?? null) as
      | {
          shot_id?: unknown;
          on_model?: { verdict?: unknown } | null;
          review?: { verdict?: unknown } | null;
        }
      | null;
    const shotId = sr && typeof sr.shot_id === 'string' ? sr.shot_id : null;
    const onModel =
      sr && sr.on_model && typeof sr.on_model.verdict === 'string' ? sr.on_model.verdict : null;
    const reviewer =
      sr && sr.review && typeof sr.review.verdict === 'string' ? sr.review.verdict : null;
    // The reviewer's REGENERATE is as blocking as an on-model FAIL. HUMAN_REVIEW
    // is not — that verdict asks for the Director, which the creative gate below
    // already delivers in Modes 1/2.
    const verdict = onModel === 'FAIL' || reviewer === 'REGENERATE' ? 'FAIL' : onModel;
    if (!shotId || !verdict) continue;
    const key = signalKey(shotId, 'ref_image');
    const v = row.version ?? 0;
    if (!latestVersion.has(key) || v >= (latestVersion.get(key) ?? 0)) {
      latestVersion.set(key, v);
      verdicts.set(key, verdict);
    }
  }
  return verdicts;
}

/**
 * The decision. Returns every action the muscle should take THIS pass. Idempotent
 * by construction — re-running on an unchanged matrix yields the same list, and
 * an already-APPROVED stage produces no action, so it is safe to call on any event.
 */
export function planReconcileActions(ctx: ReconcileContext): ReconcileAction[] {
  const {
    matrix,
    plan,
    verdicts,
    reviseCounts,
    refireCounts,
    reservedShots,
    criticCap,
    recoveryCap,
    governanceMode,
  } = ctx;
  const actions: ReconcileAction[] = [];

  for (const shot of matrix.shots) {
    if (shot.excluded) continue;
    if (reservedShots.has(shot.shot_id)) continue; // Director gates this shot
    if (!isShotInPlan(plan, shot.shot_id)) continue; // out-of-plan → never auto-advance

    for (const stage of STAGE_ORDER) {
      const cell = shot.stages[stage];
      if (cell.status !== 'REVIEW') continue; // only REVIEW stages are actionable
      const key = signalKey(shot.shot_id, stage);

      // Never auto-approve a STALE cell — it would lock in outdated upstream.
      if (!cell.fresh) {
        actions.push({
          kind: 'wait',
          shotId: shot.shot_id,
          stage,
          reason: cell.blocked_reason ?? 'stale — needs regeneration before approval',
        });
        continue;
      }

      if (STAGE_HAS_CRITIC[stage]) {
        const verdict = verdicts.get(key) ?? null;
        if (verdict && PASS_VERDICTS.has(verdict)) {
          // Critic PASS = quality already judged → a MECHANICAL gate. Auto-advances
          // in Mode 2/3; Mode 1 (MANUAL) still requires the Director's approval.
          if (resolveGateDecision('mechanical', governanceMode) === 'advance') {
            actions.push({
              kind: 'approve',
              assetId: cell.asset_id as string,
              shotId: shot.shot_id,
              stage,
              reason: `critic ${verdict} — mechanical, mode ${governanceMode ?? 1} auto-approve`,
            });
          } else {
            actions.push({
              kind: 'wait',
              shotId: shot.shot_id,
              stage,
              reason: `critic ${verdict} — Mode 1 (MANUAL) requires Director approval`,
            });
          }
        } else if (verdict === 'REVISE' || verdict === 'FAIL') {
          const count = reviseCounts.get(key) ?? 0;
          if (count >= criticCap) {
            actions.push({
              kind: 'halt',
              shotId: shot.shot_id,
              stage,
              reason: `critic ${verdict} ×${count} ≥ cap ${criticCap} — HALT + escalate Director`,
            });
          } else {
            actions.push({
              kind: 'wait',
              shotId: shot.shot_id,
              stage,
              reason: `critic ${verdict} (${count}/${criticCap}) — revise loop in progress`,
            });
          }
        } else {
          actions.push({
            kind: 'wait',
            shotId: shot.shot_id,
            stage,
            reason: 'awaiting critic verdict',
          });
        }
      } else {
        // On-model gate (ref_image only): a rendered ref image carries a FROZEN
        // on_model verdict in its metadata (folded into `verdicts` by the executor).
        // A FAIL bounces — keep the cell in REVIEW and escalate to the Director —
        // regardless of governance mode. PASS or a MISSING verdict (loose episode,
        // legacy/in-flight image) falls through to the creative gate below, so those
        // paths are byte-identical to before the gate existed (fail-open).
        if (stage === 'ref_image' && verdicts.get(key) === 'FAIL') {
          actions.push({
            kind: 'bounce',
            shotId: shot.shot_id,
            stage,
            assetId: cell.asset_id as string,
            reason: 'on-model detector FAIL — keep REVIEW, escalate Director',
          });
          continue;
        }
        // No enforcing critic → a CREATIVE artifact (rendered ref image / video).
        // Auto-advance ONLY in Mode 3 (DELEGATED — Polina is the delegate). Mode 1
        // (MANUAL) and Mode 2 (HYBRID — pause & eyeball) keep the Director's hand on
        // every un-critiqued render.
        if (resolveGateDecision('creative', governanceMode) === 'advance') {
          actions.push({
            kind: 'approve',
            assetId: cell.asset_id as string,
            shotId: shot.shot_id,
            stage,
            reason: 'creative render — Mode 3 delegated auto-approve',
          });
        } else {
          actions.push({
            kind: 'wait',
            shotId: shot.shot_id,
            stage,
            reason: `creative render — Mode ${governanceMode ?? 1} requires a human (Director/Polina)`,
          });
        }
      }
    }

    // ── REVISION cells — EVERY rejected cell gets an owner ───────────────────
    // A cell flipped to REVISION (by a critic or by the Director) is invisible to
    // both passes around it: the REVIEW loop above reads `status === 'REVIEW'`, the
    // failure refire below reads `status === null`. This pass used to open with
    // `if (!STAGE_HAS_CRITIC[stage]) continue`, claiming the money stages were
    // "handled by the bounce / creative branches above" — they are NOT. Those
    // branches live INSIDE the REVIEW loop and never see a REVISION cell, so a
    // rejected ref_image / video had no owner at all. Live proof, E33 SH02
    // (2026-07-29): the Director rejected the video, the Animator re-authored the
    // plan, the plan was approved — and the shot stood still forever, while its
    // siblings (EMPTY cells → the refire pass) kept moving.
    //
    // Two owners, one loop; the difference is what a rejection ASKS for:
    //   authoring stage (ref_plan / shot_plan) → re-author the plan with the
    //     critic's notes as hard criteria (`reauthor`);
    //   money stage (ref_image / video) → nothing to re-write, the plan was
    //     already re-authored: RENDER the APPROVED plan (`refire` — the same
    //     action + executor branch the failure spine uses, not a third path).
    // Both are bounded by the SAME critic-revision cap, counted the same way
    // (version N ⇒ N-1 revisions so far). At/over the cap the authoring branch does
    // nothing (its critic loop already HALTed + escalated there) while the money
    // branch — which has no critic loop behind it — HALTs + escalates itself.
    //
    // IDEMPOTENCY — what stops each branch firing twice on the same cell:
    //   authoring: a re-author lifts the plan to a NEW version, so the cell stops
    //     being REVISION; the executor also dedups per REVISION asset id via the
    //     `reconcile/reauthor` ledger.
    //   money: the executor refuses to render a plan that has ALREADY produced an
    //     artifact (`planAlreadyExecuted` — the same per-plan guard computeNextEvents
    //     uses on this exact edge). That IS the "is there an APPROVED plan NEWER than
    //     the rejected render" test: the rejected render carries the OLD plan's id,
    //     so a freshly-approved plan has no artifact and renders exactly once, and
    //     the plan that produced the rejected render is never re-rolled (no repeat of
    //     the E33 SH01 «$0.968 for a dice roll»). While that render is in flight the
    //     atomic per-(episode, shot, agent) dispatch claim blocks the duplicate
    //     BEFORE any spend; once it lands the cell is no longer REVISION at all.
    for (const stage of STAGE_ORDER) {
      const cell = shot.stages[stage];
      if (cell.status !== 'REVISION') continue;
      if (!cell.asset_id) continue;
      const revisionsSoFar = Math.max(0, (cell.version ?? 1) - 1);

      if (STAGE_HAS_CRITIC[stage]) {
        if (revisionsSoFar >= criticCap) continue; // critic-loop already HALTed at cap
        actions.push({
          kind: 'reauthor',
          shotId: shot.shot_id,
          stage,
          assetId: cell.asset_id,
          reason: `critic REVISE — re-author ${stage} (revision ${revisionsSoFar + 1}/${criticCap})`,
        });
        continue;
      }

      // Money stage. No APPROVED upstream plan → the gap is upstream (the authoring
      // branch owns it), so stay silent rather than render something unblessed.
      const upstream = UPSTREAM_OF[stage];
      const up = upstream ? shot.stages[upstream] : null;
      if (!up || up.status !== 'APPROVED' || !up.asset_id) continue;

      if (revisionsSoFar >= criticCap) {
        actions.push({
          kind: 'halt',
          shotId: shot.shot_id,
          stage,
          reason: `rejected ${stage} ×${revisionsSoFar} ≥ cap ${criticCap} — HALT + escalate Director`,
        });
        continue;
      }
      actions.push({
        kind: 'refire',
        shotId: shot.shot_id,
        stage,
        assetId: up.asset_id,
        reason: `rejected ${stage} — re-render from the APPROVED ${upstream} (revision ${revisionsSoFar + 1}/${criticCap})`,
      });
    }

    // ── Failure-spine Slice 3: mechanical refire of FAILED cells ─────────────
    // A stage whose generation FAILED left an EMPTY cell (status:null) carrying a
    // failure_count (state-matrix stamps it from agent_failed events). This is a
    // SEPARATE pass from the REVIEW loop above — a failed cell never reached
    // REVIEW. Re-drive it up to recoveryCap times (recovers a transient provider
    // outage that cleared later); past the cap, HALT + escalate — a logical block
    // (e.g. a plan stuck in REVISION) re-fails and lands here, so the cap converges
    // it to the Director instead of looping forever. Reuses the same
    // excluded/reserved/in-plan guards at the top of this shot loop.
    for (const stage of STAGE_ORDER) {
      const cell = shot.stages[stage];
      if (cell.status !== null) continue; // only never-produced cells
      if ((cell.failure_count ?? 0) === 0) continue; // only ones that actually failed
      const key = signalKey(shot.shot_id, stage);
      const refireCount = refireCounts.get(key) ?? 0;

      // Money (executor) stages re-execute an APPROVED upstream plan → need its
      // asset_id. Authoring stages (ref_plan/shot_plan) re-run from scratch. If a
      // money stage has no APPROVED upstream, the real gap is upstream, not here.
      const isExecutorStage = stage === 'ref_image' || stage === 'video';
      let planAssetId: string | undefined;
      if (isExecutorStage) {
        const upstream = UPSTREAM_OF[stage];
        const up = upstream ? shot.stages[upstream] : null;
        if (!up || up.status !== 'APPROVED' || !up.asset_id) continue;
        planAssetId = up.asset_id;
      }

      // A DETERMINISTIC failure (billing wall / stale continuity anchor) re-reads
      // the same state and returns the same verdict — a refire cannot recover it,
      // it can only spend. On S20-E01 (2026-07-31) the stale-anchor case was
      // "recovered" into five PAID re-renders that nobody asked for. Straight to
      // the Director, without consuming the recovery budget.
      if (cell.failure_terminal) {
        actions.push({
          kind: 'halt',
          shotId: shot.shot_id,
          stage,
          reason: `${cell.blocked_reason ?? 'терминальный отказ'} — ретрай не поможет, нужно решение Директора`,
        });
      } else if (refireCount < recoveryCap) {
        actions.push({
          kind: 'refire',
          shotId: shot.shot_id,
          stage,
          assetId: planAssetId,
          reason: `generation failed ×${cell.failure_count} — mechanical refire ${refireCount + 1}/${recoveryCap}`,
        });
      } else {
        actions.push({
          kind: 'halt',
          shotId: shot.shot_id,
          stage,
          reason: `generation failed, recovery ×${refireCount} ≥ cap ${recoveryCap} — HALT + escalate Director`,
        });
      }
    }
  }

  // Stitch: every LIVE shot's video APPROVED AND music present AND no current
  // final cut yet → assemble. Re-evaluated on ANY change (incl. exclude), which
  // is exactly what the narrow VID-shot-only stitch gate in next-events could
  // not do (E14 needed a manual stitch after an exclude).
  const liveShots = matrix.shots.filter((s) => !s.excluded);
  const allVideosApproved =
    liveShots.length > 0 && liveShots.every((s) => s.stages.video.status === 'APPROVED');
  const musicPresent = matrix.music.status === 'APPROVED';
  const finalCutDone = matrix.final_cut.status !== null;
  if (allVideosApproved && musicPresent && !finalCutDone) {
    actions.push({ kind: 'stitch', reason: 'all live shots approved + music present' });
  } else if (allVideosApproved && !musicPresent && !finalCutDone) {
    actions.push({
      kind: 'wait',
      shotId: null,
      stage: null,
      reason: 'all shots approved but no APPROVED music — stitch withheld',
    });
  }

  return actions;
}
