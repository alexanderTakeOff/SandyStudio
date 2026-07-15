// ──────────────────────────────────────────────────────────────────────────────
// components/episode/EpisodeGenerationConfig.tsx
//
// Episode-authoritative generation config (2026-06-09). The single place
// Director / EXEC-DIR-AI declares the FORMAT params (provider / aspect /
// quality / resolution) the whole pipeline must honour — for VIDEO (VGEN) and
// IMAGE (EREF Artist). Root fix for "Director's provider directives get lost":
// these persist to `episodes.metadata.generation_config` and the resolver
// (resolve-generation-params.ts) reads them as the precedence authority.
//
// FORMAT only (q27) — duration + creative (prompt / anchors / seed / gag) stay
// per-shot, so the embedded ProviderControlPanel renders only aspect/quality/
// resolution. `allow_shot_overrides` (default off) decides whether a per-shot /
// Plan value may override the episode.
//
// Rendered inside EpisodeSettingsCard. Capability-driven (reuses
// ProviderControlPanel + IMAGE_PROVIDER_CAPS) — no per-provider forks.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import {
  ProviderControlPanel,
} from '@/components/vgen/ProviderControlPanel';
import {
  IMAGE_PROVIDER_CAPS,
  VIDEO_PROVIDER_CAPS,
  normalizeControls,
  deliveryTargetsForAspect,
  type ImageProviderId,
  type ImageQuality,
  type VideoControlsValue,
  type VideoProviderId,
} from '@/lib/api/provider-capabilities';

interface VideoCfg {
  provider_id: VideoProviderId;
  aspect_ratio: VideoControlsValue['aspect_ratio'];
  quality_tier: VideoControlsValue['quality_tier'];
  resolution?: VideoControlsValue['resolution'];
  allow_shot_overrides: boolean;
}
interface ImageCfg {
  provider_id: ImageProviderId;
  quality: ImageQuality;
}

interface EpisodeGenerationConfigProps {
  episodeId: string;
  initialMetadata?: Record<string, unknown> | null;
}

const VIDEO_FALLBACK: VideoCfg = {
  provider_id: 'seedance-fal-img2vid',
  aspect_ratio: '16:9',
  quality_tier: 'fast',
  resolution: undefined,
  allow_shot_overrides: false,
};
const IMAGE_FALLBACK: ImageCfg = {
  provider_id: 'openai-edits-multi',
  quality: 'high',
};

function readVideoCfg(meta: Record<string, unknown> | null | undefined): VideoCfg {
  const v = (meta?.generation_config as { video?: Partial<VideoCfg> } | undefined)?.video;
  if (!v) return { ...VIDEO_FALLBACK };
  return {
    provider_id: v.provider_id ?? VIDEO_FALLBACK.provider_id,
    aspect_ratio: v.aspect_ratio ?? VIDEO_FALLBACK.aspect_ratio,
    quality_tier: v.quality_tier ?? VIDEO_FALLBACK.quality_tier,
    resolution: v.resolution,
    allow_shot_overrides: v.allow_shot_overrides === true,
  };
}
function readImageCfg(meta: Record<string, unknown> | null | undefined): ImageCfg {
  const i = (meta?.generation_config as { image?: Partial<ImageCfg> } | undefined)?.image;
  if (!i) return { ...IMAGE_FALLBACK };
  return {
    provider_id: i.provider_id ?? IMAGE_FALLBACK.provider_id,
    quality: i.quality ?? IMAGE_FALLBACK.quality,
  };
}

const selectCls =
  'w-full h-9 px-2.5 rounded-md bg-[var(--bg-elevated)] border border-glass text-sm';
const labelCls = 'block text-[10px] uppercase tracking-wider text-text-muted mb-1';

export function EpisodeGenerationConfig({
  episodeId,
  initialMetadata,
}: EpisodeGenerationConfigProps) {
  const [video, setVideo] = useState<VideoCfg>(() => readVideoCfg(initialMetadata));
  const [image, setImage] = useState<ImageCfg>(() => readImageCfg(initialMetadata));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Synthetic VideoControlsValue for the embedded panel — only aspect/quality/
  // resolution are shown; prompt/duration are placeholders the panel ignores.
  const panelValue: VideoControlsValue = {
    prompt: '',
    aspect_ratio: video.aspect_ratio,
    quality_tier: video.quality_tier,
    duration_seconds: VIDEO_PROVIDER_CAPS[video.provider_id].min_duration_s,
    ...(video.resolution ? { resolution: video.resolution } : {}),
  };

  function onVideoProviderChange(next: VideoProviderId) {
    // Clamp aspect/quality/resolution to the new provider's contract.
    const clamped = normalizeControls(panelValue, VIDEO_PROVIDER_CAPS[next]);
    setVideo((s) => ({
      ...s,
      provider_id: next,
      aspect_ratio: clamped.aspect_ratio,
      quality_tier: clamped.quality_tier,
      resolution: clamped.resolution,
    }));
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      // Derive the canonical delivery_targets from the chosen aspect so the
      // vertical/shorts choice reaches EREF / Storyboarder / sizing (which read
      // delivery_targets), not just the video generator (which reads aspect).
      // Empty for unmapped aspects (auto/21:9/…) → omit so zod .min(1) is happy.
      const deliveryTargets = deliveryTargetsForAspect(video.aspect_ratio);
      const res = await fetch(`/api/episodes/${episodeId}/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          generation_config: {
            video: {
              provider_id: video.provider_id,
              aspect_ratio: video.aspect_ratio,
              quality_tier: video.quality_tier,
              ...(video.resolution ? { resolution: video.resolution } : {}),
              allow_shot_overrides: video.allow_shot_overrides,
            },
            image: {
              provider_id: image.provider_id,
              quality: image.quality,
            },
          },
          ...(deliveryTargets.length > 0 ? { delivery_targets: deliveryTargets } : {}),
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setPending(false);
    }
  }

  const imageCaps = IMAGE_PROVIDER_CAPS[image.provider_id];

  return (
    <div className="border-t border-glass pt-3 space-y-3">
      <div>
        <div className="text-sm font-medium text-text-primary">Generation config</div>
        <div className="text-xs text-text-muted mt-0.5 leading-relaxed">
          Episode-authoritative FORMAT. Every video/image job honours these —
          your directive can no longer be lost on the fan-out. Duration + creative
          stay per-shot.
        </div>
      </div>

      {/* ── VIDEO ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-text-primary uppercase tracking-wide">
          Video
        </div>
        <div>
          <label className={labelCls}>Provider</label>
          <select
            className={selectCls}
            value={video.provider_id}
            disabled={pending}
            onChange={(e) => onVideoProviderChange(e.target.value as VideoProviderId)}
          >
            {(Object.keys(VIDEO_PROVIDER_CAPS) as VideoProviderId[]).map((p) => (
              <option key={p} value={p}>
                {VIDEO_PROVIDER_CAPS[p].label}
              </option>
            ))}
          </select>
        </div>
        <ProviderControlPanel
          provider={video.provider_id}
          value={panelValue}
          showCost={false}
          disabled={pending}
          fields={['aspect', 'quality', 'resolution']}
          onChange={(next) =>
            setVideo((s) => ({
              ...s,
              aspect_ratio: next.aspect_ratio,
              quality_tier: next.quality_tier,
              resolution: next.resolution,
            }))
          }
        />
        <label className="flex items-start gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[var(--accent-primary)] cursor-pointer"
            checked={video.allow_shot_overrides}
            disabled={pending}
            onChange={(e) =>
              setVideo((s) => ({ ...s, allow_shot_overrides: e.target.checked }))
            }
          />
          <span className="text-xs text-text-muted leading-relaxed">
            Allow per-shot overrides — when off, the episode wins and per-shot
            format controls are locked. When on, a shot may override (with an
            explicit confirm).
          </span>
        </label>
      </div>

      {/* ── IMAGE ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-text-primary uppercase tracking-wide">
          Image (references)
        </div>
        <div>
          <label className={labelCls}>Provider</label>
          <select
            className={selectCls}
            value={image.provider_id}
            disabled={pending}
            onChange={(e) =>
              setImage((s) => ({ ...s, provider_id: e.target.value as ImageProviderId }))
            }
          >
            {(Object.keys(IMAGE_PROVIDER_CAPS) as ImageProviderId[]).map((p) => (
              <option key={p} value={p}>
                {IMAGE_PROVIDER_CAPS[p].label}
              </option>
            ))}
          </select>
        </div>
        {imageCaps.supports_qualities.length > 0 && (
          <div>
            <label className={labelCls}>Quality</label>
            <select
              className={selectCls}
              value={image.quality}
              disabled={pending}
              onChange={(e) =>
                setImage((s) => ({ ...s, quality: e.target.value as ImageQuality }))
              }
            >
              {imageCaps.supports_qualities.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="text-[10px] text-text-muted">
          Reference size is derived from the episode delivery target — not set here.
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={pending}
          className="px-3 py-1 rounded-md text-xs font-medium bg-[var(--accent-primary)] text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save generation config'}
        </button>
        {savedAt && !error && (
          <span className="text-xs text-text-muted">Saved ✓</span>
        )}
        {error && (
          <span className="text-xs text-[var(--accent-danger)]">Error: {error}</span>
        )}
      </div>
    </div>
  );
}
