// ──────────────────────────────────────────────────────────────────────────────
// lib/api/eref-pilot-state.ts
// Tracks the EREF v2 Pilot Pass state machine for one episode.
//
// State machine (technology.md §4 Pilot+Fan-out+Kill switch):
//   NONE              — no run in flight (default before any trigger,
//                       and after fan-out completes so UI shows review mode)
//   PENDING_REVIEW    — pilot 2 shots generated; Director must approve direction
//   FANOUT_RUNNING    — Director clicked "Approve Direction & Fan Out";
//                       remaining shots running sequentially
//   FANOUT_COMPLETE   — all shots persisted; Director reviews each per-image
//
// Storage note:
//   Authoritative state lives in `app_config.scope='app',
//   key='eref_pilot_state:<episode_id>'` (server reads here). The UI's
//   EREFPilotPillbar reads `episodes.metadata.eref_pilot_state` (browser
//   has no app_config access), so setPilotState also writes the same
//   value into the episode metadata as a UI mirror. Mirror failures are
//   non-fatal — server logic still works off the app_config row.
//   (Sprint φ post-merge 2026-05-18: previously the runner's
//   PENDING_REVIEW + FANOUT_COMPLETE transitions never reached the
//   metadata mirror, making the UI think fan-out was still running long
//   after it finished.)
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';

export type EREFPilotState =
  | 'NONE'
  | 'PENDING_REVIEW'
  | 'FANOUT_RUNNING'
  | 'FANOUT_COMPLETE';

export const VALID_PILOT_STATES: ReadonlySet<EREFPilotState> = new Set([
  'NONE',
  'PENDING_REVIEW',
  'FANOUT_RUNNING',
  'FANOUT_COMPLETE',
]);

const KEY_PREFIX = 'eref_pilot_state:';

function pilotKey(episodeId: string): string {
  return `${KEY_PREFIX}${episodeId}`;
}

export async function getPilotState(
  supabase: SupabaseClient<Database>,
  episodeId: string,
): Promise<EREFPilotState> {
  const { data } = await supabase
    .from('app_config')
    .select('value')
    .eq('scope', 'app')
    .eq('key', pilotKey(episodeId))
    .maybeSingle();
  if (!data) return 'NONE';
  const raw = (data as { value?: unknown }).value;
  let s: string | null = null;
  if (typeof raw === 'string') s = raw;
  else if (raw && typeof raw === 'object' && 'state' in raw) {
    const v = (raw as { state?: unknown }).state;
    if (typeof v === 'string') s = v;
  }
  if (s && VALID_PILOT_STATES.has(s as EREFPilotState)) {
    return s as EREFPilotState;
  }
  return 'NONE';
}

export async function setPilotState(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  state: EREFPilotState,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const value = { state, at: nowIso };
  const { error } = await supabase
    .from('app_config')
    .upsert(
      {
        scope: 'app',
        key: pilotKey(episodeId),
        value: value as unknown as Database['public']['Tables']['app_config']['Insert']['value'],
        source: 'ui_edit',
      } as never,
      { onConflict: 'scope,key' },
    );
  if (error) {
    throw new Error(`setPilotState failed: ${error.message}`);
  }

  // UI mirror — read-merge-write the episode.metadata.eref_pilot_state field
  // so EREFPilotPillbar (browser-side, has no app_config access) sees the
  // transition immediately. Mirror failures must NOT bubble up: app_config
  // is the authoritative source; the metadata copy is best-effort UX.
  try {
    const { data: row } = await supabase
      .from('episodes')
      .select('metadata')
      .eq('id', episodeId)
      .maybeSingle();
    const prev = ((row as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
    const next = {
      ...prev,
      eref_pilot_state: state,
      eref_pilot_state_at: nowIso,
    };
    await supabase
      .from('episodes')
      .update({ metadata: next as never })
      .eq('id', episodeId);
  } catch {
    // swallow — non-fatal UI mirror
  }
}
