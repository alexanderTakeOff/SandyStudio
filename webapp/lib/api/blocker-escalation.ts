// ──────────────────────────────────────────────────────────────────────────────
// lib/api/blocker-escalation.ts
//
// The single escalation vessel for TERMINAL / STUCK pipeline states — the
// failure-spine's one Director-facing surface (2026-07-16, E29 stall root fix).
//
// A `blocker_raised` activity_event is already wired end-to-end: it is actionable
// (event-actionable.ts → wakes Polina) AND surfaced in the Director Inbox
// (app/api/director/inbox/route.ts) as a `blocked` item with a RESOLVE CTA. Every
// dead-end in the pipeline (critic cap-HALT, terminal agent failure, reconcile
// HALT) routes here instead of into a passive feed row that reaches nobody.
//
// De-dup by a stable `blocker_key` (stage + shot) so a shot that keeps hitting the
// same wall raises ONE unresolved Inbox item, not a storm. Best-effort: never
// throws into the caller — a failed escalation must not crash the pipeline.
// ──────────────────────────────────────────────────────────────────────────────

import type { ServerSupabaseClient } from './auth';
import { logEvent } from './events';

export interface BlockerInput {
  episodeId: string;
  /** Stage/reason slug — part of the dedup key (e.g. 'shot_plan_cap_halt',
   *  'agent_failed', 'reconcile_halt'). */
  stage: string;
  /** Shot the blocker is about, when shot-scoped. Part of the dedup key. */
  shotId?: string | null;
  /** Asset that is stuck (the plan / output), for the Inbox deep-link. */
  assetId?: string | null;
  /** Agent/actor that surfaced the blocker. */
  actor?: string | null;
  title: string;
  description?: string;
  /** Extra metadata merged into the event (blocker_key/stage/shot_id are added). */
  metadata?: Record<string, unknown>;
}

export type BlockerOutcome = 'raised' | 'deduped' | 'error';

/**
 * Raise a Director-actionable `blocker_raised` — but only ONCE per unresolved
 * (episode, stage, shot). Reuses `logEvent` (activity_events insert + the
 * actionable pa/notify wake + Inbox surfacing). Returns 'deduped' when an
 * unresolved blocker with the same key already exists.
 */
export async function raiseBlockerOnce(
  supabase: ServerSupabaseClient,
  input: BlockerInput,
): Promise<BlockerOutcome> {
  const blockerKey = `${input.stage}:${input.shotId ?? ''}`;

  // Dedup: skip if an unresolved blocker with this key already sits in the Inbox.
  // Filter in JS (episode-scoped fetch is bounded — few blockers per episode) to
  // avoid the fragile PostgREST `metadata->>` jsonb filter syntax.
  try {
    const { data: existing } = await supabase
      .from('activity_events')
      .select('id, metadata, resolved_at')
      .eq('event_type', 'blocker_raised')
      .eq('episode_id', input.episodeId);
    const dup = (existing ?? []).some((r) => {
      const row = r as { resolved_at?: unknown; metadata?: { blocker_key?: unknown } | null };
      return row.resolved_at == null && row.metadata?.blocker_key === blockerKey;
    });
    if (dup) return 'deduped';
  } catch {
    // Fail open — a failed dedup read must not silence the escalation. Worst
    // case is a duplicate Inbox item, which the Director can resolve.
  }

  try {
    await logEvent(supabase, {
      event_type: 'blocker_raised',
      severity: 'error',
      title: input.title,
      description: input.description ?? null,
      actor: input.actor ?? null,
      episode_id: input.episodeId,
      asset_id: input.assetId ?? null,
      metadata: {
        ...(input.metadata ?? {}),
        blocker_key: blockerKey,
        stage: input.stage,
        shot_id: input.shotId ?? null,
      },
    });
    return 'raised';
  } catch {
    return 'error';
  }
}
