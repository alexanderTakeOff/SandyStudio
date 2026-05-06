// ──────────────────────────────────────────────────────────────────────────────
// lib/api/vgen-pilot-state.ts
// Tracks the VGEN Pilot Pass state machine for one episode (Phase 1 of the
// Universal Video Editor Surface — purrfect-stirring-hollerith plan).
//
// State machine:
//   NONE              — no run in flight (default before any trigger,
//                       and after fan-out completes / cancel)
//   PENDING_REVIEW    — pilot 1-2 shots generated; Director must approve direction
//   FANOUT_RUNNING    — Director clicked "Approve Direction & Fan Out";
//                       remaining shots running concurrently (limit 3)
//   COMPLETE          — fan-out finished; all shots are REVIEW/APPROVED
//   CANCELLED         — Director cancelled; in-flight shot completed, rest aborted
//
// Storage:
//   Mirror eref-pilot-state.ts — `app_config.scope='app',
//   key='vgen_pilot_state:<episode_id>'` so we don't depend on the still-pending
//   `episodes.metadata` migration.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';

export type VGENPilotState =
  | 'NONE'
  | 'PENDING_REVIEW'
  | 'FANOUT_RUNNING'
  | 'COMPLETE'
  | 'CANCELLED';

export const VGEN_VALID_PILOT_STATES: ReadonlySet<VGENPilotState> = new Set([
  'NONE',
  'PENDING_REVIEW',
  'FANOUT_RUNNING',
  'COMPLETE',
  'CANCELLED',
]);

const KEY_PREFIX = 'vgen_pilot_state:';

function pilotKey(episodeId: string): string {
  return `${KEY_PREFIX}${episodeId}`;
}

export async function getVgenPilotState(
  supabase: SupabaseClient<Database>,
  episodeId: string,
): Promise<VGENPilotState> {
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
  if (s && VGEN_VALID_PILOT_STATES.has(s as VGENPilotState)) {
    return s as VGENPilotState;
  }
  return 'NONE';
}

export async function setVgenPilotState(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  state: VGENPilotState,
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
    throw new Error(`setVgenPilotState failed: ${error.message}`);
  }
}
