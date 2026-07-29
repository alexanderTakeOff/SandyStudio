// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/reconcile-execute.ts
//
// Фаза 2b (docs/AUTONOMY-IMPLEMENTATION-PLAN.md) — the reconciler EXECUTOR.
//
// `reconcileEpisode` reads the state matrix + critic signals, asks the pure
// decision core (planReconcileActions) what to do, and APPLIES the actions by
// reusing the EXACT primitives the Director-approve route + Mode-4 auto-chain
// already use — `demoteSiblingApproved` + a status flip + `computeNextEvents`
// (NOT a second DAG). Idempotent: an already-APPROVED cell yields no action, so
// it is safe to call on any event / repeatedly.
//
// It performs DB mutations (status flips) but does NOT itself dispatch Inngest
// events — it RETURNS the cascade events for the caller (the /reconcile route or
// a future conductor/watchdog) to send. That keeps this unit-testable without an
// Inngest runtime, and keeps event dispatch at the IO boundary.
//
// Guarded by the per-episode arm (isReconcilerArmed: metadata.reconciler_armed +
// governance mode 2/3): a no-op mutator until an episode opts in, so the manual
// path is fully preserved. `opts.force` bypasses the arm for explicit calls + tests.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';
import { logEvent } from '../api/events';
import { raiseBlockerOnce } from '../api/blocker-escalation';
import { collectRefCriticNotes, collectShotCriticNotes, mergeRevisionNote } from '../api/critic-notes';
import {
  resolveSlotDescriptor,
  demoteSiblingApproved,
  type AssetForSlot,
} from '../api/single-approved';
import {
  computeNextEvents,
  stageRefireEvent,
  planAlreadyExecuted,
  type AssetForChain,
} from './next-events';
import { getEpisodeStateMatrix } from './state-matrix';
import {
  planReconcileActions,
  collectCriticSignals,
  collectOnModelSignals,
  type ReconcileAction,
} from './reconcile';
import {
  readProductionPlan,
  resolveReservedShots,
  isReconcilerArmed,
} from './production-plan';
import { promptRevisionCap, reconcileRecoveryCap } from './chain-flags';

export interface ReconcileOptions {
  /** Bypass the per-episode arm gate (explicit calls / tests). */
  force?: boolean;
  /** Shots the Director still gates (e.g. pilots). MUST be supplied before a
   *  live run enables auto-advance, else pilots would auto-approve. */
  reservedShots?: Set<string>;
  /** REVISE cap before HALT. Defaults to promptRevisionCap() — the same
   *  number critic-loop uses to coerce REVISE→HALT. */
  criticCap?: number;
  /** Mechanical-refire cap before HALT. Defaults to reconcileRecoveryCap(). */
  recoveryCap?: number;
  /** Principal recorded in the cascade (passed to computeNextEvents). */
  actorUserId?: string;
}

export interface ReconcileResult {
  ran: boolean;
  actions: ReconcileAction[];
  approvedAssetIds: string[];
  events: Array<{ name: string; data: Record<string, unknown> }>;
  halted: Array<{ shotId: string; stage: string; reason: string }>;
  /** On-model FAILs bounced this pass (kept in REVIEW + escalated to the Director). */
  bounced: Array<{ shotId: string; stage: string; reason: string }>;
  /** Plans re-authored this pass (critic REVISE → producing agent re-fired). */
  reauthored: Array<{ shotId: string; stage: string; reason: string }>;
}

const EMPTY: ReconcileResult = {
  ran: false,
  actions: [],
  approvedAssetIds: [],
  events: [],
  halted: [],
  bounced: [],
  reauthored: [],
};

export async function reconcileEpisode(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  opts: ReconcileOptions = {},
): Promise<ReconcileResult> {
  // Read the episode first — the arm gate needs its metadata + governance mode.
  // Coerce mode to a number: the column is an int, but a JSON/string value ('3')
  // can slip in from mocks — resolveGateDecision needs a number.
  const { data: epRow } = await supabase
    .from('episodes')
    .select('metadata, governance_mode')
    .eq('id', episodeId)
    .maybeSingle();
  const episodeMeta = (epRow as { metadata?: unknown } | null)?.metadata;
  const rawMode = (epRow as { governance_mode?: unknown } | null)?.governance_mode;
  const governanceMode = rawMode == null ? null : Number(rawMode);

  if (!opts.force && !isReconcilerArmed(episodeMeta, governanceMode)) return EMPTY;

  const matrix = await getEpisodeStateMatrix(supabase, episodeId);

  const { data: revData } = await supabase
    .from('assets')
    .select('file_type,version,metadata')
    .eq('episode_id', episodeId)
    .like('file_type', 'REV-%');
  const { verdicts, reviseCounts } = collectCriticSignals(
    (revData ?? []) as Array<{ file_type?: string | null; version?: number | null; metadata?: unknown }>,
  );

  // On-model gate: rendered ref images carry a FROZEN on_model.verdict in their own
  // metadata (there is no REV-ref_image row). Fold those into the SAME verdicts map
  // under `${shot}::ref_image` — the planner's on-model branch reads them like any
  // critic signal. Keys never collide (ref_image has no critic REV row).
  const { data: imgData } = await supabase
    .from('assets')
    .select('version,metadata')
    .eq('episode_id', episodeId)
    .like('file_type', 'IMG-episode_ref%');
  for (const [k, v] of collectOnModelSignals(
    (imgData ?? []) as Array<{ version?: number | null; metadata?: unknown }>,
  )) {
    verdicts.set(k, v);
  }

  // Failure-spine Slice 3: count our OWN refires (reconcile/refire events) per
  // shot×stage — the precise cap counter, kept separate from the noisy per-attempt
  // agent_failed events (Slice 2 writes 3 of those per invocation). Best-effort: a
  // read error yields an empty map, so the pass simply treats nothing as refired.
  const refireCounts = new Map<string, number>();
  const { data: refireData } = await supabase
    .from('activity_events')
    .select('metadata')
    .eq('episode_id', episodeId)
    .eq('event_type', 'reconcile/refire');
  for (const row of (refireData ?? []) as Array<{ metadata?: unknown }>) {
    const meta = (row.metadata ?? null) as { shot_id?: unknown; stage?: unknown } | null;
    const shotId = meta && typeof meta.shot_id === 'string' ? meta.shot_id : null;
    const stage = meta && typeof meta.stage === 'string' ? meta.stage : null;
    if (!shotId || !stage) continue;
    const key = `${shotId}::${stage}`;
    refireCounts.set(key, (refireCounts.get(key) ?? 0) + 1);
  }

  // REVISE→re-author idempotency (Phase 2+): the set of plan asset_ids we've
  // ALREADY re-authored (one `reconcile/reauthor` per plan version). Keying on the
  // REVISION plan's own asset_id means re-running reconcile on the same still-in-
  // REVISION plan does NOT re-fire the author; a fresh REVISE produces a new plan
  // version (new asset_id) that is re-authored exactly once in turn.
  const reauthoredAssetIds = new Set<string>();
  const { data: reauthorData } = await supabase
    .from('activity_events')
    .select('metadata')
    .eq('episode_id', episodeId)
    .eq('event_type', 'reconcile/reauthor');
  for (const row of (reauthorData ?? []) as Array<{ metadata?: unknown }>) {
    const aid = (row.metadata as { asset_id?: unknown } | null)?.asset_id;
    if (typeof aid === 'string') reauthoredAssetIds.add(aid);
  }

  const plan = readProductionPlan(episodeMeta);
  // SAFETY: default reservedShots to the pilot set (when 'pilots' is reserved) so
  // pilots are never auto-approved past the Director's visual gate. An explicit
  // opts.reservedShots overrides (tests / a conductor that computed its own set).
  const reservedShots = opts.reservedShots ?? resolveReservedShots(episodeMeta);

  const actions = planReconcileActions({
    matrix,
    plan,
    verdicts,
    reviseCounts,
    refireCounts,
    reservedShots,
    // 2026-07-19 — the re-author gate must use the SAME number the critic loop
    // uses to coerce REVISE→HALT (promptRevisionCap, default 2). It read
    // planRegenCap (3) — a different concept (per-plan re-fires) — so the
    // reconciler kept re-authoring for one more round after the critic had
    // already given up on the plan.
    criticCap: opts.criticCap ?? promptRevisionCap(),
    recoveryCap: opts.recoveryCap ?? reconcileRecoveryCap(),
    governanceMode,
  });

  const actorUserId = opts.actorUserId ?? 'exec-dir-ai';
  const events: Array<{ name: string; data: Record<string, unknown> }> = [];
  const approvedAssetIds: string[] = [];
  const halted: Array<{ shotId: string; stage: string; reason: string }> = [];
  const bounced: Array<{ shotId: string; stage: string; reason: string }> = [];
  const reauthored: Array<{ shotId: string; stage: string; reason: string }> = [];

  for (const action of actions) {
    if (action.kind === 'approve') {
      const cascade = await executeApprove(supabase, action.assetId, actorUserId);
      approvedAssetIds.push(action.assetId);
      events.push(...cascade);
      await logEvent(supabase, {
        event_type: 'reconcile/auto-approved',
        severity: 'info',
        title: `Auto-approved ${action.shotId} · ${action.stage}`,
        description: action.reason,
        actor: 'exec-dir-ai',
        episode_id: episodeId,
        metadata: { shot_id: action.shotId, stage: action.stage, asset_id: action.assetId, reason: 'RECONCILE_AUTO_APPROVE' },
      });
    } else if (action.kind === 'stitch') {
      events.push({ name: 'sandystudio/exec-stitch/assemble-episode', data: { episodeId } });
    } else if (action.kind === 'refire') {
      // Failure-spine Slice 3: mechanically re-drive a FAILED stage. Reuse the
      // canonical stage→event map (single source, shared with computeNextEvents);
      // the emitted event flows out with the rest for the caller to dispatch. Log
      // reconcile/refire so the NEXT pass counts it against the recovery cap.
      //
      // Per-Plan guard on the MONEY stages — the same one computeNextEvents applies
      // to this exact edge: never render a plan that already produced an artifact.
      // For a FAILED (never-produced) cell it is always false (no artifact exists),
      // so the failure spine is untouched; for a REJECTED cell it is the load-bearing
      // idempotency — the rejected render carries the OLD plan's id, so only a plan
      // NEWER than it renders, exactly once, and the plan being rejected is never
      // re-rolled at $-per-attempt.
      const outputPrefix: 'IMG-episode_ref' | 'VID-shot' | null =
        action.stage === 'ref_image'
          ? 'IMG-episode_ref'
          : action.stage === 'video'
            ? 'VID-shot'
            : null;
      if (
        outputPrefix &&
        action.assetId &&
        (await planAlreadyExecuted(supabase, episodeId, outputPrefix, action.assetId))
      ) {
        continue; // this plan already rendered — nothing to re-drive
      }
      const evt = stageRefireEvent(action.stage, {
        episodeId,
        shotId: action.shotId,
        planAssetId: action.assetId ?? null,
      });
      if (evt) {
        events.push(evt);
        await logEvent(supabase, {
          event_type: 'reconcile/refire',
          severity: 'info',
          title: `Refire ${action.shotId} · ${action.stage}`,
          description: action.reason,
          actor: 'exec-dir-ai',
          episode_id: episodeId,
          metadata: { shot_id: action.shotId, stage: action.stage, reason: 'RECONCILE_REFIRE' },
        });
      }
    } else if (action.kind === 'halt') {
      halted.push({ shotId: action.shotId, stage: action.stage, reason: action.reason });
      // Internal reconcile audit row (kept for the reconcile/* feed) …
      await logEvent(supabase, {
        event_type: 'reconcile/halt',
        severity: 'warning',
        title: `HALT ${action.shotId} · ${action.stage} — needs Director`,
        description: action.reason,
        actor: 'exec-dir-ai',
        episode_id: episodeId,
        metadata: { shot_id: action.shotId, stage: action.stage, reason: 'RECONCILE_HALT' },
      });
      // … + Failure-spine Slice 4a: reconcile/halt is NOT actionable and NOT in
      // the Director Inbox — it reached nobody. Route the HALT to the Director via
      // the shared blocker vessel (deduped per shot+stage), so an armed episode
      // that hits a wall surfaces to the Director instead of silently parking.
      await raiseBlockerOnce(supabase, {
        episodeId,
        stage: `reconcile_halt:${action.stage}`,
        shotId: action.shotId,
        actor: 'exec-dir-ai',
        title: `Reconciler HALT — needs Director (${action.stage} · shot ${action.shotId})`,
        description: action.reason,
        metadata: { shot_id: action.shotId, stage: action.stage, reason: 'RECONCILE_HALT' },
      });
    } else if (action.kind === 'bounce') {
      // On-model FAIL: leave the cell in REVIEW (NO executeApprove) and escalate to
      // the Director, mirroring the halt path. `raiseBlockerOnce` dedups per
      // shot+stage, so re-emitting each pass over the same FAIL never spams the Inbox.
      bounced.push({ shotId: action.shotId, stage: action.stage, reason: action.reason });
      await logEvent(supabase, {
        event_type: 'reconcile/bounce',
        severity: 'warning',
        title: `Bounce ${action.shotId} · ${action.stage} — on-model FAIL, needs Director`,
        description: action.reason,
        actor: 'exec-dir-ai',
        episode_id: episodeId,
        metadata: { shot_id: action.shotId, stage: action.stage, asset_id: action.assetId, reason: 'RECONCILE_BOUNCE' },
      });
      await raiseBlockerOnce(supabase, {
        episodeId,
        stage: `on_model_fail:${action.stage}`,
        shotId: action.shotId,
        actor: 'exec-dir-ai',
        title: `On-model FAIL — needs Director (${action.stage} · shot ${action.shotId})`,
        description: action.reason,
        metadata: { shot_id: action.shotId, stage: action.stage, asset_id: action.assetId, reason: 'RECONCILE_BOUNCE' },
      });
    } else if (action.kind === 'reauthor') {
      // Critic REVISE → re-author the plan via its producing agent, with the
      // critic's notes as hard acceptance criteria. Idempotent per plan version:
      // skip if this exact REVISION plan was already re-authored. The event is
      // pushed to `events` for the caller to dispatch (same contract as the cascade).
      if (!reauthoredAssetIds.has(action.assetId)) {
        reauthoredAssetIds.add(action.assetId); // guard within this pass too
        const isRef = action.stage === 'ref_plan';
        // Critic notes are best-effort: a collection hiccup must not block the
        // re-author (the Animator/Designer injects revisionNote as hard criteria
        // when present; without it, it re-authors fresh and the critic re-judges,
        // still bounded by the revision cap).
        let bullets: string[] = [];
        try {
          bullets = isRef
            ? await collectRefCriticNotes(supabase, episodeId, action.shotId)
            : await collectShotCriticNotes(supabase, episodeId, action.shotId);
        } catch {
          /* leave notes empty — re-author still fires */
        }
        const revisionNote = mergeRevisionNote(null, bullets);
        events.push({
          name: isRef ? 'sandystudio/exec-eref-designer/plan' : 'sandystudio/exec-vanim/plan',
          data: { episodeId, shotId: action.shotId, revisionNote },
        });
        reauthored.push({ shotId: action.shotId, stage: action.stage, reason: action.reason });
        await logEvent(supabase, {
          event_type: 'reconcile/reauthor',
          severity: 'info',
          title: `Re-author ${action.shotId} · ${action.stage} — critic REVISE`,
          description: action.reason,
          actor: 'exec-dir-ai',
          episode_id: episodeId,
          metadata: { shot_id: action.shotId, stage: action.stage, asset_id: action.assetId, reason: 'RECONCILE_REAUTHOR' },
        });
      }
    }
    // 'wait' → nothing to do this pass.
  }

  return { ran: true, actions, approvedAssetIds, events, halted, bounced, reauthored };
}

/**
 * Approve one MECHANICAL asset exactly as the Director-approve route does:
 * demote the prior APPROVED sibling of its slot, flip it APPROVED, then compute
 * the forward cascade. Returns the cascade events (caller dispatches them).
 */
async function executeApprove(
  supabase: SupabaseClient<Database>,
  assetId: string,
  actorUserId: string,
): Promise<Array<{ name: string; data: Record<string, unknown> }>> {
  const { data: row } = await supabase
    .from('assets')
    .select('id,filename,file_type,episode_id,series_id,metadata,content,updated_at,status')
    .eq('id', assetId)
    .maybeSingle();
  if (!row) return [];
  const asset = row as {
    id: string;
    filename?: string | null;
    file_type?: string | null;
    episode_id?: string | null;
    series_id?: string | null;
    metadata?: unknown;
    content?: string | null;
    updated_at?: string | null;
  };

  // Demote the prior APPROVED sibling of this slot (shared helper — same as the
  // approve route + Mode-4), so the per-slot unique index is never violated.
  const slot = resolveSlotDescriptor(asset as AssetForSlot);
  if (slot) {
    await demoteSiblingApproved(supabase, { slot, currentId: assetId });
  }
  await supabase.from('assets').update({ status: 'APPROVED' } as never).eq('id', assetId);

  const assetForChain: AssetForChain = {
    id: asset.id,
    filename: asset.filename ?? assetId,
    file_type: asset.file_type ?? '',
    episode_id: asset.episode_id ?? null,
    updated_at: asset.updated_at ?? null,
    metadata: asset.metadata,
    content: asset.content ?? null,
  };
  return computeNextEvents(supabase, assetForChain, actorUserId);
}
