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
  // Failure-spine Slice 3: re-drive a FAILED (never-produced) cell. `assetId` is
  // the UPSTREAM plan's id for money stages (ref_image/video), absent for the
  // authoring stages (ref_plan/shot_plan) which re-run from scratch.
  | { kind: 'refire'; shotId: string; stage: StageName; assetId?: string; reason: string };

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
        // No enforcing critic → a CREATIVE artifact (rendered ref image / video).
        // Auto-advance ONLY in Mode 3 (DELEGATED — Polina is the delegate). Mode 1
        // (MANUAL) and Mode 2 (HYBRID — pause & eyeball) keep the Director's hand on
        // every un-critiqued render. (When VISUAL_CRITIC_ENFORCE lands, this stage
        // gains a critic and moves to the mechanical branch above automatically.)
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

      if (refireCount < recoveryCap) {
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
