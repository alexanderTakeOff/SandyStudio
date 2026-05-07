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

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Upload,
  Music2,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  ANIMATIC_CONTRACT,
  computeTotalDuration,
  effectiveDurationSeconds,
  getAudioTracks,
  type AnimaticContract,
  type AnimaticDirectorOverride,
  type AnimaticShot,
  type AudioTrack,
} from '@/lib/api/animatic-shotlist';
import {
  resolveTimelineCells,
  type TimelineCell,
  type VidShotAssetRow,
} from '@/lib/api/timeline-cell-resolver';

const SECOND_STEP = 1.0;
const MIN_SHOT_S = 0.5;
const MAX_SHOT_S = 60;

export interface AnimaticPlayerProps {
  assetId: string;
  contract: AnimaticContract;
  /** Called after a successful save / upload — drawer should refetch. */
  onChanged: () => void;
  /**
   * EpisodeTimeline mode: when provided, the player upgrades from "animatic
   * frames only" to a hybrid surface that also plays approved/REVIEW VID-shot
   * mp4s for shot_ids that have them. Per Director's directives 2026-05-06:
   *   - REVIEW VID-shot plays for visual feedback (yellow border, not canonical)
   *   - APPROVED VID-shot replaces the animatic frame canonically (green pill)
   *   - Storyboard order is preserved; one cell per shot_id (directive #1)
   * Pass `[]` (empty) to keep behaviour pure-animatic.
   */
  vidShotAssets?: VidShotAssetRow[];
  /**
   * Called when Director clicks any timeline cell — caller (episode page)
   * opens the per-shot drawer for review. Optional; without it, cells just
   * seek the playhead.
   */
  onCellClick?: (cell: TimelineCell) => void;
  /**
   * Phase A polish: timeline filter chip selection. Cells outside the
   * filter are dimmed in the shot strip but still seek-able. Default 'all'.
   */
  filter?: 'all' | 'review' | 'approved' | 'missing';
}

/**
 * Imperative API exposed via ref. Used by EpisodeTimelineSection so post-
 * regenerate the parent can move the playhead to the freshly-created shot
 * (Phase A.1 directive — "new candidate must appear and be focused").
 */
export interface AnimaticPlayerHandle {
  seekToShot: (shotId: string) => void;
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

export const AnimaticPlayer = forwardRef<AnimaticPlayerHandle, AnimaticPlayerProps>(function AnimaticPlayer(
  {
    assetId,
    contract,
    onChanged,
    vidShotAssets,
    onCellClick,
    filter = 'all',
  },
  ref,
) {
  // Hybrid mode: resolver maps each shot_id to its current canonical cell
  // (mp4-canonical / mp4-review / image fallback / placeholder).
  const timelineCells: TimelineCell[] = useMemo(
    () => resolveTimelineCells(contract, vidShotAssets ?? []),
    [contract, vidShotAssets],
  );
  // Multi-track audio (forward-compat per directive #4 — reads `audio_tracks[]`
  // when present, falls back to legacy `music_url` single track for v1 assets).
  const audioTracks: AudioTrack[] = useMemo(() => getAudioTracks(contract), [contract]);
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
  // Inline preview <video> — explicit ref so useEffect can play/pause/seek it
  // in lockstep with the master clock (Phase A.1 fix for two playback bugs:
  // selected-cell + Play starts NEXT cell, and Pause/Resume jumps cells).
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);
  const startTOffsetRef = useRef<number>(0); // where we resumed from
  // Mirror the master clock in a ref so the inline-video sync effect can read
  // currentT without re-running on every tick (state changes 60×/s during play).
  const currentTRef = useRef<number>(0);
  useEffect(() => {
    currentTRef.current = currentT;
  }, [currentT]);

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
    // Read latest start position from the mutable ref so click-on-cell
    // immediately followed by Play starts at the clicked cell, not at the
    // stale React-state currentT (Phase A.1 fix #1).
    const startFrom = startTOffsetRef.current;
    if (startFrom >= total) {
      // Auto-reset on play after end.
      startTOffsetRef.current = 0;
      setCurrentT(0);
      setCurrentIndex(0);
      const audio = audioRef.current;
      if (audio) audio.currentTime = 0;
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
  }, [isPlaying, tick, total]);

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
      currentTRef.current = clamped; // keep ref in sync for video-sync effect
      setCurrentT(clamped);
      setCurrentIndex(computeIndex(clamped));
      const audio = audioRef.current;
      if (audio) audio.currentTime = clamped;
    },
    [computeIndex, total],
  );

  // ── Imperative API: seekToShot — caller (EpisodeTimelineSection) jumps
  // playhead to a specific shot_id after a regenerate completes (Phase A.1
  // directive — "new candidate must appear and focused").
  useImperativeHandle(
    ref,
    () => ({
      seekToShot: (shotId: string) => {
        const idx = contract.shot_list.findIndex((s) => s.shot_id === shotId);
        if (idx < 0) return;
        const time = times[idx]?.cumStart ?? 0;
        seekTo(time);
      },
    }),
    [contract.shot_list, seekTo, times],
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

  // ── Approve / Reject — fires the same /approve route the drawer footer uses,
  // which in turn triggers `computeNextEvents` to emit VGEN×3 + MGEN events
  // (see approve/route.ts line ~212). In Mode 4 the factory auto-approves
  // animatic on creation so this UI path is exercised only in Mode 1-3.
  const [approving, setApproving] = useState<null | 'APPROVE' | 'REJECT'>(null);
  const postDecision = useCallback(
    async (decision: 'APPROVE' | 'REJECT', note?: string) => {
      setApproving(decision);
      setError(null);
      try {
        const body: Record<string, unknown> = { decision, directorConfirm: true };
        if (decision === 'APPROVE') body.preview_acknowledged = true;
        if (note) body.note = note;
        const res = await fetch(`/api/assets/${assetId}/approve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error ?? `${decision} failed`);
        }
        onChanged();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setApproving(null);
      }
    },
    [assetId, onChanged],
  );

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

  // In hybrid mode, the cell index corresponds 1:1 with shot index — fetch the
  // resolved cell for the current frame so we can decide between <img> / <video>
  // and color-code the status pill.
  const currentCell = timelineCells[currentIndex];
  const isHybridMode = (vidShotAssets?.length ?? 0) > 0;
  const currentCellStart = times[currentIndex]?.cumStart ?? 0;

  // ── Inline-video sync (Phase A.1 fix for bugs 1+2) ──────────────────────
  // The inline <video> only takes its `autoPlay` prop into account at MOUNT.
  // Toggling isPlaying later does nothing — that was the playback bug. Drive
  // it explicitly via ref. Also keep video.currentTime in lockstep with the
  // master clock when isPlaying flips on, so resume after pause stays at the
  // exact in-cell offset.
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const isVideoCell =
      currentCell?.kind === 'video-canonical' ||
      currentCell?.kind === 'video-review';
    if (!isVideoCell) return;
    if (isPlaying) {
      // Re-anchor video to the master clock's in-cell offset before play.
      const inCellOffset = Math.max(0, currentTRef.current - currentCellStart);
      try {
        vid.currentTime = inCellOffset;
      } catch {
        /* seeking before metadata loaded — browser will seek when ready */
      }
      void vid.play().catch(() => {
        /* autoplay rejected by browser policy — fall back to user gesture */
      });
    } else {
      vid.pause();
    }
    // Re-run when isPlaying changes OR when currentCell switches to a new mp4
    // (key change rebuilds the ref; but the effect needs to re-anchor).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentCell?.url]);

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

      {/* Preview area — hybrid: <video> for VID-shot cells (canonical/review),
          <img> for animatic image fallback. Cell border color reflects status:
          green = canonical APPROVED/LOCKED, yellow = REVIEW (tentative per
          directive #2), no border = animatic image fallback. */}
      <div
        className="relative rounded-lg overflow-hidden border-2 bg-black"
        style={{
          aspectRatio: '16 / 9',
          borderColor:
            currentCell?.kind === 'video-canonical'
              ? 'var(--accent-success, #22c55e)'
              : currentCell?.kind === 'video-review'
                ? 'var(--accent-warning, #f59e0b)'
                : 'var(--panel-glass-border, rgba(255,255,255,0.1))',
        }}
      >
        {currentCell?.kind === 'video-canonical' || currentCell?.kind === 'video-review' ? (
          <video
            ref={videoRef}
            key={currentCell.url ?? currentShot?.shot_id}
            src={currentCell.url ?? undefined}
            className="absolute inset-0 w-full h-full object-contain"
            // Playback driven explicitly by the videoRef sync useEffect above.
            // We don't set autoPlay here because the effect handles play/pause
            // in lockstep with the master clock (bugs 1+2 fix).
            muted
            playsInline
            preload="auto"
          />
        ) : currentShot && currentShot.image_url ? (
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
        {/* Status pill (top-right) — visible only in hybrid mode. */}
        {isHybridMode && currentCell && currentCell.status !== 'NONE' && (
          <div
            className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
            style={{
              background:
                currentCell.kind === 'video-canonical'
                  ? 'color-mix(in oklab, var(--accent-success, #22c55e) 75%, transparent)'
                  : currentCell.kind === 'video-review'
                    ? 'color-mix(in oklab, var(--accent-warning, #f59e0b) 75%, transparent)'
                    : 'rgba(0,0,0,0.55)',
              color: 'white',
            }}
          >
            {currentCell.status}
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
            {isHybridMode && currentCell && (
              <button
                type="button"
                onClick={() => onCellClick?.(currentCell)}
                disabled={!onCellClick || !currentCell.asset_id}
                className="ml-2 underline opacity-90 hover:opacity-100 disabled:opacity-50 disabled:no-underline"
                title="Open this shot in drawer for review"
              >
                Open shot →
              </button>
            )}
            {currentShot.caption && (
              <div className="opacity-75 truncate mt-0.5">{currentShot.caption}</div>
            )}
          </div>
        )}
      </div>

      {/* Audio bar — supports multi-track (music / voice / sfx / ambience).
          For animatic v1 with only `music_url`, getAudioTracks fabricates a
          single 'music' track. EXEC-MGEN voice / sfx tracks (Phase 1.5+) will
          land here without UI rewrite — schema is forward-compat per directive #4.
          The first 'music' track is the master clock (audioRef); additional
          tracks are slaved with periodic re-sync. Only music exposes Replace
          (Upload music) to keep the v1 surface familiar. */}
      <div className="rounded-lg border border-glass p-2.5 space-y-1.5">
        {audioTracks.length > 0 ? (
          audioTracks.map((track, i) => {
            const isMaster = i === 0;
            return (
              <div key={`${track.layer}-${track.url}`} className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Music2
                    size={13}
                    className={isMaster ? 'text-[var(--accent-primary)]' : 'text-text-muted'}
                  />
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider"
                    style={{
                      background: 'color-mix(in oklab, var(--accent-primary) 15%, transparent)',
                      color: 'var(--accent-primary)',
                    }}
                  >
                    {track.layer}
                  </span>
                  <span className="truncate flex-1 font-mono text-text-primary">
                    {track.filename}
                  </span>
                  {track.layer === 'music' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingMusic}
                    >
                      <Upload size={12} /> Replace
                    </Button>
                  )}
                </div>
                <audio
                  ref={isMaster ? audioRef : undefined}
                  src={track.url}
                  preload="auto"
                  controls
                  className="w-full"
                  style={{ height: 32 }}
                />
              </div>
            );
          })
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <Music2 size={13} className="text-text-muted" />
            <span className="text-text-muted flex-1">No audio yet — playback runs silent</span>
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
            const cell = timelineCells[i];
            const cellMatchesFilter =
              filter === 'all'
                ? true
                : filter === 'review'
                  ? cell?.status === 'REVIEW'
                  : filter === 'approved'
                    ? cell?.status === 'APPROVED' || cell?.status === 'LOCKED'
                    : filter === 'missing'
                      ? cell?.status === 'NONE'
                      : true;
            // Per Director 2026-05-06 — encode status in the cell-number
            // colour itself (no extra dot). Cleaner read at a glance:
            //   green  = APPROVED canonical mp4
            //   yellow = REVIEW mp4 (tentative, not canonical)
            //   muted  = animatic image fallback / no VGEN yet
            const numberColor =
              cell?.kind === 'video-canonical'
                ? 'var(--accent-success, #22c55e)'
                : cell?.kind === 'video-review'
                  ? 'var(--accent-warning, #f59e0b)'
                  : 'var(--text-muted)';
            const numberWeight =
              cell?.kind === 'video-canonical' || cell?.kind === 'video-review'
                ? 600
                : 400;
            return (
              <button
                key={t.shot.shot_id}
                onClick={() => seekTo(t.cumStart)}
                className="absolute top-0 h-full transition-opacity"
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  background: isCurrent
                    ? 'color-mix(in oklab, var(--accent-primary) 35%, transparent)'
                    : 'transparent',
                  borderRight: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                  opacity: cellMatchesFilter ? 1 : 0.25,
                }}
                title={`${t.shot.shot_id} · ${t.duration.toFixed(1)}s · ${cell?.status ?? 'NONE'} · click to jump`}
              >
                <div
                  className="text-[10px] truncate px-0.5 leading-[36px] tabular-nums text-center"
                  style={{ color: numberColor, fontWeight: numberWeight }}
                >
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
        <Button
          variant={dirty ? 'primary' : 'ghost'}
          size="sm"
          onClick={handleSaveTiming}
          disabled={savingTiming || !dirty}
          title={dirty ? 'Save updated per-shot durations' : 'No timing changes to save yet'}
        >
          {savingTiming ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}{' '}
          {dirty ? 'Save timing' : 'Saved'}
        </Button>
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

      {/* Approve / Reject — fires /approve route which emits VGEN×3 + MGEN
          events, advancing pipeline to Visual Generator + Music. In Mode 4
          factory auto-approves on creation; this row is exercised in Modes 1-3. */}
      <div
        className="flex items-center gap-2 pt-2 border-t border-glass"
      >
        <div className="text-[11px] text-text-muted">
          When happy with pacing → Approve advances to Visual Generator + Music
        </div>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void postDecision('REJECT')}
          disabled={approving !== null}
          style={{ color: 'var(--accent-danger)' }}
        >
          {approving === 'REJECT' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <XCircle size={13} />
          )}{' '}
          Reject
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void postDecision('APPROVE')}
          disabled={approving !== null}
        >
          {approving === 'APPROVE' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <CheckCircle2 size={13} />
          )}{' '}
          Approve & advance
        </Button>
      </div>

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
});
AnimaticPlayer.displayName = 'AnimaticPlayer';
