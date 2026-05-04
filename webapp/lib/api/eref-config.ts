// ──────────────────────────────────────────────────────────────────────────────
// lib/api/eref-config.ts
// Read EREF v2 runtime config from `app_config`.
//
// Two settings drive the new pipeline:
//   - `eref_provider`        — which MultiImageGenProvider runs by default.
//                              Director's QC console (Phase F) can override
//                              per-shot via "SWITCH PROVIDER & REGENERATE".
//   - `eref_upscale_enabled` — gate the 4K upscale step. Default true.
//
// Both follow the Style Guardian config pattern (scope='app', jsonb value).
// On first read of an unset key the default is returned and no row is created
// — first write upserts. Mirrors how `getStyleGuardianMode` works.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';

/** Allowed values for `eref_provider`. Add new providers here when wiring more. */
export type EREFProviderId =
  | 'openai-edits-multi'
  | 'flux-pro-1.1-ultra';

export const DEFAULT_EREF_PROVIDER: EREFProviderId = 'openai-edits-multi';
export const DEFAULT_EREF_UPSCALE_ENABLED = true;

const VALID_PROVIDERS: ReadonlySet<EREFProviderId> = new Set([
  'openai-edits-multi',
  'flux-pro-1.1-ultra',
]);

function readJsonbScalar(raw: unknown): string | boolean | null {
  if (typeof raw === 'string' || typeof raw === 'boolean') return raw;
  if (raw && typeof raw === 'object' && 'value' in raw) {
    const v = (raw as { value?: unknown }).value;
    if (typeof v === 'string' || typeof v === 'boolean') return v;
  }
  return null;
}

export async function getEREFProvider(
  supabase: SupabaseClient<Database>,
): Promise<EREFProviderId> {
  const { data } = await supabase
    .from('app_config')
    .select('value')
    .eq('scope', 'app')
    .eq('key', 'eref_provider')
    .maybeSingle();
  if (!data) return DEFAULT_EREF_PROVIDER;
  const raw = (data as { value?: unknown }).value;
  const s = readJsonbScalar(raw);
  if (typeof s === 'string' && VALID_PROVIDERS.has(s as EREFProviderId)) {
    return s as EREFProviderId;
  }
  return DEFAULT_EREF_PROVIDER;
}

export async function getEREFUpscaleEnabled(
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { data } = await supabase
    .from('app_config')
    .select('value')
    .eq('scope', 'app')
    .eq('key', 'eref_upscale_enabled')
    .maybeSingle();
  if (!data) return DEFAULT_EREF_UPSCALE_ENABLED;
  const raw = (data as { value?: unknown }).value;
  const s = readJsonbScalar(raw);
  if (typeof s === 'boolean') return s;
  // Tolerate string "true"/"false" stored values.
  if (typeof s === 'string') return s === 'true';
  return DEFAULT_EREF_UPSCALE_ENABLED;
}
