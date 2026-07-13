// ──────────────────────────────────────────────────────────────────────────────
// Tests for the P2 Shorts muscles: shotRangeToSeconds (cumulative timeline
// mapping, shared ≤0.5s exclusion with computeTotalDuration) and
// deriveShortWindows (setup→punchline grouping, landscape_only drop, 15-40s gate).
// Pure functions — no ffmpeg, no DB.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import {
  shotRangeToSeconds,
  type AnimaticShot,
  type AnimaticDirectorOverride,
} from '@/lib/api/animatic-shotlist';
import {
  deriveShortWindows,
  shortWindowsFromEpisodeMeta,
  type StoryboardShotForWindows,
} from '@/lib/api/short-windows';

function aShot(id: string, duration: number): AnimaticShot {
  return { shot_id: id, asset_id: `a-${id}`, image_url: `/img/${id}`, duration_seconds: duration };
}

describe('shotRangeToSeconds', () => {
  // Timeline: SH01@0 (3), SH02@3 (5), SH03@8 (4), SH04@12 (6) → total 18.
  const list: AnimaticShot[] = [aShot('SH01', 3), aShot('SH02', 5), aShot('SH03', 4), aShot('SH04', 6)];

  it('maps a multi-shot range to [start, end] on the timeline', () => {
    expect(shotRangeToSeconds(list, 'SH02', 'SH03')).toEqual({ startSec: 3, endSec: 12 });
  });

  it('maps a single-shot window to that shot span', () => {
    expect(shotRangeToSeconds(list, 'SH02', 'SH02')).toEqual({ startSec: 3, endSec: 8 });
  });

  it('spans from the first shot to the last', () => {
    expect(shotRangeToSeconds(list, 'SH01', 'SH04')).toEqual({ startSec: 0, endSec: 18 });
  });

  it('returns null when a shot id is absent', () => {
    expect(shotRangeToSeconds(list, 'SH02', 'SHXX')).toBeNull();
    expect(shotRangeToSeconds(list, 'SHXX', 'SH03')).toBeNull();
  });

  it('returns null when end precedes start in shot order', () => {
    expect(shotRangeToSeconds(list, 'SH03', 'SH01')).toBeNull();
  });

  it('excludes ≤0.5s shots from the running offset (same rule as computeTotalDuration)', () => {
    // SH02 shrinks to 0.4s → skipped; SH01(3) + SH03(4) = 7.
    const withTiny: AnimaticShot[] = [aShot('SH01', 3), aShot('SH02', 0.4), aShot('SH03', 4)];
    expect(shotRangeToSeconds(withTiny, 'SH01', 'SH03')).toEqual({ startSec: 0, endSec: 7 });
  });

  it('clamps to real clip length via clipLengths (final-cut math)', () => {
    const overrides: Record<string, AnimaticDirectorOverride> = { SH02: { duration_seconds: 8 } };
    const clip = new Map<string, number>([['SH02', 4]]); // Seedance returned 4s
    // start at SH01 = 0; SH01(3) + SH02 clamped to 4 = end 7.
    expect(shotRangeToSeconds(list, 'SH01', 'SH02', overrides, clip)).toEqual({ startSec: 0, endSec: 7 });
  });
});

describe('deriveShortWindows', () => {
  // Three gag segments back-to-back on the timeline.
  const animatic: AnimaticShot[] = [
    aShot('SH01', 5), aShot('SH02', 7), aShot('SH03', 8),   // segment A → 20s (survives)
    aShot('SH04', 5), aShot('SH05', 15),                    // segment B → 20s but landscape_only
    aShot('SH06', 2), aShot('SH07', 3),                     // segment C → 5s (too short)
  ];
  const storyboard: StoryboardShotForWindows[] = [
    { shot_id: 'SH01', shot_role: 'setup' },
    { shot_id: 'SH02', shot_role: 'gag', vertical_safe: true },
    { shot_id: 'SH03', shot_role: 'punchline', vertical_safe: true, key_beat: 'the anvil lands' },
    { shot_id: 'SH04', shot_role: 'setup' },
    { shot_id: 'SH05', shot_role: 'punchline', landscape_only: true },
    { shot_id: 'SH06', shot_role: 'setup' },
    { shot_id: 'SH07', shot_role: 'punchline', vertical_safe: true },
  ];

  it('keeps a 15-40s setup→punchline run and maps its timecodes', () => {
    const windows = deriveShortWindows({ storyboardShots: storyboard, animaticShots: animatic });
    expect(windows).toHaveLength(1);
    expect(windows[0]).toEqual({
      startShotId: 'SH01',
      endShotId: 'SH03',
      peakShotId: 'SH03',
      startSec: 0,
      endSec: 20,
      overlayText: 'the anvil lands',
    });
  });

  it('drops a window whose peak is landscape_only', () => {
    const windows = deriveShortWindows({ storyboardShots: storyboard, animaticShots: animatic });
    expect(windows.some((w) => w.peakShotId === 'SH05')).toBe(false);
  });

  it('drops a window shorter than the 15s floor', () => {
    const windows = deriveShortWindows({ storyboardShots: storyboard, animaticShots: animatic });
    expect(windows.some((w) => w.peakShotId === 'SH07')).toBe(false);
  });

  it('drops a window longer than the 40s ceiling', () => {
    const longAnimatic: AnimaticShot[] = [aShot('SH01', 10), aShot('SH02', 40)];
    const longStory: StoryboardShotForWindows[] = [
      { shot_id: 'SH01', shot_role: 'setup' },
      { shot_id: 'SH02', shot_role: 'punchline', vertical_safe: true },
    ];
    expect(deriveShortWindows({ storyboardShots: longStory, animaticShots: longAnimatic })).toHaveLength(0);
  });

  it('prefers a punchline peak over a later gag in the same segment', () => {
    const anim: AnimaticShot[] = [aShot('SH01', 8), aShot('SH02', 10), aShot('SH03', 7)];
    const story: StoryboardShotForWindows[] = [
      { shot_id: 'SH01', shot_role: 'setup' },
      { shot_id: 'SH02', shot_role: 'punchline', vertical_safe: true },
      { shot_id: 'SH03', shot_role: 'gag', vertical_safe: true },
    ];
    const windows = deriveShortWindows({ storyboardShots: story, animaticShots: anim });
    expect(windows).toHaveLength(1);
    expect(windows[0].peakShotId).toBe('SH02'); // punchline, not the later gag
    expect(windows[0].endSec).toBe(18); // SH01(8) + SH02(10)
  });

  it('yields no windows for a segment with no gag/punchline', () => {
    const anim: AnimaticShot[] = [aShot('SH01', 10), aShot('SH02', 10)];
    const story: StoryboardShotForWindows[] = [
      { shot_id: 'SH01', shot_role: 'setup' },
      { shot_id: 'SH02', shot_role: 'action' },
    ];
    expect(deriveShortWindows({ storyboardShots: story, animaticShots: anim })).toHaveLength(0);
  });
});

describe('shortWindowsFromEpisodeMeta', () => {
  it('round-trips well-formed windows', () => {
    const meta = {
      short_windows: [
        { startShotId: 'SH01', endShotId: 'SH03', peakShotId: 'SH03', startSec: 0, endSec: 20, overlayText: 'x' },
      ],
    };
    expect(shortWindowsFromEpisodeMeta(meta)).toEqual([
      { startShotId: 'SH01', endShotId: 'SH03', peakShotId: 'SH03', startSec: 0, endSec: 20, overlayText: 'x' },
    ]);
  });

  it('is safe on absent / garbage metadata', () => {
    expect(shortWindowsFromEpisodeMeta(null)).toEqual([]);
    expect(shortWindowsFromEpisodeMeta({})).toEqual([]);
    expect(shortWindowsFromEpisodeMeta({ short_windows: 'nope' })).toEqual([]);
    expect(shortWindowsFromEpisodeMeta({ short_windows: [{ startShotId: 'a' }] })).toEqual([]);
  });
});
