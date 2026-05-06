// ──────────────────────────────────────────────────────────────────────────────
// lib/api/vgen-cancel.ts
// VGEN kill-switch — Director may cancel an in-flight VGEN fan-out between
// shots. The runner reads this flag at the top of each shot iteration; if set,
// the in-flight shot completes (≈$0.20 wasted), then subsequent shots abort.
//
// Storage:
//   `app_config.scope='app', key='vgen_cancel:<episode_id>'` (jsonb).
//   Per-episode keying so cancelling one episode doesn't kill another.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';

const CANCEL_KEY_PREFIX = 'vgen_cancel:';

function cancelKey(episodeId: string): string {
  return `${CANCEL_KEY_PREFIX}${episodeId}`;
}

/** True iff Director has set the cancel flag for this episode's VGEN run. */
export async function isVgenCancelled(
  supabase: SupabaseClient<Database>,
  episodeId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('app_config')
    .select('value')
    .eq('scope', 'app')
    .eq('key', cancelKey(episodeId))
    .maybeSingle();
  if (!data) return false;
  const raw = (data as { value?: unknown }).value;
  if (raw === true || raw === 'true') return true;
  if (raw && typeof raw === 'object' && 'cancelled' in raw) {
    return (raw as { cancelled?: unknown }).cancelled === true;
  }
  return false;
}

/** Set the cancel flag; runner picks it up at the next shot boundary. */
export async function setVgenCancel(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  by: string,
): Promise<void> {
  const value = {
    cancelled: true,
    by,
    at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('app_config')
    .upsert(
      {
        scope: 'app',
        key: cancelKey(episodeId),
        value: value as unknown as Database['public']['Tables']['app_config']['Insert']['value'],
        source: 'ui_edit',
      } as never,
      { onConflict: 'scope,key' },
    );
  if (error) {
    throw new Error(`setVgenCancel failed: ${error.message}`);
  }
}

/** Clear the flag. Called when a fresh VGEN run starts. */
export async function clearVgenCancel(
  supabase: SupabaseClient<Database>,
  episodeId: string,
): Promise<void> {
  const { error } = await supabase
    .from('app_config')
    .delete()
    .eq('scope', 'app')
    .eq('key', cancelKey(episodeId));
  if (error) {
    throw new Error(`clearVgenCancel failed: ${error.message}`);
  }
}
