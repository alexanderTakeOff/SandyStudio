// ──────────────────────────────────────────────────────────────────────────────
// lib/api/style-guardian-config.ts
// Read the Style Guardian strictness setting from `app_config`.
//
// Two modes:
//   warn          — display verdict in UI; NEVER block. (default while system matures)
//   strict        — FAIL blocks the action; Director may override per-call
//
// A third mode, `auto_rewrite`, silently swapped the prompt for the Guardian's
// ≤800-char `suggested_prompt`. Removed 2026-07-29 (E33 P0 #1): it threw away the
// Director-approved Plan wholesale. The Guardian reports; it does not edit. A row
// still holding the old value degrades to the `warn` default below — no migration.
//
// Setting lives at app_config.scope='app', key='style_guardian_mode', value=jsonb-string.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';

export type StyleGuardianMode = 'warn' | 'strict';
export const DEFAULT_STYLE_GUARDIAN_MODE: StyleGuardianMode = 'warn';

const VALID_MODES: ReadonlySet<StyleGuardianMode> = new Set(['warn', 'strict']);

export async function getStyleGuardianMode(
  supabase: SupabaseClient<Database>,
): Promise<StyleGuardianMode> {
  const { data } = await supabase
    .from('app_config')
    .select('value')
    .eq('scope', 'app')
    .eq('key', 'style_guardian_mode')
    .maybeSingle();
  if (!data) return DEFAULT_STYLE_GUARDIAN_MODE;
  const raw = (data as { value?: unknown }).value;
  // Stored as JSON — could be string ("warn") or {value: "warn"}; tolerate both.
  let s: string | null = null;
  if (typeof raw === 'string') s = raw;
  else if (raw && typeof raw === 'object' && 'value' in raw && typeof (raw as { value?: unknown }).value === 'string') {
    s = (raw as { value: string }).value;
  }
  if (s && VALID_MODES.has(s as StyleGuardianMode)) return s as StyleGuardianMode;
  return DEFAULT_STYLE_GUARDIAN_MODE;
}
