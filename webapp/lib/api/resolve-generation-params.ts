// ──────────────────────────────────────────────────────────────────────────────
// lib/api/resolve-generation-params.ts
//
// Episode-authoritative generation-parameter resolver (the linchpin).
//
// Root cause it fixes: Director's provider/format directives (e.g. standard /
// 480p / 9:16) silently got lost — the fan-out path emitted no aspect/quality,
// so the runner fell back to hardcoded `?? '16:9' / 'fast'`, and there was no
// episode-level place to declare them at all. This pure function is the SINGLE
// precedence authority every video-generation consumer calls (runner +
// regenerate-video route). Keeping it in one function — rather than re-deriving
// precedence at each of the ~6 event-emit sites — is the anti-additive guarantee
// that no path can silently miss the episode config.
//
// Precedence (per FORMAT field — provider / aspect / quality / resolution):
//   episode authority IF the episode declared that field AND shot-overrides OFF
//   else: shot override → episode → assignment(provider only) → series → delivery(aspect only) → fallback
//
// Regression safety (CLAUDE plan §«Трижды-подумано» #2): when the episode
// declares NO generation_config, every field is undefined → the resolver
// reproduces the legacy chain (shot/plan override → assignment/series →
// delivery → hardcode). No behaviour change for un-configured episodes.
//
// FORMAT only (q27): duration + all creative (prompt / anchors / seed / gag)
// stay per-shot and never pass through this resolver.
// ──────────────────────────────────────────────────────────────────────────────

import {
  VIDEO_PROVIDER_CAPS,
  normalizeControls,
  type ImageProviderId,
  type ImageQuality,
  type VideoAspectRatio,
  type VideoProviderId,
  type VideoQualityTier,
  type VideoResolution,
} from './provider-capabilities';
import { VGEN_DEFAULT_FALLBACK, type VgenDefaults } from './vgen-defaults';

/** Episode-authoritative video format config, stored at
 *  `episodes.metadata.generation_config.video`. Every field optional — an
 *  absent field falls through to the legacy layers. */
export interface EpisodeVideoConfig {
  provider_id?: VideoProviderId;
  aspect_ratio?: VideoAspectRatio;
  quality_tier?: VideoQualityTier;
  resolution?: VideoResolution;
  /** Opt-in: when true, a per-shot / Plan format value overrides the episode
   *  authority. Default (false / absent) = episode wins over shot. */
  allow_shot_overrides?: boolean;
}

/** Per-shot / Plan FORMAT override channel. Populated in the runner from the
 *  Animator Plan body + event args; in the regenerate route from the request
 *  body + the previous asset's metadata. Honoured only when the episode did
 *  not declare the field, or `allow_shot_overrides` is on. */
export interface ShotFormatOverride {
  provider_id?: VideoProviderId | null;
  aspect_ratio?: VideoAspectRatio | null;
  quality_tier?: VideoQualityTier | null;
  resolution?: VideoResolution | null;
}

export interface ResolveVideoParamsArgs {
  /** episodes.metadata.generation_config.video — the authority. */
  episodeConfig?: EpisodeVideoConfig | null;
  /** Per-shot / Plan format override (Animator Plan + event/request args). */
  shotOverride?: ShotFormatOverride | null;
  /** Provider from `provider_assignments.character_video` / explicit event
   *  `data.provider` — today's primary provider source, kept as a layer below
   *  episode config so un-configured episodes keep their assignment provider. */
  assignmentProviderId?: VideoProviderId | null;
  /** Series defaults (getVgenDefaults) — fallback below assignment. */
  seriesDefaults?: VgenDefaults | null;
  /** Aspect derived from the episode's primary delivery_target (youtube_shorts
   *  → 9:16, etc.) — fallback below series for aspect only. */
  deliveryAspect?: VideoAspectRatio | null;
}

export interface EffectiveVideoParams {
  providerId: VideoProviderId;
  aspectRatio: VideoAspectRatio;
  qualityTier: VideoQualityTier;
  /** null = provider has fixed resolution (Veo) or none resolved → provider default. */
  resolution: VideoResolution | null;
  /** Which layer won each field — surfaced in logs so a "lost directive" is
   *  diagnosable at a glance instead of inferred from output dimensions. */
  source: Record<'provider' | 'aspect' | 'quality' | 'resolution', string>;
}

function firstDefined<T>(...vals: Array<T | null | undefined>): T | undefined {
  for (const v of vals) if (v !== null && v !== undefined) return v;
  return undefined;
}

/**
 * Resolve a single FORMAT field with episode authority + regression safety.
 *
 *  - episode declared the field AND shot-overrides off → episode wins (authority).
 *  - otherwise → first defined of [shot, episode, ...fallbacks].
 *
 * `tag` records which layer won (for the diagnostic `source` map).
 */
function resolveField<T>(
  episodeVal: T | null | undefined,
  shotVal: T | null | undefined,
  allowShotOverrides: boolean,
  fallbacks: ReadonlyArray<readonly [string, T | null | undefined]>,
  hardFallback: readonly [string, T],
): { value: T; source: string } {
  if (episodeVal !== null && episodeVal !== undefined && !allowShotOverrides) {
    return { value: episodeVal, source: 'episode' };
  }
  if (shotVal !== null && shotVal !== undefined) {
    return { value: shotVal, source: 'shot' };
  }
  if (episodeVal !== null && episodeVal !== undefined) {
    return { value: episodeVal, source: 'episode' };
  }
  for (const [tag, val] of fallbacks) {
    if (val !== null && val !== undefined) return { value: val, source: tag };
  }
  return { value: hardFallback[1], source: hardFallback[0] };
}

/**
 * Single precedence authority for video FORMAT parameters. Pure — the caller
 * supplies every layer (episode config, series defaults, assignment provider,
 * delivery-derived aspect, shot override). The chosen aspect/quality/resolution
 * are clamped to the resolved provider's capability contract via
 * `normalizeControls`, so an episode that asks for a resolution its provider
 * can't render is silently corrected rather than failing downstream.
 */
export function resolveVideoParams(
  args: ResolveVideoParamsArgs,
): EffectiveVideoParams {
  const ep = args.episodeConfig ?? {};
  const shot = args.shotOverride ?? {};
  const allow = ep.allow_shot_overrides === true;
  const series = args.seriesDefaults ?? null;

  const provider = resolveField<VideoProviderId>(
    ep.provider_id,
    shot.provider_id,
    allow,
    [
      ['assignment', args.assignmentProviderId],
      ['series', (series?.provider_id as VideoProviderId | undefined) ?? null],
    ],
    ['fallback', VGEN_DEFAULT_FALLBACK.provider_id as VideoProviderId],
  );
  const caps = VIDEO_PROVIDER_CAPS[provider.value];

  const aspect = resolveField<VideoAspectRatio>(
    ep.aspect_ratio,
    shot.aspect_ratio,
    allow,
    [
      ['series', (series?.aspect_ratio as VideoAspectRatio | undefined) ?? null],
      ['delivery', args.deliveryAspect],
    ],
    ['fallback', VGEN_DEFAULT_FALLBACK.aspect_ratio as VideoAspectRatio],
  );

  const quality = resolveField<VideoQualityTier>(
    ep.quality_tier,
    shot.quality_tier,
    allow,
    [['series', series?.quality_tier ?? null]],
    ['fallback', VGEN_DEFAULT_FALLBACK.quality_tier],
  );

  // Resolution: no series/delivery layer. Crucially, when NO layer declares a
  // resolution it stays null — meaning "provider applies its own default" — so
  // un-configured shots keep the legacy null-resolution (provider-default 720p
  // downstream) and the conservative budget reservation, rather than being
  // silently pinned to a concrete value here.
  const resolutionRaw = firstDefined<VideoResolution>(
    ep.resolution !== undefined && ep.resolution !== null && !allow
      ? ep.resolution
      : undefined,
    shot.resolution ?? undefined,
    ep.resolution ?? undefined,
    series?.resolution ?? undefined,
  );
  // Drop a resolution the resolved provider can't render (fixed-resolution
  // providers like Veo carry an empty set → always null). Settings-route caps
  // validation + the runner's TD-85 plan-resolution gate already reject
  // unsupported values upstream; this is the final graceful clamp.
  const resolution: VideoResolution | null =
    resolutionRaw && caps.supports_resolutions.includes(resolutionRaw)
      ? resolutionRaw
      : null;
  const resolutionSource = !resolution
    ? 'provider-default'
    : ep.resolution === resolution && !allow
      ? 'episode'
      : shot.resolution === resolution
        ? 'shot'
        : ep.resolution === resolution
          ? 'episode'
          : 'series';

  // Clamp aspect + quality to the resolved provider's contract.
  const normalized = normalizeControls(
    {
      prompt: '',
      aspect_ratio: aspect.value,
      quality_tier: quality.value,
      duration_seconds: caps.min_duration_s,
    },
    caps,
  );

  return {
    providerId: provider.value,
    aspectRatio: normalized.aspect_ratio,
    qualityTier: normalized.quality_tier,
    resolution,
    source: {
      provider: provider.source,
      aspect: aspect.source,
      quality: quality.source,
      resolution: resolutionSource,
    },
  };
}

// ── IMAGE side (q28) ───────────────────────────────────────────────────────────
// The image provider (Artist multi-ref edit) is episode-authoritative for
// provider + quality only; the reference-image SIZE is already derived from
// delivery_target (SIZE_BY_DELIVERY_TARGET) and is NOT re-resolved here.
// ImageProviderId / ImageQuality come from provider-capabilities (single source).

export interface EpisodeImageConfig {
  provider_id?: ImageProviderId;
  quality?: ImageQuality;
}

export interface ResolveImageParamsArgs {
  episodeConfig?: EpisodeImageConfig | null;
  /** Global/series EREF provider (app_config `eref_provider`) — fallback. */
  configProviderId?: ImageProviderId | null;
}

export interface EffectiveImageParams {
  providerId: ImageProviderId;
  quality: ImageQuality;
  source: Record<'provider' | 'quality', string>;
}

const IMAGE_PROVIDER_FALLBACK: ImageProviderId = 'openai-edits-multi';
const IMAGE_QUALITY_FALLBACK: ImageQuality = 'high';

/** Episode-authoritative image-provider resolver. Mirrors the video resolver's
 *  precedence with fewer layers (no shot override, no series-defaults table). */
export function resolveImageParams(
  args: ResolveImageParamsArgs,
): EffectiveImageParams {
  const ep = args.episodeConfig ?? {};
  const provider = firstDefined<ImageProviderId>(
    ep.provider_id,
    args.configProviderId,
  );
  const quality = firstDefined<ImageQuality>(ep.quality);
  return {
    providerId: provider ?? IMAGE_PROVIDER_FALLBACK,
    quality: quality ?? IMAGE_QUALITY_FALLBACK,
    source: {
      provider: ep.provider_id ? 'episode' : args.configProviderId ? 'config' : 'fallback',
      quality: ep.quality ? 'episode' : 'fallback',
    },
  };
}

/** Translate an impl-vocab ImageProviderId into the plan-alias the EREF Designer
 *  and EPREV critic speak (their allowlist uses `gpt-image-2`, not the config id
 *  `openai-edits-multi`). Mirror of video `episodeProviderAliases`. */
export function imageProviderAlias(impl: ImageProviderId): string {
  return impl === 'openai-edits-multi' ? 'gpt-image-2' : 'flux-pro-1.1-ultra';
}

/** Clamp a resolved ImageQuality to the set the provider `.generate()` arg
 *  accepts (`low|medium|high` — no `auto`). */
export function imageQualityForProvider(q: ImageQuality): 'low' | 'medium' | 'high' {
  return q === 'auto' ? 'high' : q;
}
