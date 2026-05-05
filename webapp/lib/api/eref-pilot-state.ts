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
//   `episodes` table has no `metadata` column today; spec called for
//   `episodes.metadata.eref_pilot_state` but adding a column would require
//   a separate migration outside Track A's scope. Mirroring the cancel-token
//   approach, we use `app_config.scope='app', key='eref_pilot_state:<episode_id>'`.
//   This keeps Track A self-contained while preserving identical UX semantics.
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
  const value = { state, at: new Date().toISOString() };
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
}
