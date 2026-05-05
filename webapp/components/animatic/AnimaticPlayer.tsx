// ──────────────────────────────────────────────────────────────────────────────
// components/animatic/AnimaticPlayer.tsx
// Browser-native animatic preview — no mp4 render.
//
// Per Director (2026-05-05): рендерить mp4 для preview бессмысленно. Браузер
// сам умеет — <img> + <audio> + setTimeout, plus можно подвинуть per-shot
// timing live.
//
// What this component does:
//   - Plays the approved IMG-episode_ref shots in order, each held for its
//     `duration_seconds` (with optional Director override).
//   - Syncs to a single uploaded music track (audio element).
//   - Lets Director Play / Pause / Stop / Reset, click on timeline segments
//     to seek, and edit per-shot durations via −1s / +1s / numeric input.
//   - "Save timing" persists director_overrides via PATCH /animatic-timing.
//   - "Upload music track" posts a .mp3 / .wav to /upload-music.
//
// Playback engine:
//   - requestAnimationFrame loop with `Date.now()` baseline; each tick sets
//     the current shot index by walking the cumulative-start array.
//   - Audio is the source of truth for time when present (re-syncs to
//     audio.currentTime on Play). Without audio we use elapsed wall time.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Upload,
  Music2,
  Save,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  ANIMATIC_CONTRACT,
  computeTotalDuration,
  effectiveDurationSeconds,
  type AnimaticContract,
  type AnimaticDirectorOverride,
  type AnimaticShot,
} from '@/lib/api/animatic-shotlist';

const SECOND_STEP = 1.0;
const MIN_SHOT_S = 0.5;
const MAX_SHOT_S = 60;

export interface AnimaticPlayerProps {
  assetId: string;
  contract: AnimaticContract;
  /** Called after a successful save / upload — drawer should refetch. */
  onChanged: () => void;
}

interface ShotTime {
  shot: AnimaticShot;
  duration: number;       // effective (override applied)
  cumStart: number;       // cumulative start (s) from t=0
}

function buildTimeline(
  shotList: AnimaticShot[],
  overrides: Record<string, AnimaticDirectorOverride> | undefined,
): { times: ShotTime[]; total: number } {
  const times: ShotTime[] = [];
  let cum = 0;
  for (const shot of shotList) {
    const duration = effectiveDurationSeconds(shot, overrides);
    times.push({ shot, duration, cumStart: cum });
    cum += duration;
  }
  return { times, total: Math.round(cum * 100) / 100 };
}

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AnimaticPlayer({ assetId, contract, onChanged }: AnimaticPlayerProps): JSX.Element {
  // Local copy of overrides so Director can edit live without round-tripping
  // to DB on every click. Saved via Save Timing button.
  const [overrides, setOverrides] = useState<Record<string, AnimaticDirectorOverride>>(
    () => ({ ...(contract.director_overrides ?? {}) }),
  );
  const [dirty, setDirty] = useState(false);

  // Re-seed overrides whenever the asset row changes (e.g. parent SWR refetch).
  useEffect(() => {
    setOverrides({ ...(contract.director_overrides ?? {}) });
    setDirty(false);
  }, [contract]);

  const { times, total } = useMemo(
    () => buildTimeline(contract.shot_list, overrides),
    [contract.shot_list, overrides],
  );

  // Playback state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentT, setCurrentT] = useState(0); // seconds elapsed
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);
  const startTOffsetRef = useRef<number>(0); // where we resumed from

  // ── Playback engine ──────────────────────────────────────────────────────
  const computeIndex = useCallback(
    (t: number): number => {
      // Walk forward; small list (<100) so linear scan is fine.
      for (let i = times.length - 1; i >= 0; i--) {
        if (t >= times[i]!.cumStart) return i;
      }
      return 0;
    },
    [times],
  );

  const tick = useCallback(() => {
    const audio = audioRef.current;
    let t: number;
    if (audio && !audio.paused) {
      t = audio.currentTime;
    } else {
      const elapsed = (Date.now() - startTsRef.current) / 1000;
      t = startTOffsetRef.current + elapsed;
    }
    if (t >= total) {
      // Reached end — pause.
      setCurrentT(total);
      setCurrentIndex(times.length - 1);
      setIsPlaying(false);
      if (audio) audio.pause();
      rafRef.current = null;
      return;
    }
    setCurrentT(t);
    setCurrentIndex(computeIndex(t));
    rafRef.current = requestAnimationFrame(tick);
  }, [computeIndex, times.length, total]);

  // Stop the RAF loop when component unmounts or when isPlaying flips off.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handlePlay = useCallback(() => {
    if (isPlaying) return;
    if (currentT >= total) {
      // Auto-reset on play after end.
      startTOffsetRef.current = 0;
      setCurrentT(0);
      setCurrentIndex(0);
      const audio = audioRef.current;
      if (audio) audio.currentTime = 0;
    } else {
      startTOffsetRef.current = currentT;
    }
    startTsRef.current = Date.now();
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = startTOffsetRef.current;
      void audio.play().catch(() => {
        /* user gesture might be needed — ignore */
      });
    }
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [currentT, isPlaying, tick, total]);

  const handlePause = useCallback(() => {
    if (!isPlaying) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const audio = audioRef.current;
    if (audio) audio.pause();
    setIsPlaying(false);
  }, [isPlaying]);

  const handleStop = useCallback(() => {
    handlePause();
    // Stop = pause without rewinding (cursor stays).
  }, [handlePause]);

  const handleReset = useCallback(() => {
    handlePause();
    startTOffsetRef.current = 0;
    setCurrentT(0);
    setCurrentIndex(0);
    const audio = audioRef.current;
    if (audio) audio.currentTime = 0;
  }, [handlePause]);

  const seekTo = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(t, total));
      startTOffsetRef.current = clamped;
      startTsRef.current = Date.now();
      setCurrentT(clamped);
      setCurrentIndex(computeIndex(clamped));
      const audio = audioRef.current;
      if (audio) audio.currentTime = clamped;
    },
    [computeIndex, total],
  );

  // ── Duration editing ─────────────────────────────────────────────────────

  const setDuration = useCallback(
    (shotId: string, value: number) => {
      const safe = Math.max(MIN_SHOT_S, Math.min(MAX_SHOT_S, Math.round(value * 10) / 10));
      setOverrides((prev) => ({
        ...prev,
        [shotId]: { duration_seconds: safe, edited_at: new Date().toISOString() },
      }));
      setDirty(true);
    },
    [],
  );

  // ── Save timing ──────────────────────────────────────────────────────────

  const [savingTiming, setSavingTiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveTiming = useCallback(async () => {
    setSavingTiming(true);
    setError(null);
    try {
      const overridesPayload: Record<string, { duration_seconds: number }> = {};
      for (const [k, v] of Object.entries(overrides)) {
        overridesPayload[k] = { duration_seconds: v.duration_seconds };
      }
      const res = await fetch(`/api/assets/${assetId}/animatic-timing`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ overrides: overridesPayload, directorConfirm: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Save timing failed');
      }
      setDirty(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingTiming(false);
    }
  }, [assetId, onChanged, overrides]);

  // ── Music upload ─────────────────────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingMusic, setUploadingMusic] = useState(false);

  const handleMusicUpload = useCallback(
    async (file: File) => {
      setUploadingMusic(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/assets/${assetId}/upload-music`, {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error ?? 'Music upload failed');
        }
        onChanged();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setUploadingMusic(false);
      }
    },
    [assetId, onChanged],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  const currentShot = times[currentIndex]?.shot;
  const currentDuration = times[currentIndex]?.duration ?? 0;
  const newTotal = computeTotalDuration(contract.shot_list, overrides);

  return (
    <div className="space-y-3">
      {/* Header info */}
      <div className="flex items-baseline justify-between text-xs text-text-secondary">
        <div>
          <span className="font-mono text-text-primary">{ANIMATIC_CONTRACT}</span>
          <span className="ml-2">{contract.shot_list.length} shots · {fmt(newTotal)}</span>
          {dirty && (
            <span className="ml-2" style={{ color: 'var(--accent-warning)' }}>· unsaved</span>
          )}
        </div>
        <div className="font-mono text-text-primary">
          {fmt(currentT)} / {fmt(newTotal)}
        </div>
      </div>

      {/* Preview area */}
      <div
        className="relative rounded-lg overflow-hidden border border-glass bg-black"
        style={{ aspectRatio: '16 / 9' }}
      >
        {currentShot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentShot.image_url}
            alt={currentShot.shot_id}
            className="absolute inset-0 w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted text-xs">
            No shots yet
          </div>
        )}
        {currentShot && (
          <div
            className="absolute bottom-2 left-2 right-2 text-xs text-white px-2 py-1 rounded"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
          >
            <span className="font-mono">{currentShot.shot_id}</span>
            {currentShot.shot_role && <span className="ml-2 opacity-80">· {currentShot.shot_role}</span>}
            <span className="ml-2 opacity-80">· {currentDuration.toFixed(1)}s</span>
            {currentShot.caption && (
              <div className="opacity-75 truncate mt-0.5">{currentShot.caption}</div>
            )}
          </div>
        )}
      </div>

      {/* Audio bar */}
      <div className="rounded-lg border border-glass p-2.5 space-y-1.5">
        {contract.music_url ? (
          <>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <Music2 size={13} className="text-[var(--accent-primary)]" />
              <span className="truncate flex-1 font-mono text-text-primary">
                {contract.music_filename ?? 'music'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingMusic}
              >
                <Upload size={12} /> Replace
              </Button>
            </div>
            <audio
              ref={audioRef}
              src={contract.music_url}
              preload="auto"
              controls
              className="w-full"
              style={{ height: 32 }}
            />
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <Music2 size={13} className="text-text-muted" />
            <span className="text-text-muted flex-1">No music yet — playback runs silent</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingMusic}
            >
              {uploadingMusic ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}{' '}
              Upload music
            </Button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleMusicUpload(f);
            e.target.value = '';
          }}
        />
      </div>

      {/* Timeline strip */}
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-text-muted">Timeline</div>
        <div
          className="relative rounded-md border border-glass overflow-hidden"
          style={{ height: 36, background: 'var(--bg-elevated)' }}
        >
          {times.map((t, i) => {
            const widthPct = total > 0 ? (t.duration / total) * 100 : 0;
            const leftPct = total > 0 ? (t.cumStart / total) * 100 : 0;
            const isCurrent = i === currentIndex;
            return (
              <button
                key={t.shot.shot_id}
                onClick={() => seekTo(t.cumStart)}
                className="absolute top-0 h-full transition-colors"
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  background: isCurrent
                    ? 'color-mix(in oklab, var(--accent-primary) 35%, transparent)'
                    : 'transparent',
                  borderRight: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                }}
                title={`${t.shot.shot_id} · ${t.duration.toFixed(1)}s · click to jump`}
              >
                <div className="text-[9px] text-text-secondary truncate px-0.5 leading-[36px]">
                  {i + 1}
                </div>
              </button>
            );
          })}
          {/* Cursor */}
          <div
            className="absolute top-0 h-full pointer-events-none"
            style={{
              left: total > 0 ? `${(currentT / total) * 100}%` : '0%',
              width: 2,
              background: 'var(--accent-primary)',
              boxShadow: '0 0 8px var(--accent-primary)',
            }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {isPlaying ? (
          <Button variant="primary" size="sm" onClick={handlePause}>
            <Pause size={13} /> Pause
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={handlePlay}>
            <Play size={13} /> Play
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={handleStop} disabled={!isPlaying}>
          <Square size={13} /> Stop
        </Button>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw size={13} /> Reset
        </Button>
        <div className="flex-1" />
        {dirty && (
          <Button variant="primary" size="sm" onClick={handleSaveTiming} disabled={savingTiming}>
            {savingTiming ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save timing
          </Button>
        )}
      </div>

      {/* Inline duration editor (current shot) */}
      {currentShot && (
        <div
          className="rounded-lg p-2.5 border border-glass"
          style={{ background: 'color-mix(in oklab, var(--accent-primary) 6%, transparent)' }}
        >
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
            Editing current shot
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-mono text-sm text-text-primary">
              {currentShot.shot_id}
            </div>
            {currentShot.shot_role && (
              <div className="text-xs text-text-secondary">{currentShot.shot_role}</div>
            )}
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDuration(currentShot.shot_id, currentDuration - SECOND_STEP)}
              disabled={currentDuration <= MIN_SHOT_S}
            >
              −1s
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDuration(currentShot.shot_id, currentDuration + SECOND_STEP)}
              disabled={currentDuration >= MAX_SHOT_S}
            >
              +1s
            </Button>
            <input
              key={`${currentShot.shot_id}-${currentDuration}`}
              type="number"
              min={MIN_SHOT_S}
              max={MAX_SHOT_S}
              step={0.1}
              defaultValue={currentDuration.toFixed(1)}
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0 && Math.abs(v - currentDuration) > 0.01) {
                  setDuration(currentShot.shot_id, v);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className="w-16 px-2 py-1 rounded bg-[var(--bg-elevated)] border border-glass text-xs text-text-primary text-right font-mono focus:outline-none focus:border-[var(--accent-primary)]"
            />
            <span className="text-xs text-text-muted">s</span>
          </div>
          {currentShot.caption && (
            <div className="text-xs text-text-secondary mt-1.5 italic">{currentShot.caption}</div>
          )}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          className="rounded-md p-2 text-xs"
          style={{
            background: 'color-mix(in oklab, var(--accent-danger) 10%, transparent)',
            border: '1px solid color-mix(in oklab, var(--accent-danger) 35%, transparent)',
            color: 'var(--accent-danger)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
