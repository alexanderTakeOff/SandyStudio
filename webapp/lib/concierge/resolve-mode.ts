// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/resolve-mode.ts
// SINGLE source of truth for the concierge's effective governance mode.
//
// Director 2026-06-15 incident: the same E10 episode read as three different
// modes — interactive chat said "Mode 1" (client-sent body.mode, default 1),
// the UI badge said "Mode 2" (app_config.governance_mode_default), and the
// pipeline ran "Mode 4" (episode.governance_mode). Three stores, no shared
// precedence. This helper collapses the read to ONE precedence chain so every
// concierge surface (interactive chat, auto-react, chat-internal) reports the
// SAME mode the pipeline actually runs under:
//
//   1. episode.governance_mode   — the per-episode override; THE authority when
//                                   Polina is working on an episode.
//   2. app_config.governance_mode_default — global default (what the UI badge
//                                   shows) when no episode is in scope.
//   3. '1' (MANUAL)              — safe fallback.
//
// Note: it never reads thread.active_mode as an authority — that per-thread
// field was the stale value driving the "Mode 1" self-report drift.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';
import type { ConciergeMode } from './types';

function asMode(value: unknown): ConciergeMode | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 4 ? (String(n) as ConciergeMode) : null;
}

export async function resolveEffectiveConciergeMode(
  supabase: SupabaseClient<Database>,
  episodeId: string | null,
): Promise<ConciergeMode> {
  if (episodeId) {
    const { data } = await supabase
      .from('episodes')
      .select('governance_mode')
      .eq('id', episodeId)
      .maybeSingle();
    const m = asMode((data as { governance_mode?: number | null } | null)?.governance_mode);
    if (m) return m;
  }
  const { data: cfg } = await supabase
    .from('app_config')
    .select('value')
    .eq('scope', 'system')
    .eq('key', 'governance_mode_default')
    .maybeSingle();
  return asMode((cfg as { value?: unknown } | null)?.value) ?? '1';
}
