// ──────────────────────────────────────────────────────────────────────────────
// lib/api/vgen-defaults.ts
// Series-level VGEN defaults — Universal Core controls (aspect / quality /
// provider) Director sets once per series. Phase 1 reads from `app_config`;
// Phase 1.5 will move these to `series.metadata.vgen_defaults`.
//
// Per Director's directive (purrfect-stirring-hollerith plan, 2026-05-06),
// these are the bare-minimum controls common to every video provider. Provider-
// specific knobs (Veo native_audio toggle, Kling Elements, etc.) live in
// ProviderManifest extensions added in Phase 2.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';

export type VgenAspectRatio = '16:9' | '9:16' | '1:1';
export type VgenQualityTier = 'fast' | 'standard';
// Phase 2 (2026-05-13): widened to include Seedance 2.0 via fal.ai. Director
// directive: new default is Seedance Fast; Veo remains available via dropdown.
export type VgenProviderId = 'veo-3-img2vid' | 'seedance-fal-img2vid';

export interface VgenDefaults {
  aspect_ratio: VgenAspectRatio;
  quality_tier: VgenQualityTier;
  provider_id: VgenProviderId;
}

const KEY_PREFIX = 'vgen_defaults:';

const FALLBACK_DEFAULTS: VgenDefaults = {
  aspect_ratio: '16:9',
  quality_tier: 'fast',
  provider_id: 'seedance-fal-img2vid',
};

function isAspect(v: unknown): v is VgenAspectRatio {
  return v === '16:9' || v === '9:16' || v === '1:1';
}

function isQuality(v: unknown): v is VgenQualityTier {
  return v === 'fast' || v === 'standard';
}

function isProviderId(v: unknown): v is VgenProviderId {
  return v === 'veo-3-img2vid' || v === 'seedance-fal-img2vid';
}

/**
 * Resolve VGEN defaults for a series. Falls back to a hard-coded baseline when
 * no row exists. Phase 1.5 swaps the storage backend; the call signature is
 * stable across the change.
 */
export async function getVgenDefaults(
  supabase: SupabaseClient<Database>,
  seriesId: string | null | undefined,
): Promise<VgenDefaults> {
  if (!seriesId) return { ...FALLBACK_DEFAULTS };
  const { data } = await supabase
    .from('app_config')
    .select('value')
    .eq('scope', 'app')
    .eq('key', `${KEY_PREFIX}${seriesId}`)
    .maybeSingle();
  if (!data) return { ...FALLBACK_DEFAULTS };
  const raw = (data as { value?: unknown }).value;
  if (!raw || typeof raw !== 'object') return { ...FALLBACK_DEFAULTS };
  const r = raw as Record<string, unknown>;
  return {
    aspect_ratio: isAspect(r.aspect_ratio) ? r.aspect_ratio : FALLBACK_DEFAULTS.aspect_ratio,
    quality_tier: isQuality(r.quality_tier) ? r.quality_tier : FALLBACK_DEFAULTS.quality_tier,
    provider_id: isProviderId(r.provider_id) ? r.provider_id : FALLBACK_DEFAULTS.provider_id,
  };
}

export const VGEN_DEFAULT_FALLBACK: Readonly<VgenDefaults> = FALLBACK_DEFAULTS;
