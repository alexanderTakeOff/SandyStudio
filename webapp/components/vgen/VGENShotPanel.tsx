// ──────────────────────────────────────────────────────────────────────────────
// components/vgen/VGENShotPanel.tsx
//
// Universal Core controls panel for a single VID-shot asset. Sits inside the
// EpisodeAssetDrawer when `asset.file_type === 'VID-shot'`. Director uses it
// to inspect the generated mp4, tweak Universal Core settings (aspect ratio,
// quality tier, duration, prompt, reference image), and re-generate the shot
// with the new settings via POST /api/assets/[id]/regenerate-video.
//
// Universal Core settings (Phase 1, see plans/purrfect-stirring-hollerith.md):
//   - aspect_ratio:     '16:9' | '9:16' | '1:1'
//   - quality_tier:     'fast' | 'standard'
//   - duration_seconds: 1–8
//   - reference_asset_id: UUID of approved EREF (read-only chip in Phase 1)
//   - prompt:           free text, auto-built upstream, editable here
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

// ── Types ────────────────────────────────────────────────────────────────────

export type AspectRatio = '16:9' | '9:16' | '1:1';
export type QualityTier = 'fast' | 'standard';
export type VgenProvider = 'seedance-fal-img2vid' | 'veo-3-img2vid';

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
}

export interface VGENShotPanelProps {
  assetId: string;
  /** Drive or staging URL of the generated mp4. Null while generating or before first run. */
  videoUrl: string | null;
  /** Storyboard shot row — used as fallback when prompt is empty. */
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

function buildPromptFromShot(shot: VGENShotPanelStoryboardShot): string {
  const parts: string[] = [];
  if (shot.action_prose) parts.push(shot.action_prose.trim());
  if (shot.camera_angle) parts.push(`Camera: ${shot.camera_angle.trim()}.`);
  if (shot.expected_emotion) parts.push(`Mood: ${shot.expected_emotion.trim()}.`);
  if (shot.expected_gag) parts.push(`Beat: ${shot.expected_gag.trim()}.`);
  if (shot.key_beat) parts.push(`Key: ${shot.key_beat.trim()}.`);
  return parts.join(' ');
}

// ── Component ────────────────────────────────────────────────────────────────

export function VGENShotPanel({
  assetId,
  videoUrl,
  storyboardShot,
  currentSettings,
  onChanged,
  onRegenerated,
  readOnly,
}: VGENShotPanelProps) {
  const [prompt, setPrompt] = useState<string>(
    currentSettings.prompt && currentSettings.prompt.trim().length > 0
      ? currentSettings.prompt
      : buildPromptFromShot(storyboardShot),
  );
  const [aspect, setAspect] = useState<AspectRatio>(currentSettings.aspect_ratio);
  const [quality, setQuality] = useState<QualityTier>(currentSettings.quality_tier);
  const [provider, setProvider] = useState<VgenProvider>(
    currentSettings.provider_id ?? 'seedance-fal-img2vid',
  );
  const [duration, setDuration] = useState<number>(clampDuration(currentSettings.duration_seconds));
  // Track whether Director actually edited the prompt textarea. When false,
  // regenerate sends NO `prompt` field so the server rebuilds via the latest
  // `buildShotPromptV2(storyboardShot, episodeTitle, bibleCanon)` — Phase A.1
  // bug fix 2026-05-08: without this, the panel always shipped the previously-
  // persisted prompt back, and Bible canon never landed on regen.
  const [promptEdited, setPromptEdited] = useState(false);

  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed local state when a different asset is opened or upstream metadata changes.
  useEffect(() => {
    setPrompt(
      currentSettings.prompt && currentSettings.prompt.trim().length > 0
        ? currentSettings.prompt
        : buildPromptFromShot(storyboardShot),
    );
    setAspect(currentSettings.aspect_ratio);
    setQuality(currentSettings.quality_tier);
    setProvider(currentSettings.provider_id ?? 'seedance-fal-img2vid');
    setDuration(clampDuration(currentSettings.duration_seconds));
    setPromptEdited(false);
    setError(null);
    setSuccess(false);
    // intentionally key on assetId so we don't reset state on every parent rerender
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  const costEstimate = useMemo(() => {
    const rate = COST_RATE_USD_PER_SECOND[provider][quality];
    return Math.round(rate * duration * 1000) / 1000; // $0.001 precision
  }, [provider, quality, duration]);

  const dirty = useMemo(() => {
    return (
      prompt !== currentSettings.prompt ||
      aspect !== currentSettings.aspect_ratio ||
      quality !== currentSettings.quality_tier ||
      provider !== (currentSettings.provider_id ?? 'seedance-fal-img2vid') ||
      duration !== currentSettings.duration_seconds
    );
  }, [prompt, aspect, quality, provider, duration, currentSettings]);

  async function regenerate() {
    setBusy(true);
    setSuccess(false);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/regenerate-video`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // Send `prompt` ONLY when Director explicitly edited the textarea.
          // Otherwise omit so the server rebuilds via buildShotPromptV2 with
          // current Bible canon. (See `promptEdited` comment above.)
          ...(promptEdited ? { prompt } : {}),
          aspect_ratio: aspect,
          quality_tier: quality,
          provider,
          duration_seconds: duration,
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

      {/* ── Universal Core controls — 2 columns ─────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Provider */}
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as VgenProvider)}
            disabled={disabled}
            aria-label="Video provider"
            className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)] disabled:opacity-50"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} — {opt.sub}
              </option>
            ))}
          </select>
        </label>

        {/* Aspect ratio */}
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Aspect ratio</span>
          <select
            value={aspect}
            onChange={(e) => setAspect(e.target.value as AspectRatio)}
            disabled={disabled}
            aria-label="Aspect ratio"
            className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)] disabled:opacity-50"
          >
            {ASPECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} — {opt.sub}
              </option>
            ))}
          </select>
        </label>

        {/* Quality tier */}
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Quality tier</span>
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as QualityTier)}
            disabled={disabled}
            aria-label="Quality tier"
            className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)] disabled:opacity-50"
          >
            {QUALITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} — {opt.sub}
              </option>
            ))}
          </select>
        </label>

        {/* Duration */}
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Duration (s) — {DURATION_MIN}–{DURATION_MAX}
          </span>
          <input
            type="number"
            min={DURATION_MIN}
            max={DURATION_MAX}
            step={1}
            value={duration}
            onChange={(e) => setDuration(clampDuration(Number(e.target.value)))}
            disabled={disabled}
            aria-label="Duration in seconds"
            className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)] disabled:opacity-50"
          />
        </label>

        {/* Reference image — read-only chip in Phase 1; replace picker is stub. */}
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
              title="Replace reference — Phase 2"
              aria-label="Replace reference"
            >
              Replace
            </Button>
          </div>
        </div>
      </div>

      {/* ── Prompt textarea ─────────────────────────────────────────── */}
      <label className="block">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Prompt
            {!promptEdited && (
              <span
                className="ml-2 normal-case font-normal"
                style={{ color: 'var(--accent-info, #38bdf8)' }}
                title="Auto-built from storyboard + Bible canon. Server rebuilds fresh on regenerate."
              >
                · auto
              </span>
            )}
            {promptEdited && (
              <span
                className="ml-2 normal-case font-normal"
                style={{ color: 'var(--accent-warning, #f59e0b)' }}
                title="Director edited — server uses this verbatim, ignores Bible canon"
              >
                · edited
              </span>
            )}
          </span>
          {promptEdited && (
            <button
              type="button"
              onClick={() => {
                setPrompt(
                  currentSettings.prompt && currentSettings.prompt.trim().length > 0
                    ? currentSettings.prompt
                    : buildPromptFromShot(storyboardShot),
                );
                setPromptEdited(false);
              }}
              className="text-[10px] underline text-text-muted hover:text-text-secondary"
              title="Discard edits — let server rebuild prompt with current Bible canon on regen"
            >
              Reset to auto
            </button>
          )}
        </div>
        <textarea
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setPromptEdited(true);
          }}
          disabled={disabled}
          rows={5}
          aria-label="Video generation prompt"
          placeholder="Describe the action, camera, mood…"
          className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary leading-relaxed focus:outline-none focus:border-[var(--accent-primary)] disabled:opacity-50"
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
            <span>
              Will cost ~<span className="font-mono text-text-primary">${costEstimate.toFixed(3)}</span>{' '}
              <span className="text-text-muted">
                ({duration}s × ${QUALITY_RATE_USD_PER_SECOND[quality].toFixed(3)}/s)
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
          disabled={disabled}
          title={
            readOnly
              ? 'Asset is locked'
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
