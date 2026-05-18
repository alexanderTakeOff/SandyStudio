// ──────────────────────────────────────────────────────────────────────────────
// lib/api/provider-capabilities.ts
//
// Sprint β 2026-05-14 — static capability manifest shared between the
// server-side provider router (`lib/agents/providers/video-gen-multi.ts`)
// and the UI (`components/vgen/*`, `components/timeline/*`). The router
// is the source of truth; this module re-exports the same shape in a
// frontend-safe way (no Node-only imports).
//
// Why a shared module: the UI needs to render controls per capability
// (e.g. show "Resolution" only when `supports_resolutions.length > 0`,
// duration slider bounds, seed field, end-image picker). Reaching into
// the agents/providers/* directory from a 'use client' file would pull
// fal.ai / Veo runtime code into the browser bundle — wrong layer.
// ──────────────────────────────────────────────────────────────────────────────

export type VideoAspectRatio =
  | '16:9'
  | '9:16'
  | '1:1'
  | '21:9'
  | '4:3'
  | '3:4'
  | 'auto';
export type VideoQualityTier = 'fast' | 'standard';
export type VideoResolution = '480p' | '720p' | '1080p';
export type VideoProviderId = 'seedance-fal-img2vid' | 'veo-3-img2vid';

export interface VideoProviderCapabilities {
  supports_aspects: ReadonlyArray<VideoAspectRatio>;
  supports_qualities: ReadonlyArray<VideoQualityTier>;
  supports_resolutions: ReadonlyArray<VideoResolution>;
  supports_reference_image: boolean;
  supports_seed: boolean;
  supports_end_image: boolean;
  min_duration_s: number;
  max_duration_s: number;
  max_prompt_chars?: number;
  /** Per-second cost at the baseline (720p where applicable). UI multiplies
   *  by resolution to produce a live estimate. */
  cost_usd_per_second: Readonly<Record<VideoQualityTier, number>>;
  /** Resolution cost multiplier — 720p = 1×. */
  resolution_cost_mult?: Readonly<Record<VideoResolution, number>>;
  /** Human label for the dropdown. */
  label: string;
  /** Short tagline rendered under the label. */
  sub: string;
}

export const VIDEO_PROVIDER_CAPS: Readonly<Record<VideoProviderId, VideoProviderCapabilities>> = {
  'seedance-fal-img2vid': {
    label: 'Seedance 2.0 (fal.ai)',
    sub: 'best motion · 4-15s · seed/1080p',
    supports_aspects: ['16:9', '9:16', '1:1', '21:9', '4:3', '3:4', 'auto'],
    supports_qualities: ['fast', 'standard'],
    supports_resolutions: ['480p', '720p', '1080p'],
    supports_reference_image: true,
    supports_seed: true,
    supports_end_image: true,
    min_duration_s: 4,
    max_duration_s: 15,
    max_prompt_chars: 3000,
    cost_usd_per_second: { fast: 0.2419, standard: 0.3024 },
    resolution_cost_mult: { '480p': 0.55, '720p': 1.0, '1080p': 2.25 },
  },
  'veo-3-img2vid': {
    label: 'Veo 3.1 (Google)',
    sub: 'cheaper · 4-8s',
    supports_aspects: ['16:9', '9:16', '1:1'],
    supports_qualities: ['fast', 'standard'],
    supports_resolutions: [], // fixed model resolution; UI hides the chooser
    supports_reference_image: true,
    supports_seed: false,
    supports_end_image: false,
    min_duration_s: 4,
    max_duration_s: 8,
    max_prompt_chars: 2000,
    cost_usd_per_second: { fast: 0.075, standard: 0.15 },
  },
};

export interface VideoControlsValue {
  prompt: string;
  aspect_ratio: VideoAspectRatio;
  quality_tier: VideoQualityTier;
  duration_seconds: number;
  resolution?: VideoResolution;
  seed?: number;
  end_image_asset_id?: string | null;
}

/** Clamp the supplied value to the provider's supported set / range. Used by
 *  callers that store settings from one provider and switch to another. */
export function normalizeControls(
  value: VideoControlsValue,
  caps: VideoProviderCapabilities,
): VideoControlsValue {
  const aspect = caps.supports_aspects.includes(value.aspect_ratio)
    ? value.aspect_ratio
    : caps.supports_aspects[0]!;
  const quality = caps.supports_qualities.includes(value.quality_tier)
    ? value.quality_tier
    : caps.supports_qualities[0]!;
  const duration = Math.min(
    caps.max_duration_s,
    Math.max(caps.min_duration_s, Math.round(value.duration_seconds)),
  );
  const resolution =
    caps.supports_resolutions.length === 0
      ? undefined
      : value.resolution && caps.supports_resolutions.includes(value.resolution)
        ? value.resolution
        : caps.supports_resolutions.includes('720p')
          ? '720p'
          : caps.supports_resolutions[0];
  const seed = caps.supports_seed ? value.seed : undefined;
  const endImage = caps.supports_end_image ? value.end_image_asset_id : null;
  return {
    prompt: value.prompt,
    aspect_ratio: aspect,
    quality_tier: quality,
    duration_seconds: duration,
    ...(resolution ? { resolution } : {}),
    ...(typeof seed === 'number' ? { seed } : {}),
    ...(endImage ? { end_image_asset_id: endImage } : {}),
  };
}

/** Compute a live cost estimate in USD. */
export function estimateCost(
  caps: VideoProviderCapabilities,
  v: { quality_tier: VideoQualityTier; duration_seconds: number; resolution?: VideoResolution },
): number {
  const baseline = caps.cost_usd_per_second[v.quality_tier];
  const mult =
    caps.resolution_cost_mult && v.resolution
      ? (caps.resolution_cost_mult[v.resolution] ?? 1)
      : 1;
  return baseline * v.duration_seconds * mult;
}
