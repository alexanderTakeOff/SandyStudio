// ──────────────────────────────────────────────────────────────────────────────
// lib/api/provider-capabilities.ts
//
// Sprint β 2026-05-14 — static capability manifest shared between the
// server-side provider router (`lib/providers/video-gen-multi.ts`)
// and the UI (`components/vgen/*`, `components/timeline/*`). The router
// is the source of truth; this module re-exports the same shape in a
// frontend-safe way (no Node-only imports).
//
// Why a shared module: the UI needs to render controls per capability
// (e.g. show "Resolution" only when `supports_resolutions.length > 0`,
// duration slider bounds, seed field, end-image picker). Reaching into
// the lib/providers/* directory from a 'use client' file would pull
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

// ──────────────────────────────────────────────────────────────────────────────
// IMAGE provider (gpt-image-2) — delivery-target → reference-image size.
//
// Single source of truth for the canonical reference-image size per delivery
// target. Lives HERE (provider layer), NOT inside any agent's runner or .md
// spec — both the Reference Designer (which sets the Plan size) and the
// Reference Critic V02 check (which validates it) derive from this manifest.
//
// IMPORTANT — these are gpt-image-2-BOUNDED reference sizes. The provider can
// produce ONLY 1024×1024 / 1024×1536 / 1536×1024 (see GptImageSize in
// providers/openai-image.ts). Vertical delivery targets (shorts/reels/tiktok,
// 9:16 intent) therefore use 1024×1536 — the provider's portrait max (2:3).
// The true 9:16 framing is rendered DOWNSTREAM by Seedance img2vid from this
// portrait reference. Do NOT "correct" these to 1024×1792 — that size is
// invalid for the provider and the image call fails outright.
export const SIZE_BY_DELIVERY_TARGET: Readonly<
  Record<string, { width: number; height: number }>
> = Object.freeze({
  youtube_landscape: { width: 1536, height: 1024 },
  youtube_shorts: { width: 1024, height: 1536 },
  instagram_reels: { width: 1024, height: 1536 },
  instagram_post: { width: 1024, height: 1024 },
  tiktok: { width: 1024, height: 1536 },
  print_poster: { width: 1536, height: 1024 },
});

// ──────────────────────────────────────────────────────────────────────────────
// IMAGE provider manifest (q28 2026-06-09) — episode-authoritative image
// provider + quality for the Artist (multi-ref edit). Frontend-safe mirror of
// the provider impls (providers/openai-image.ts, providers/flux-*). Reference
// SIZE stays delivery-target-derived (SIZE_BY_DELIVERY_TARGET) — not a knob
// here. Used by EpisodeSettingsCard's image section to render the dropdown +
// capability-gated quality selector.
// ──────────────────────────────────────────────────────────────────────────────

export type ImageProviderId = 'openai-edits-multi' | 'flux-pro-1.1-ultra';
export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';

export interface ImageProviderCapabilities {
  label: string;
  sub: string;
  /** Quality tiers the provider exposes; empty → no quality knob. */
  supports_qualities: ReadonlyArray<ImageQuality>;
  /** Max reference images for a multi-ref edit. */
  max_reference_images: number;
  /** Whether the provider exposes a denoise/strength knob (Flux). */
  supports_strength: boolean;
}

export const IMAGE_PROVIDER_CAPS: Readonly<
  Record<ImageProviderId, ImageProviderCapabilities>
> = {
  'openai-edits-multi': {
    label: 'gpt-image-2 (multi-ref edit)',
    sub: 'identity-lock · up to 16 refs',
    supports_qualities: ['low', 'medium', 'high', 'auto'],
    max_reference_images: 16,
    supports_strength: false,
  },
  'flux-pro-1.1-ultra': {
    label: 'Flux Pro 1.1 Ultra',
    sub: 'denoise knob · single ref',
    supports_qualities: [],
    max_reference_images: 1,
    supports_strength: true,
  },
};

/** Aspect ratio per delivery_target — the delivery-derived fallback layer for
 *  the generation-params resolver (resolve-generation-params.ts) and the
 *  Animator's Plan aspect. Single source of truth lives HERE (shared manifest);
 *  `runners/animator.ts` re-exports it for back-compat. */
export const ASPECT_BY_DELIVERY_TARGET: Readonly<
  Record<string, VideoAspectRatio>
> = Object.freeze({
  youtube_landscape: '16:9',
  youtube_shorts: '9:16',
  instagram_reels: '9:16',
  instagram_post: '1:1',
  tiktok: '9:16',
  print_poster: '16:9',
});

/** Map an episode's delivery_targets[] to the primary aspect ratio (first
 *  recognised target wins). Returns null when none map — caller falls through
 *  to the next precedence layer. */
export function deliveryAspectFor(
  deliveryTargets: ReadonlyArray<string> | null | undefined,
): VideoAspectRatio | null {
  for (const t of deliveryTargets ?? []) {
    const a = ASPECT_BY_DELIVERY_TARGET[t];
    if (a) return a;
  }
  return null;
}

/** True when ANY of the episode's delivery_targets is a vertical (9:16) surface
 *  — youtube_shorts / instagram_reels / tiktok. Used by EXEC-SB to activate the
 *  vertical-safe framing rule (peaks staged to survive a 16:9→9:16 crop). Reuses
 *  ASPECT_BY_DELIVERY_TARGET so the 9:16 slug set has ONE source of truth. */
export function hasVerticalDeliveryTarget(
  deliveryTargets: ReadonlyArray<string> | null | undefined,
): boolean {
  for (const t of deliveryTargets ?? []) {
    if (ASPECT_BY_DELIVERY_TARGET[t] === '9:16') return true;
  }
  return false;
}

/** Canonical delivery-target slugs — the keyset shared by SIZE_BY_DELIVERY_TARGET
 *  and ASPECT_BY_DELIVERY_TARGET. The app's single source of truth for the set of
 *  valid `delivery_targets` values (feeds the settings-route zod enum). */
export const DELIVERY_TARGETS = [
  'youtube_landscape',
  'youtube_shorts',
  'instagram_reels',
  'instagram_post',
  'tiktok',
  'print_poster',
] as const;
export type DeliveryTarget = (typeof DELIVERY_TARGETS)[number];

/** Reverse of ASPECT_BY_DELIVERY_TARGET: the canonical delivery_target for a
 *  chosen aspect ratio, so the Episode Settings format choice can also write the
 *  canonical `delivery_targets` key (the signal EREF / Storyboarder / sizing read).
 *  ASPECT_BY_DELIVERY_TARGET is many-to-one (three slugs map to 9:16) so the reverse
 *  returns a single representative surface. Aspects with no canonical target
 *  (`auto`, `21:9`, `4:3`, `3:4`) → `[]`, so the caller leaves delivery_targets
 *  untouched rather than guessing. */
export function deliveryTargetsForAspect(
  aspect: VideoAspectRatio | null | undefined,
): DeliveryTarget[] {
  switch (aspect) {
    case '9:16':
      return ['youtube_shorts'];
    case '16:9':
      return ['youtube_landscape'];
    case '1:1':
      return ['instagram_post'];
    default:
      return [];
  }
}

/** Clamp a desired render duration into a provider's [min,max] range, rounded to
 *  an integer (Veo rejects fractional durations with HTTP 400). Single source of
 *  truth for the render-duration floor/ceiling — reused by the runner dispatch
 *  clamp, the Animator producer, and the Critic V14 duration-lock so none of them
 *  re-hardcode a range. The shot's CREATIVE cut length (which may be below the
 *  floor) lives in the animatic; this only bounds what the generator renders. */
export function clampRenderDuration(
  caps: Pick<VideoProviderCapabilities, 'min_duration_s' | 'max_duration_s'>,
  seconds: number,
): number {
  return Math.min(caps.max_duration_s, Math.max(caps.min_duration_s, Math.round(seconds)));
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
  const duration = clampRenderDuration(caps, value.duration_seconds);
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
