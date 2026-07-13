// ──────────────────────────────────────────────────────────────────────────────
// lib/api/short-windows.ts
// P2 Shorts — derive self-contained gag windows from a storyboard.
//
// A "short window" is a 15-40s slice of the final cut built around one gag arc
// (a setup → … → punchline run), ready to hand to the ffmpeg-shorts cutter as
// {startSec, endSec, overlayText}. This is the upstream half of the P2 pipeline:
// vertical-safe framing (authored at storyboard) makes the SOURCE column-safe;
// this module turns a storyboarded short-target episode into the 3-5 candidate
// windows, dropping any whose peak is `landscape_only`.
//
// Pure — no DB. The caller (batch script / route) persists the result to
// `episodes.metadata.short_windows`, mirroring the `excluded_shot_ids` pattern in
// animatic-shotlist.ts, and reads it back with `shortWindowsFromEpisodeMeta`.
// ──────────────────────────────────────────────────────────────────────────────

import {
  shotRangeToSeconds,
  type AnimaticShot,
  type AnimaticDirectorOverride,
} from './animatic-shotlist';

/** Default window length gate. A Short reads as its own piece between ~15s and
 *  ~40s; shorter is a fragment, longer stops being a single gag. */
export const SHORT_WINDOW_MIN_SECONDS = 15;
export const SHORT_WINDOW_MAX_SECONDS = 40;

const PEAK_ROLES = new Set(['gag', 'punchline']);

/** Minimal storyboard-shot shape the derivation needs. Structurally satisfied by
 *  the `StoryboardShotV2` objects returned from `extractShotsFromStoryboard`. */
export interface StoryboardShotForWindows {
  shot_id: string;
  shot_role?: string;
  vertical_safe?: boolean;
  landscape_only?: boolean;
  key_beat?: string;
}

export interface ShortWindow {
  /** First shot of the gag arc (the setup, or the segment start). */
  startShotId: string;
  /** Last shot of the window — the gag/punchline peak (same as peakShotId). */
  endShotId: string;
  /** The gag/punchline peak the window is built around. */
  peakShotId: string;
  /** Timeline offset (final-cut seconds) where the window starts. */
  startSec: number;
  /** Timeline offset where the window ends. */
  endSec: number;
  /** Optional caption hint (peak's key_beat). Cutter may override with branding. */
  overlayText?: string;
}

export interface DeriveShortWindowsArgs {
  /** Storyboard shots in production order (from extractShotsFromStoryboard). */
  storyboardShots: ReadonlyArray<StoryboardShotForWindows>;
  /** The built animatic timeline — supplies accurate final-cut timecodes. */
  animaticShots: readonly AnimaticShot[];
  overrides?: Record<string, AnimaticDirectorOverride>;
  clipLengths?: ReadonlyMap<string, number>;
  minSeconds?: number;
  maxSeconds?: number;
}

/**
 * Group the storyboard into gag windows and map each to final-cut timecodes.
 *
 * Grouping: segment the shot list at every `setup` shot; within a segment the
 * peak is the last `punchline` (a punchline is never overridden by a later gag),
 * else the last `gag`. The window spans [segment-start … peak] inclusive. A
 * segment with no gag/punchline is not a gag arc → no window.
 *
 * Filters: a window whose peak is `landscape_only` is dropped (it will not crop
 * cleanly to vertical); a window whose span falls outside [min,max] seconds is
 * dropped. Timecodes come from `shotRangeToSeconds` so they line up with the
 * AnimaticPlayer total and what EXEC-STITCH emits.
 */
export function deriveShortWindows(args: DeriveShortWindowsArgs): ShortWindow[] {
  const {
    storyboardShots,
    animaticShots,
    overrides,
    clipLengths,
    minSeconds = SHORT_WINDOW_MIN_SECONDS,
    maxSeconds = SHORT_WINDOW_MAX_SECONDS,
  } = args;

  const windows: ShortWindow[] = [];
  let segStart: string | null = null;
  let peak: StoryboardShotForWindows | null = null;

  const flush = (): void => {
    if (segStart && peak && peak.landscape_only !== true) {
      const span = shotRangeToSeconds(
        animaticShots,
        segStart,
        peak.shot_id,
        overrides,
        clipLengths,
      );
      if (span) {
        const length = span.endSec - span.startSec;
        if (length >= minSeconds && length <= maxSeconds) {
          const caption = peak.key_beat?.trim();
          windows.push({
            startShotId: segStart,
            endShotId: peak.shot_id,
            peakShotId: peak.shot_id,
            startSec: span.startSec,
            endSec: span.endSec,
            overlayText: caption && caption.length > 0 ? caption : undefined,
          });
        }
      }
    }
    peak = null;
  };

  for (const shot of storyboardShots) {
    if (shot.shot_role === 'setup') {
      flush(); // close the previous segment before opening a new one
      segStart = shot.shot_id;
      continue;
    }
    if (segStart === null) segStart = shot.shot_id; // no setup yet — open here
    if (shot.shot_role === 'punchline') {
      peak = shot; // punchline always wins (latest one)
    } else if (
      shot.shot_role &&
      PEAK_ROLES.has(shot.shot_role) &&
      peak?.shot_role !== 'punchline'
    ) {
      peak = shot; // gag wins only if no punchline has been seen this segment
    }
  }
  flush(); // final segment

  return windows;
}

/**
 * Read `episodes.metadata.short_windows[]` defensively (mirror of
 * `excludedShotIdsFromEpisodeMeta`). Safe on absent/garbage metadata.
 */
export function shortWindowsFromEpisodeMeta(metadata: unknown): ShortWindow[] {
  const raw =
    metadata && typeof metadata === 'object'
      ? (metadata as { short_windows?: unknown }).short_windows
      : null;
  if (!Array.isArray(raw)) return [];
  const out: ShortWindow[] = [];
  for (const w of raw) {
    if (!w || typeof w !== 'object') continue;
    const o = w as Record<string, unknown>;
    if (typeof o.startShotId !== 'string' || typeof o.endShotId !== 'string') continue;
    if (typeof o.startSec !== 'number' || typeof o.endSec !== 'number') continue;
    out.push({
      startShotId: o.startShotId,
      endShotId: o.endShotId,
      peakShotId: typeof o.peakShotId === 'string' ? o.peakShotId : o.endShotId,
      startSec: o.startSec,
      endSec: o.endSec,
      overlayText: typeof o.overlayText === 'string' ? o.overlayText : undefined,
    });
  }
  return out;
}
