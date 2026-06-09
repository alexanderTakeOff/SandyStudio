// ──────────────────────────────────────────────────────────────────────────────
// components/vgen/ProviderControlPanel.tsx
//
// Sprint β 2026-05-14 — universal capability-aware controls.
//
// Renders the right set of knobs for whatever provider is selected, based on
// the static manifest in `lib/api/provider-capabilities.ts`. Hides controls
// the provider doesn't support (e.g. Resolution chooser for Veo) so Director
// never tweaks something that will silently be ignored downstream.
//
// Intentionally plain inputs — same dark-glass styling as VGENShotPanel /
// EpisodeTimelineSection, no headless-ui or radix dependency. Caller owns
// the value and onChange handler.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import {
  estimateCost,
  VIDEO_PROVIDER_CAPS,
  type VideoAspectRatio,
  type VideoControlsValue,
  type VideoProviderCapabilities,
  type VideoProviderId,
  type VideoQualityTier,
  type VideoResolution,
} from '@/lib/api/provider-capabilities';

export type ProviderControlField =
  | 'aspect'
  | 'quality'
  | 'resolution'
  | 'duration'
  | 'seed'
  | 'endImage';

interface ProviderControlPanelProps {
  provider: VideoProviderId;
  value: VideoControlsValue;
  onChange: (next: VideoControlsValue) => void;
  /** If true, show the cost estimate line at the bottom. */
  showCost?: boolean;
  /** Layout density: `compact` for inline rows (timeline), `full` for the
   *  drawer panel. */
  density?: 'compact' | 'full';
  /** Disable all inputs while pending request. */
  disabled?: boolean;
  /** Which controls to render. Default = all. Episode-level FORMAT settings
   *  pass `['aspect','quality','resolution']` — duration / seed / end-frame
   *  are per-shot creative (q27) and don't belong on the episode card. */
  fields?: ReadonlyArray<ProviderControlField>;
}

const ASPECT_LABEL: Record<VideoAspectRatio, string> = {
  '16:9': '16:9 · YouTube',
  '9:16': '9:16 · Shorts',
  '1:1': '1:1 · Square',
  '21:9': '21:9 · Ultrawide',
  '4:3': '4:3 · Classic',
  '3:4': '3:4 · Portrait',
  auto: 'auto · infer',
};

const QUALITY_LABEL: Record<VideoQualityTier, string> = {
  fast: 'Fast · cheap iteration',
  standard: 'Standard · final',
};

const ALL_FIELDS: ReadonlyArray<ProviderControlField> = [
  'aspect',
  'quality',
  'resolution',
  'duration',
  'seed',
  'endImage',
];

export function ProviderControlPanel({
  provider,
  value,
  onChange,
  showCost = true,
  density = 'full',
  disabled = false,
  fields = ALL_FIELDS,
}: ProviderControlPanelProps) {
  const caps: VideoProviderCapabilities = VIDEO_PROVIDER_CAPS[provider];
  const show = (f: ProviderControlField): boolean => fields.includes(f);
  const cost = estimateCost(caps, {
    quality_tier: value.quality_tier,
    duration_seconds: value.duration_seconds,
    resolution: value.resolution,
  });

  const fieldGap = density === 'compact' ? 'gap-1.5' : 'gap-2';
  const labelCls =
    'block text-[10px] uppercase tracking-wider text-text-muted mb-1';
  const selectCls =
    'w-full h-9 px-2.5 rounded-md bg-[var(--bg-elevated)] border border-glass text-sm';

  return (
    <div className={`flex flex-col ${fieldGap}`}>
      {/* Aspect ratio */}
      {show('aspect') && (
      <div>
        <label className={labelCls}>Aspect ratio</label>
        <select
          className={selectCls}
          value={value.aspect_ratio}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...value, aspect_ratio: e.target.value as VideoAspectRatio })
          }
        >
          {caps.supports_aspects.map((a) => (
            <option key={a} value={a}>
              {ASPECT_LABEL[a] ?? a}
            </option>
          ))}
        </select>
      </div>
      )}

      {/* Quality tier */}
      {show('quality') && (
      <div>
        <label className={labelCls}>Quality</label>
        <select
          className={selectCls}
          value={value.quality_tier}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...value, quality_tier: e.target.value as VideoQualityTier })
          }
        >
          {caps.supports_qualities.map((q) => (
            <option key={q} value={q}>
              {QUALITY_LABEL[q] ?? q}
            </option>
          ))}
        </select>
      </div>
      )}

      {/* Resolution — only when supported */}
      {show('resolution') && caps.supports_resolutions.length > 0 && (
        <div>
          <label className={labelCls}>
            Resolution
            {caps.resolution_cost_mult && (
              <span className="ml-2 text-text-muted/70 normal-case tracking-normal">
                ({caps.resolution_cost_mult['480p']}× · 1× · {caps.resolution_cost_mult['1080p']}×)
              </span>
            )}
          </label>
          <select
            className={selectCls}
            value={value.resolution ?? caps.supports_resolutions[0]}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...value, resolution: e.target.value as VideoResolution })
            }
          >
            {caps.supports_resolutions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Duration */}
      {show('duration') && (
      <div>
        <label className={labelCls}>
          Duration · {value.duration_seconds}s
          <span className="ml-2 text-text-muted/70 normal-case tracking-normal">
            ({caps.min_duration_s}–{caps.max_duration_s}s)
          </span>
        </label>
        <input
          type="range"
          className="w-full"
          min={caps.min_duration_s}
          max={caps.max_duration_s}
          step={1}
          value={value.duration_seconds}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...value, duration_seconds: Number(e.target.value) })
          }
        />
      </div>
      )}

      {/* Seed — only when supported */}
      {show('seed') && caps.supports_seed && (
        <div>
          <label className={labelCls}>
            Seed
            <span className="ml-2 text-text-muted/70 normal-case tracking-normal">
              (empty = random · fix to reproduce)
            </span>
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              className={`${selectCls} font-mono`}
              placeholder="random"
              value={typeof value.seed === 'number' ? String(value.seed) : ''}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === '') {
                  const { seed: _drop, ...rest } = value;
                  void _drop;
                  onChange(rest);
                  return;
                }
                const n = Number(v);
                if (Number.isFinite(n)) {
                  onChange({ ...value, seed: Math.trunc(n) });
                }
              }}
            />
            <button
              type="button"
              className="h-9 px-3 rounded-md border border-glass text-xs text-text-muted hover:text-text-primary"
              disabled={disabled}
              onClick={() =>
                onChange({ ...value, seed: Math.floor(Math.random() * 1_000_000_000) })
              }
              title="Randomise then lock"
            >
              🎲
            </button>
          </div>
        </div>
      )}

      {/* End image — only when supported. MVP: accept an asset id string;
          richer picker is a follow-up. */}
      {show('endImage') && caps.supports_end_image && (
        <div>
          <label className={labelCls}>End frame (optional)</label>
          <input
            type="text"
            className={`${selectCls} font-mono text-[11px]`}
            placeholder="image asset uuid — Seedance transitions start → end"
            value={value.end_image_asset_id ?? ''}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...value,
                end_image_asset_id: e.target.value.trim() || null,
              })
            }
          />
        </div>
      )}

      {showCost && (
        <div className="mt-1 text-[11px] text-text-muted">
          Estimated cost ≈ <span className="font-mono text-text-primary">${cost.toFixed(3)}</span>
          {' '}
          ({caps.cost_usd_per_second[value.quality_tier].toFixed(4)}/s × {value.duration_seconds}s
          {value.resolution && caps.resolution_cost_mult
            ? ` × ${caps.resolution_cost_mult[value.resolution]}× (${value.resolution})`
            : ''})
        </div>
      )}
    </div>
  );
}
