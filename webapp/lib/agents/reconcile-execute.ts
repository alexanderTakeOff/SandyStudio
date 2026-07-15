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
// Guarded by MECHANICS_AUTO_ADVANCE (default OFF): a no-op mutator until an
// episode opts in, so the manual path is fully preserved. `opts.force` bypasses
// the flag for explicit calls + tests.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';
import { logEvent } from '../api/events';
import {
  resolveSlotDescriptor,
  demoteSiblingApproved,
  type AssetForSlot,
} from '../api/single-approved';
import { computeNextEvents, type AssetForChain } from './next-events';
import { getEpisodeStateMatrix } from './state-matrix';
import {
  planReconcileActions,
  collectCriticSignals,
  type ReconcileAction,
} from './reconcile';
import {
  readProductionPlan,
  resolveReservedShots,
  isReconcilerArmed,
} from './production-plan';
import { planRegenCap } from './chain-flags';

export interface ReconcileOptions {
  /** Bypass the MECHANICS_AUTO_ADVANCE flag (explicit calls / tests). */
  force?: boolean;
  /** Shots the Director still gates (e.g. pilots). MUST be supplied before a
   *  live run enables auto-advance, else pilots would auto-approve. */
  reservedShots?: Set<string>;
  /** REVISE cap before HALT. Defaults to planRegenCap(). */
  criticCap?: number;
  /** Principal recorded in the cascade (passed to computeNextEvents). */
  actorUserId?: string;
}

export interface ReconcileResult {
  ran: boolean;
  actions: ReconcileAction[];
  approvedAssetIds: string[];
  events: Array<{ name: string; data: Record<string, unknown> }>;
  halted: Array<{ shotId: string; stage: string; reason: string }>;
}

const EMPTY: ReconcileResult = {
  ran: false,
  actions: [],
  approvedAssetIds: [],
  events: [],
  halted: [],
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
    reservedShots,
    criticCap: opts.criticCap ?? planRegenCap(),
    governanceMode,
  });

  const actorUserId = opts.actorUserId ?? 'exec-dir-ai';
  const events: Array<{ name: string; data: Record<string, unknown> }> = [];
  const approvedAssetIds: string[] = [];
  const halted: Array<{ shotId: string; stage: string; reason: string }> = [];

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
    } else if (action.kind === 'halt') {
      halted.push({ shotId: action.shotId, stage: action.stage, reason: action.reason });
      await logEvent(supabase, {
        event_type: 'reconcile/halt',
        severity: 'warning',
        title: `HALT ${action.shotId} · ${action.stage} — needs Director`,
        description: action.reason,
        actor: 'exec-dir-ai',
        episode_id: episodeId,
        metadata: { shot_id: action.shotId, stage: action.stage, reason: 'RECONCILE_HALT' },
      });
    }
    // 'wait' → nothing to do this pass.
  }

  return { ran: true, actions, approvedAssetIds, events, halted };
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
