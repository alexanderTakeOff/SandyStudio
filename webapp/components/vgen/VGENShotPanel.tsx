// ──────────────────────────────────────────────────────────────────────────────
// components/vgen/VGENShotPanel.tsx
//
// Universal Core controls panel for a single VID-shot asset. Sits inside the
// EpisodeAssetDrawer when `asset.file_type === 'VID-shot'`. Director uses it
// to inspect the generated mp4, tweak Universal Core settings (aspect ratio,
// quality tier, duration, reference image), and re-generate the shot with the
// new settings via POST /api/assets/[id]/regenerate-video.
//
// What this panel may still change (2026-07-29, E33 audit):
//   - aspect_ratio:       per-shot delivery-format channel (episode authority
//                         may lock it — see the lock notice below)
//   - end_image_asset_id: the anchor-mode toggle
//   - reference_asset_id: read-only chip
//
// What it may NOT change — every one of these is a DECISION of the approved
// SPC-shot_plan and is read server-side from that plan:
//   - prompt, provider, quality_tier, resolution, seed, duration_seconds
//
// They are rendered here as a read-only mirror of the LAST render. Editing them
// here was a second, uncontrolled channel: the drawer could run the approved
// prompt at a tier the plan never declared, and shipping a drawer seed made a
// "retry" differ from take 1 by nothing but the dice roll. To change any of
// them: Request revision (Animator re-authors) or edit the plan on its contract
// page. A control that cannot change the outcome must not look like it can.
//
// Provider-specific knobs (native_audio toggle, person_generation policy, etc.)
// land in Phase 2 via ProviderManifest dynamic renderer — NOT here.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Play as PlayIcon,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  ProviderControlPanel,
  type ProviderControlField,
} from '@/components/vgen/ProviderControlPanel';
import {
  VIDEO_PROVIDER_CAPS,
  normalizeControls,
  estimateCost,
  type VideoControlsValue,
  type VideoProviderId,
  type VideoResolution,
} from '@/lib/api/provider-capabilities';

// ── Types ────────────────────────────────────────────────────────────────────

// Pre-Sprint β narrow types kept for the legacy `currentSettings` prop shape.
// New code should reach for the wider `VideoAspectRatio` from provider-capabilities.
export type AspectRatio = '16:9' | '9:16' | '1:1';
export type QualityTier = 'fast' | 'standard';
export type VgenProvider = VideoProviderId;

// Phase 2 (2026-05-13) — per-provider cost rates surface in cost preview.
// Seedance Pro (the default) is ~3-4× more expensive than Veo but produces
// substantially better character motion and camera control (probe 2026-05-13).
const COST_RATE_USD_PER_SECOND: Record<VgenProvider, Record<QualityTier, number>> = {
  'veo-3-img2vid': { fast: 0.075, standard: 0.15 },
  'seedance-fal-img2vid': { fast: 0.2419, standard: 0.3024 },
};

const ASPECT_OPTIONS: Array<{ value: AspectRatio; label: string; sub: string }> = [
  { value: '16:9', label: '16:9', sub: 'YouTube · landscape' },
  { value: '9:16', label: '9:16', sub: 'Reels · Shorts · TikTok' },
  { value: '1:1', label: '1:1', sub: 'Instagram · square' },
];

const QUALITY_OPTIONS: Array<{ value: QualityTier; label: string; sub: string }> = [
  { value: 'fast', label: 'Fast', sub: 'cheaper · iteration' },
  { value: 'standard', label: 'Standard', sub: 'pricier · final' },
];

// Provider order = Director-facing display order. Seedance first because it's
// the new default per Director directive 2026-05-13.
const PROVIDER_OPTIONS: Array<{ value: VgenProvider; label: string; sub: string }> = [
  { value: 'seedance-fal-img2vid', label: 'Seedance 2.0 (fal.ai)', sub: 'best motion · 4-8s' },
  { value: 'veo-3-img2vid', label: 'Veo 3.1 (Google)', sub: 'cheaper · 4-8s' },
];

const DURATION_MIN = 1;
const DURATION_MAX = 8;

export interface VGENShotPanelStoryboardShot {
  shot_id: string;
  action_prose?: string;
  camera_angle?: string;
  expected_emotion?: string;
  key_beat?: string;
  expected_gag?: string;
}

export interface VGENShotPanelSettings {
  prompt: string;
  aspect_ratio: AspectRatio;
  quality_tier: QualityTier;
  duration_seconds: number;
  reference_asset_id: string;
  /** Phase 2 (2026-05-13). Provider id; omit when unknown — panel falls back
   *  to the new default (Seedance 2.0). */
  provider_id?: VgenProvider;
  /** TD-85 (2026-06-01). Resolution that drove the last render (from the Plan
   *  or a prior manual regen). Seeds the selector so it reflects 1080p instead
   *  of resetting to the 720p default. Omit / undefined for fixed-resolution
   *  providers or pre-TD-85 assets. */
  resolution?: VideoResolution;
}

/** Episode-authoritative video format (2026-06-09). When the episode declares
 *  generation_config.video and `allow_shot_overrides` is off, this panel's
 *  format controls are LOCKED — the server (regenerate-video resolver) ignores
 *  per-shot format anyway, so editing here would silently "not work" (the exact
 *  trap CLAUDE plan §pitfall #4 warns about). Showing the lock keeps it honest. */
interface EpisodeVideoLock {
  provider_id?: VideoProviderId;
  aspect_ratio?: string;
  quality_tier?: string;
  resolution?: VideoResolution;
  allow_shot_overrides?: boolean;
}

export interface VGENShotPanelProps {
  assetId: string;
  /** Episode id — when set, the panel fetches the episode generation_config and
   *  locks format controls unless per-shot overrides are enabled. Omit → no
   *  lock (back-compat). */
  episodeId?: string | null;
  /** Drive or staging URL of the generated mp4. Null while generating or before first run. */
  videoUrl: string | null;
  /** Storyboard shot row — supplies shot_id for labels + regen focus. */
  storyboardShot: VGENShotPanelStoryboardShot;
  /** Current settings (from asset metadata or computed defaults). */
  currentSettings: VGENShotPanelSettings;
  /** Called after a successful regenerate so the parent can refetch. */
  onChanged: () => void;
  /**
   * Called after a successful regenerate with the shot_id of the new asset
   * row so the parent can move the timeline cursor to that shot (Phase A.1
   * directive — "new candidate must appear and focused"). Phase 1 panel
   * doesn't know the new asset id beyond what /regenerate-video returns;
   * shot_id is stable across regens, so callers re-resolve via shot_id.
   */
  onRegenerated?: (shotId: string, newAssetId: string) => void;
  /** When true, disables every editable control (e.g. asset is LOCKED). */
  readOnly?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clampDuration(n: number): number {
  if (!Number.isFinite(n)) return DURATION_MIN;
  return Math.min(DURATION_MAX, Math.max(DURATION_MIN, Math.round(n)));
}

// ── Component ────────────────────────────────────────────────────────────────

export function VGENShotPanel({
  assetId,
  episodeId,
  videoUrl,
  storyboardShot,
  currentSettings,
  onChanged,
  onRegenerated,
  readOnly,
}: VGENShotPanelProps) {
  const [provider, setProvider] = useState<VgenProvider>(
    currentSettings.provider_id ?? 'seedance-fal-img2vid',
  );
  // Anchor-mode doctrine (2026-06-17, E10 A/B smoke): on camera-orbit shots a
  // pinned end_image fights the orbit → ref-only is the default; two anchors are
  // the STATIC non-orbit match-cut exception. This toggle governs the end-frame
  // control below: 'ref-only' hides it + nulls end_image; 'two-anchor' reveals it.
  // Default 'ref-only' on open (currentSettings carries no end_image signal — the
  // visible toggle prevents a silent surprise on a legit two-anchor shot).
  const [anchorMode, setAnchorMode] = useState<'ref-only' | 'two-anchor'>('ref-only');
  // Sprint β 2026-05-14 — capability-aware controls. Aspect/quality/duration
  // live in VideoControlsValue now; resolution/seed/end-image are rendered
  // only when the active provider supports them.
  const [controls, setControls] = useState<VideoControlsValue>(() =>
    normalizeControls(
      {
        prompt: '',
        aspect_ratio: currentSettings.aspect_ratio,
        quality_tier: currentSettings.quality_tier,
        duration_seconds: clampDuration(currentSettings.duration_seconds),
        // TD-85: seed the resolution so the selector reflects the persisted
        // value (e.g. 1080p) instead of normalizeControls' 720p fallback.
        ...(currentSettings.resolution ? { resolution: currentSettings.resolution } : {}),
      },
      VIDEO_PROVIDER_CAPS[currentSettings.provider_id ?? 'seedance-fal-img2vid'],
    ),
  );
  const aspect = controls.aspect_ratio;
  const quality = controls.quality_tier;
  const duration = controls.duration_seconds;
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Episode-authoritative format lock (2026-06-09). Fetched from the episode
  // settings; null until loaded / when no episodeId. When the episode declares
  // a video config and per-shot overrides are off, format controls are locked.
  const [episodeVideo, setEpisodeVideo] = useState<EpisodeVideoLock | null>(null);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  useEffect(() => {
    if (!episodeId) {
      setEpisodeVideo(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/episodes/${episodeId}/settings`)
      .then((r) => r.json())
      .then((j: { data?: { metadata?: Record<string, unknown> } }) => {
        if (cancelled) return;
        const v = (
          j.data?.metadata?.generation_config as { video?: EpisodeVideoLock } | undefined
        )?.video;
        setEpisodeVideo(v ?? null);
      })
      .catch(() => {
        // Non-fatal — no lock shown, server still enforces episode authority.
      });
    return () => {
      cancelled = true;
    };
  }, [episodeId]);

  // The episode declares at least one FORMAT field → it's an authority.
  const episodeDeclaresFormat = Boolean(
    episodeVideo &&
      (episodeVideo.provider_id ||
        episodeVideo.aspect_ratio ||
        episodeVideo.quality_tier ||
        episodeVideo.resolution),
  );
  const allowShotOverrides = episodeVideo?.allow_shot_overrides === true;
  const formatLocked = episodeDeclaresFormat && !allowShotOverrides;

  // Re-seed local state when a different asset is opened or upstream metadata changes.
  useEffect(() => {
    const nextProvider = currentSettings.provider_id ?? 'seedance-fal-img2vid';
    setProvider(nextProvider);
    setControls(
      normalizeControls(
        {
          prompt: '',
          aspect_ratio: currentSettings.aspect_ratio,
          quality_tier: currentSettings.quality_tier,
          duration_seconds: clampDuration(currentSettings.duration_seconds),
          // TD-85: preserve persisted resolution across asset switches.
          ...(currentSettings.resolution ? { resolution: currentSettings.resolution } : {}),
        },
        VIDEO_PROVIDER_CAPS[nextProvider],
      ),
    );
    setAnchorMode('ref-only');
    setError(null);
    setSuccess(false);
    // intentionally key on assetId so we don't reset state on every parent rerender
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  // Switching to ref-only nulls the end frame so a stale uuid is never shipped;
  // switching to two-anchor just reveals the picker (Director fills it).
  function changeAnchorMode(next: 'ref-only' | 'two-anchor') {
    setAnchorMode(next);
    setOverrideConfirmed(false);
    if (next === 'ref-only') {
      setControls((prev) => ({ ...prev, end_image_asset_id: null }));
    }
  }

  // Anchor toggle only applies to providers that accept an end frame (Seedance).
  const supportsEndImage = VIDEO_PROVIDER_CAPS[provider].supports_end_image;

  const costEstimate = useMemo(() => {
    // TD-85 (2026-06-01): route through estimateCost so the displayed price
    // honours resolution_cost_mult (e.g. 1080p = 2.25× the 720p baseline).
    // Previously this used a flat provider×quality×duration rate and
    // under-reported the cost of higher-resolution renders.
    const raw = estimateCost(VIDEO_PROVIDER_CAPS[provider], {
      quality_tier: quality,
      duration_seconds: duration,
      resolution: controls.resolution,
    });
    return Math.round(raw * 1000) / 1000; // $0.001 precision
  }, [provider, quality, duration, controls.resolution]);

  // Aspect is the only value this panel still sends, so it is the only thing
  // that can be "dirty" or diverge from the episode authority. Comparing the
  // plan-owned fields here would raise a confirm prompt for a divergence the
  // panel cannot actually cause (2026-07-29).
  const dirty = aspect !== currentSettings.aspect_ratio;

  // When per-shot overrides are ALLOWED, surface whether the aspect diverges
  // from the episode authority — q26b requires an explicit confirm before a
  // divergent regenerate (no silent override).
  const overrideDiffs = useMemo(() => {
    if (!episodeDeclaresFormat || !allowShotOverrides) return [];
    if (episodeVideo?.aspect_ratio && episodeVideo.aspect_ratio !== aspect) {
      return [`aspect ${episodeVideo.aspect_ratio}→${aspect}`];
    }
    return [];
  }, [episodeDeclaresFormat, allowShotOverrides, episodeVideo, aspect]);
  const needsOverrideConfirm = overrideDiffs.length > 0 && !overrideConfirmed;

  async function regenerate() {
    // fail-loud (anchor-mode doctrine): two anchors require an end frame. Never
    // silently degrade to ref-only — make the missing end frame explicit.
    if (supportsEndImage && anchorMode === 'two-anchor' && !controls.end_image_asset_id) {
      setError('Нет end-якоря для этого шота — выбери кадр или переключись на «только реф».');
      return;
    }
    setBusy(true);
    setSuccess(false);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/regenerate-video`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // No prompt / provider / quality_tier / resolution / seed /
          // duration_seconds — the server reads every one of them from this
          // shot's APPROVED SPC-shot_plan (E33 audit, 2026-07-29). The route's
          // schema rejects them outright, so sending them would 400.
          aspect_ratio: aspect,
          ...(controls.end_image_asset_id
            ? { end_image_asset_id: controls.end_image_asset_id }
            : {}),
          reference_asset_id: currentSettings.reference_asset_id,
          directorConfirm: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Regenerate failed');
      }
      const j = (await res.json().catch(() => ({}))) as {
        data?: { asset_id?: string };
      };
      const newAssetId = j.data?.asset_id;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      onChanged();
      // Notify parent for auto-focus; shot_id is stable across regens.
      if (newAssetId && onRegenerated) {
        onRegenerated(storyboardShot.shot_id, newAssetId);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const disabled = readOnly === true || busy;

  // Aspect is the only format field this panel still sends; quality /
  // resolution / duration / seed are plan-owned (2026-07-29) and are no longer
  // offered as controls that would silently do nothing. Anchor-mode doctrine:
  // the end-frame picker shows ONLY in two-anchor mode; ref-only (the orbit
  // default) hides it and end_image stays null. When the episode authority owns
  // the format AND we're in ref-only mode nothing is left to edit — render no
  // control panel rather than an empty one.
  const editableFields = useMemo(() => {
    const base: ProviderControlField[] = formatLocked ? [] : ['aspect'];
    if (anchorMode === 'two-anchor') base.push('endImage');
    return base;
  }, [formatLocked, anchorMode]);

  return (
    <div className="space-y-3" aria-label="VGEN shot panel">
      {/* ── Video preview ────────────────────────────────────────────── */}
      <div
        className="rounded-lg overflow-hidden border border-glass relative"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 90%, transparent)',
          aspectRatio: aspect === '16:9' ? '16 / 9' : aspect === '9:16' ? '9 / 16' : '1 / 1',
          maxHeight: aspect === '9:16' ? 480 : undefined,
        }}
      >
        {videoUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            key={videoUrl}
            src={videoUrl}
            controls
            preload="metadata"
            className="w-full h-full object-contain bg-black"
            aria-label={`Generated video for shot ${storyboardShot.shot_id}`}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-muted">
            {busy ? (
              <>
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                <div className="text-xs">Generating…</div>
                <div className="text-[10px]">~30–90 seconds</div>
              </>
            ) : (
              <>
                <PlayIcon size={28} strokeWidth={1.4} />
                <div className="text-xs">No video yet</div>
                <div className="text-[10px]">Adjust settings and click Generate</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Episode format lock notice (q26b / pitfall #4) ───────────── */}
      {formatLocked && (
        <div
          className="rounded-md px-2.5 py-2 text-[11px] leading-snug border"
          style={{
            background: 'color-mix(in oklab, var(--accent-info, #38bdf8) 10%, transparent)',
            borderColor: 'color-mix(in oklab, var(--accent-info, #38bdf8) 35%, transparent)',
            color: 'var(--text-secondary)',
          }}
        >
          🔒 Format is locked by <strong>Episode Settings</strong> (
          {[
            episodeVideo?.provider_id,
            episodeVideo?.aspect_ratio,
            episodeVideo?.quality_tier,
            episodeVideo?.resolution,
          ]
            .filter(Boolean)
            .join(' · ')}
          ). Enable “Allow per-shot overrides” on the episode to edit the aspect per-shot.
        </div>
      )}

      {/* ── Plan authority notice ───────────────────────────────────── */}
      <div
        className="rounded-md px-2.5 py-2 text-[11px] leading-snug border"
        style={{
          background: 'color-mix(in oklab, var(--accent-info, #38bdf8) 10%, transparent)',
          borderColor: 'color-mix(in oklab, var(--accent-info, #38bdf8) 35%, transparent)',
          color: 'var(--text-secondary)',
        }}
      >
        📄 <strong>Prompt · provider · quality · resolution · seed · duration</strong> come from
        this shot’s <strong>approved Shot Plan</strong> — shown below as the last render’s
        values, read-only. To change them: Request revision (Animator re-authors) or edit the
        plan on its contract page.
      </div>

      {/* ── Provider — read-only mirror of the plan-driven last render ── */}
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          Provider
          <span
            className="ml-2 normal-case font-normal"
            style={{ color: 'var(--accent-info, #38bdf8)' }}
          >
            · from approved plan
          </span>
        </span>
        <select
          value={provider}
          disabled
          aria-label="Video provider (from the approved shot plan)"
          title="The server resolves the provider from this shot's APPROVED Shot Plan."
          className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none disabled:opacity-60 cursor-default"
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label} — {opt.sub}
            </option>
          ))}
        </select>
      </label>

      {/* ── Anchor mode (orbit ⇒ ref-only doctrine, 2026-06-17) ──────── */}
      {supportsEndImage && (
        <div className="block">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Режим якоря
          </span>
          <div className="mt-1 flex gap-1.5" role="group" aria-label="Anchor mode">
            {([
              { mode: 'ref-only' as const, label: '🎯 только реф', hint: 'единственный якорь — лучший выбор для орбиты камеры (дефолт)' },
              { mode: 'two-anchor' as const, label: '🔗 два якоря', hint: 'start + end_image — только для статичного non-orbit match-cut' },
            ]).map(({ mode, label, hint }) => {
              const active = anchorMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeAnchorMode(mode)}
                  disabled={disabled}
                  title={hint}
                  aria-pressed={active}
                  className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: active
                      ? 'color-mix(in oklab, var(--accent-primary) 18%, transparent)'
                      : 'var(--bg-elevated)',
                    color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
                    borderColor: active
                      ? 'color-mix(in oklab, var(--accent-primary) 50%, transparent)'
                      : 'color-mix(in oklab, var(--text-muted) 22%, transparent)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Capability-aware controls (Sprint β) ─────────────────────── */}
      {editableFields.length > 0 && (
        <ProviderControlPanel
          provider={provider}
          value={controls}
          onChange={(next) => {
            setControls(next);
            setOverrideConfirmed(false);
          }}
          disabled={disabled}
          density="full"
          fields={editableFields}
        />
      )}

      {/* ── Override-episode confirm (q26b) ──────────────────────────── */}
      {overrideDiffs.length > 0 && (
        <label
          className="flex items-start gap-2 cursor-pointer rounded-md px-2.5 py-2 text-[11px] leading-snug border"
          style={{
            background: 'color-mix(in oklab, var(--accent-warning, #f59e0b) 10%, transparent)',
            borderColor: 'color-mix(in oklab, var(--accent-warning, #f59e0b) 40%, transparent)',
            color: 'var(--text-secondary)',
          }}
        >
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent-warning,#f59e0b)] cursor-pointer"
            checked={overrideConfirmed}
            disabled={disabled}
            onChange={(e) => setOverrideConfirmed(e.target.checked)}
          />
          <span>
            This shot <strong>overrides episode settings</strong> ({overrideDiffs.join(', ')}).
            Confirm to regenerate with the per-shot format.
          </span>
        </label>
      )}

      {/* Reference image — read-only chip; Replace picker is a follow-up. */}
      <div className="block">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">Reference image</span>
        <div
          className="mt-1 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-xs text-text-secondary flex items-center gap-2"
          title={currentSettings.reference_asset_id || 'No reference assigned'}
        >
          <ImageIcon size={13} className="shrink-0 text-text-muted" />
          <span className="font-mono truncate flex-1">
            {currentSettings.reference_asset_id
              ? `${currentSettings.reference_asset_id.slice(0, 8)}…`
              : 'No reference'}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled
            title="Replace reference — follow-up"
            aria-label="Replace reference"
          >
            Replace
          </Button>
        </div>
      </div>

      {/* ── Prompt — read-only mirror of the APPROVED Shot Plan ──────── */}
      <label className="block">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Prompt
            <span
              className="ml-2 normal-case font-normal"
              style={{ color: 'var(--accent-info, #38bdf8)' }}
              title="The server renders the prompt from this shot's APPROVED Shot Plan. To change it: Request revision (Animator re-authors), or edit the plan on its contract page."
            >
              · from approved plan
            </span>
          </span>
        </div>
        <textarea
          value={currentSettings.prompt}
          readOnly
          rows={5}
          aria-label="Video generation prompt (from the approved shot plan)"
          placeholder="Prompt comes from the approved Shot Plan"
          className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-secondary leading-relaxed focus:outline-none cursor-default"
        />
      </label>

      {/* ── Cost preview + Status chip + Generate (Phase A.1: high-contrast) ─── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="text-xs text-text-secondary inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-glass"
            style={{ background: 'color-mix(in oklab, var(--accent-primary) 6%, transparent)' }}
          >
            <Sparkles size={12} className="shrink-0" style={{ color: 'var(--accent-primary)' }} />
            <span
              title="Estimated from the LAST render's provider / quality / resolution / duration. The approved Shot Plan is what the server actually executes — if the plan was re-authored since, the real cost follows the plan."
            >
              Will cost ~<span className="font-mono text-text-primary">${costEstimate.toFixed(3)}</span>{' '}
              <span className="text-text-muted">(est. from last render)</span>{' '}
              <span className="text-text-muted">
                ({duration}s × ${COST_RATE_USD_PER_SECOND[provider][quality].toFixed(4)}/s
                {(() => {
                  // TD-85: surface the resolution multiplier so the breakdown
                  // reconciles with the estimate (e.g. 1080p = ×2.25).
                  const mult =
                    controls.resolution
                      ? VIDEO_PROVIDER_CAPS[provider].resolution_cost_mult?.[controls.resolution]
                      : undefined;
                  return mult && mult !== 1
                    ? ` × ${mult} (${controls.resolution})`
                    : '';
                })()}
                )
              </span>
            </span>
          </div>
          <RegenerateStatusChip
            busy={busy}
            success={success}
            error={error}
            videoUrl={videoUrl}
          />
        </div>

        <button
          type="button"
          onClick={regenerate}
          disabled={disabled || needsOverrideConfirm}
          title={
            readOnly
              ? 'Asset is locked'
              : needsOverrideConfirm
                ? 'Confirm the per-shot override checkbox first'
                : dirty
                  ? 'Generate a new mp4 with the current settings'
                  : 'Re-generate with the same settings'
          }
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: error
              ? 'color-mix(in oklab, var(--accent-danger) 18%, transparent)'
              : success
                ? 'color-mix(in oklab, var(--accent-success) 22%, transparent)'
                : 'color-mix(in oklab, var(--accent-primary) 22%, transparent)',
            color: error
              ? 'var(--accent-danger)'
              : success
                ? 'var(--accent-success)'
                : 'var(--accent-primary)',
            borderColor: error
              ? 'color-mix(in oklab, var(--accent-danger) 55%, transparent)'
              : success
                ? 'color-mix(in oklab, var(--accent-success) 55%, transparent)'
                : 'color-mix(in oklab, var(--accent-primary) 55%, transparent)',
            boxShadow:
              busy || success || error
                ? 'none'
                : '0 0 0 3px color-mix(in oklab, var(--accent-primary) 12%, transparent)',
          }}
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          {success && !busy && <CheckCircle2 size={15} />}
          {error && !busy && <AlertCircle size={15} />}
          {!busy && !success && !error && <RefreshCw size={15} />}
          {busy
            ? 'Generating…'
            : error
              ? 'Retry'
              : success
                ? 'Generated ✓'
                : videoUrl
                  ? 'Re-generate shot'
                  : 'Generate shot'}
        </button>
      </div>

      {error && (
        <div
          className="rounded-md px-2.5 py-1.5 text-[11px] inline-flex items-start gap-1.5 w-full"
          style={{
            background: 'color-mix(in oklab, var(--accent-danger) 12%, transparent)',
            color: 'var(--accent-danger)',
          }}
          role="alert"
        >
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          <span className="leading-snug">{error}</span>
        </div>
      )}
    </div>
  );
}

// ── Status chip ─────────────────────────────────────────────────────────────
// Compact pill showing the current regenerate lifecycle phase next to the
// button so Director gets persistent feedback without scanning for spinner /
// inline error block. Phase A.1 directive: "show generating / failed /
// completed".

function RegenerateStatusChip({
  busy,
  success,
  error,
  videoUrl,
}: {
  busy: boolean;
  success: boolean;
  error: string | null;
  videoUrl: string | null;
}) {
  let label: string;
  let color: string;
  let bg: string;
  let icon: React.ReactNode;
  if (busy) {
    label = 'Generating… 30–90s';
    color = 'var(--accent-warning)';
    bg = 'color-mix(in oklab, var(--accent-warning) 14%, transparent)';
    icon = <Loader2 size={11} className="animate-spin" />;
  } else if (error) {
    label = 'Failed — see error';
    color = 'var(--accent-danger)';
    bg = 'color-mix(in oklab, var(--accent-danger) 14%, transparent)';
    icon = <AlertCircle size={11} />;
  } else if (success) {
    label = 'Completed';
    color = 'var(--accent-success)';
    bg = 'color-mix(in oklab, var(--accent-success) 14%, transparent)';
    icon = <CheckCircle2 size={11} />;
  } else {
    label = videoUrl ? 'Ready to re-generate' : 'Ready to generate';
    color = 'var(--text-muted)';
    bg = 'transparent';
    icon = <Sparkles size={11} />;
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border"
      style={{
        background: bg,
        color,
        borderColor: `color-mix(in oklab, ${color} 32%, transparent)`,
      }}
      aria-live="polite"
    >
      {icon}
      {label}
    </span>
  );
}
