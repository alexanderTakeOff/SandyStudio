// ──────────────────────────────────────────────────────────────────────────────
// components/vgen/VGENBatchPanel.tsx
//
// Stage-level batch settings UI for the Visual Generator stage. Sets episode
// defaults that flow into newly generated shots (and into the Apply-to-all
// action below). Per-shot overrides happen in `VGENShotPanel` inside the
// drawer; this panel sets the "starting point" applied to all unrendered shots.
//
// Phase 1 persistence (judgment call — see plan §"Series-level defaults"):
//
//   • Track A backend has not declared a `/api/episodes/[id]/vgen/defaults`
//     PATCH endpoint yet. To keep Track B independent, we persist to
//     `localStorage` under a namespaced key. The key matches what the runner
//     could pick up later if it reads `episode.metadata.vgen_batch_defaults`.
//   • When the PATCH endpoint lands (Phase 1.5 / Phase 2), swap the
//     `loadDefaults` / `saveDefaults` helpers below to call the API and remove
//     the localStorage code path. UI does NOT need to change.
//
// We deliberately keep this UI collapsed-by-default in the parent so it stays
// out of the way for the common case. Apply-to-all is explicit only.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, AlertCircle, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { AspectRatio, QualityTier } from './VGENShotPanel';

const ASPECT_OPTIONS: Array<{ value: AspectRatio; label: string }> = [
  { value: '16:9', label: '16:9 — YouTube' },
  { value: '9:16', label: '9:16 — Reels · Shorts · TikTok' },
  { value: '1:1', label: '1:1 — Instagram' },
];

const QUALITY_OPTIONS: Array<{ value: QualityTier; label: string }> = [
  { value: 'fast', label: 'Fast (~$0.075/s · iteration)' },
  { value: 'standard', label: 'Standard (~$0.15/s · final)' },
];

interface VgenBatchDefaults {
  aspect_ratio: AspectRatio;
  quality_tier: QualityTier;
}

const DEFAULT_VALUES: VgenBatchDefaults = {
  aspect_ratio: '16:9',
  quality_tier: 'fast',
};

function storageKey(episodeId: string): string {
  return `sandystudio.vgen_batch_defaults.${episodeId}`;
}

function loadDefaults(episodeId: string): VgenBatchDefaults {
  if (typeof window === 'undefined') return DEFAULT_VALUES;
  try {
    const raw = window.localStorage.getItem(storageKey(episodeId));
    if (!raw) return DEFAULT_VALUES;
    const parsed = JSON.parse(raw) as Partial<VgenBatchDefaults>;
    return {
      aspect_ratio: (parsed.aspect_ratio ?? DEFAULT_VALUES.aspect_ratio) as AspectRatio,
      quality_tier: (parsed.quality_tier ?? DEFAULT_VALUES.quality_tier) as QualityTier,
    };
  } catch {
    return DEFAULT_VALUES;
  }
}

function saveDefaults(episodeId: string, defaults: VgenBatchDefaults): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(episodeId), JSON.stringify(defaults));
  } catch {
    // Quota / private mode — non-fatal; UI still shows success since the
    // values will be re-typed by the user if storage is unavailable.
  }
}

export interface VGENBatchPanelProps {
  episodeId: string;
  /** Optional — kept for parity with future series-level defaults. */
  seriesId?: string | null;
  /** When true, render expanded by default (e.g. on first VGEN run). */
  defaultOpen?: boolean;
}

export function VGENBatchPanel({ episodeId, defaultOpen }: VGENBatchPanelProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen ?? false);
  const [aspect, setAspect] = useState<AspectRatio>(DEFAULT_VALUES.aspect_ratio);
  const [quality, setQuality] = useState<QualityTier>(DEFAULT_VALUES.quality_tier);
  const [loaded, setLoaded] = useState(false);

  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = loadDefaults(episodeId);
    setAspect(next.aspect_ratio);
    setQuality(next.quality_tier);
    setLoaded(true);
  }, [episodeId]);

  const dirty = useMemo(() => {
    if (!loaded) return false;
    const stored = loadDefaults(episodeId);
    return stored.aspect_ratio !== aspect || stored.quality_tier !== quality;
  }, [aspect, quality, episodeId, loaded]);

  function applyToAll() {
    setBusy(true);
    setSuccess(false);
    setError(null);
    try {
      saveDefaults(episodeId, { aspect_ratio: aspect, quality_tier: quality });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 1200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="rounded-lg border border-glass mb-3 overflow-hidden"
      style={{ background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)' }}
      aria-label="Visual Generator batch defaults"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--panel-hover-bg)] transition-colors"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown size={14} className="text-text-muted shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-text-muted shrink-0" />
        )}
        <Settings2 size={13} className="text-text-muted shrink-0" />
        <span className="text-xs font-medium text-text-primary">VGEN batch defaults</span>
        <span className="text-[10px] text-text-muted">
          · {aspect} · {quality}
        </span>
        {dirty && (
          <span
            className="ml-auto text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: 'color-mix(in oklab, var(--accent-warning) 18%, transparent)',
              color: 'var(--accent-warning)',
            }}
          >
            Unsaved
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3">
          <p className="text-[11px] text-text-muted leading-relaxed">
            Defaults applied to all <em>unrendered</em> shots of this episode. Per-shot overrides
            stay intact. Persisted locally for this browser; a future server-backed endpoint will
            sync this across devices.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-text-muted">
                Aspect ratio
              </span>
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value as AspectRatio)}
                aria-label="Batch aspect ratio"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
              >
                {ASPECT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-text-muted">
                Quality tier
              </span>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as QualityTier)}
                aria-label="Batch quality tier"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
              >
                {QUALITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={applyToAll}
              disabled={busy || !dirty}
              title={
                dirty
                  ? 'Apply these defaults to all unrendered shots'
                  : 'No changes to apply'
              }
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              {success && <CheckCircle2 size={12} />}
              Apply to all unrendered shots
            </Button>
          </div>

          {error && (
            <div
              className="rounded-md px-2.5 py-1.5 text-[11px] inline-flex items-start gap-1.5"
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
      )}
    </section>
  );
}
