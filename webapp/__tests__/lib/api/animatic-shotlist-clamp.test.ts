// ──────────────────────────────────────────────────────────────────────────────
// Tests for the clipLengths clamp + sub-0.5s exclusion in computeTotalDuration.
//
// Director's "1:40 animatic vs 1:12 final cut" confusion (2026-06-06) — the
// animatic preview used to sum director_overrides without clamping to the real
// VID-shot clip lengths, so a 6s override on a 4s Seedance clip inflated the
// total. EXEC-STITCH always clamped (ffmpeg `outpoint X` cuts at min(X, clip)),
// so the final cut was shorter than the previewed total. The same function now
// reflects what ffmpeg will actually emit, including dropping shots whose
// effective duration is ≤ 0.5s (Director's Path A exclusion mechanism).
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import {
  computeTotalDuration,
  computeEffectivePlayback,
  clipLengthsFromVidShotRows,
  isDeletedShot,
  DELETED_SHOT_MAX_SECONDS,
  type AnimaticShot,
  type AnimaticDirectorOverride,
} from '@/lib/api/animatic-shotlist';

function shot(id: string, duration: number): AnimaticShot {
  return {
    shot_id: id,
    asset_id: `a-${id}`,
    image_url: `/img/${id}`,
    duration_seconds: duration,
  };
}

describe('computeTotalDuration — clipLengths clamp + ≤0.5s exclusion', () => {
  const list: AnimaticShot[] = [
    shot('SH01', 3),
    shot('SH02', 5),
    shot('SH03', 4),
  ];

  it('falls back to shot.duration_seconds when no overrides + no clipLengths (back-compat)', () => {
    expect(computeTotalDuration(list, undefined)).toBe(12); // 3 + 5 + 4
  });

  it('applies overrides without clipLengths (back-compat)', () => {
    const overrides: Record<string, AnimaticDirectorOverride> = {
      SH02: { duration_seconds: 6 },
    };
    expect(computeTotalDuration(list, overrides)).toBe(13); // 3 + 6 + 4
  });

  it('clamps each effective duration to its clipLength (the real cut math)', () => {
    const overrides: Record<string, AnimaticDirectorOverride> = {
      SH02: { duration_seconds: 8 }, // would be 8s, but Seedance returned 4s
    };
    const clipLengths = new Map<string, number>([
      ['SH01', 3.96],
      ['SH02', 4.0], // clamps the 8s override
      ['SH03', 3.96],
    ]);
    // 3 (override absent, ≤ clip) + 4 (override 8 clamped to 4) + 3.96 (no
    // override, declared 4 clamped to 3.96) = 10.96
    expect(computeTotalDuration(list, overrides, clipLengths)).toBeCloseTo(10.96, 2);
  });

  it('drops shots whose effective duration is ≤ 0.5s (Path A exclusion)', () => {
    const overrides: Record<string, AnimaticDirectorOverride> = {
      SH02: { duration_seconds: 0.3 }, // excluded
    };
    expect(computeTotalDuration(list, overrides)).toBe(7); // 3 + 0 + 4
  });

  it('excludes shots with effective duration exactly 0.5s (≤ boundary)', () => {
    const overrides: Record<string, AnimaticDirectorOverride> = {
      SH01: { duration_seconds: 0.5 },
    };
    expect(computeTotalDuration(list, overrides)).toBe(9); // 0 + 5 + 4
  });

  it('exclusion + clamp combine correctly when a clip is shorter than the override too', () => {
    const overrides: Record<string, AnimaticDirectorOverride> = {
      SH01: { duration_seconds: 0.4 }, // excluded
      SH02: { duration_seconds: 9 },   // clamped to 4
    };
    const clipLengths = new Map<string, number>([
      ['SH02', 4],
      ['SH03', 3.96],
    ]);
    expect(computeTotalDuration(list, overrides, clipLengths)).toBeCloseTo(7.96, 2);
  });

  it('returns 0 when every shot is excluded', () => {
    const overrides: Record<string, AnimaticDirectorOverride> = {
      SH01: { duration_seconds: 0.2 },
      SH02: { duration_seconds: 0.2 },
      SH03: { duration_seconds: 0.2 },
    };
    expect(computeTotalDuration(list, overrides)).toBe(0);
  });

  it('subtracts trim_start from available clip length (head trim eats from the window)', () => {
    // 2026-06-06 — clip = 4s, trim_start = 2, duration_declared = 3:
    // ffmpeg reads [2, 5) but the clip ends at 4 → 2s of actual playback.
    const overrides: Record<string, AnimaticDirectorOverride> = {
      SH02: { duration_seconds: 3, trim_start_seconds: 2 },
    };
    const clipLengths = new Map<string, number>([['SH02', 4]]);
    const playable = computeEffectivePlayback(list[1]!, overrides, clipLengths);
    expect(playable).toBeCloseTo(2, 2);
  });

  it('total reflects head-trim reduction (Director sees the honest length)', () => {
    const overrides: Record<string, AnimaticDirectorOverride> = {
      SH01: { duration_seconds: 3 },                              // 3
      SH02: { duration_seconds: 5, trim_start_seconds: 2 },      // 4-2=2 (clip 4)
      SH03: { duration_seconds: 4 },                              // 4 (clip 4)
    };
    const clipLengths = new Map<string, number>([
      ['SH01', 3.96],
      ['SH02', 4],
      ['SH03', 4],
    ]);
    // 3 (SH01) + 2 (SH02 clamped by head trim) + 4 (SH03) = 9
    expect(computeTotalDuration(list, overrides, clipLengths)).toBeCloseTo(9, 2);
  });

  it('head-trim larger than clip length excludes the shot', () => {
    // A 5s trim_start on a 4s clip leaves 0s available → excluded.
    const overrides: Record<string, AnimaticDirectorOverride> = {
      SH02: { duration_seconds: 3, trim_start_seconds: 5 },
    };
    const clipLengths = new Map<string, number>([['SH02', 4]]);
    expect(computeEffectivePlayback(list[1]!, overrides, clipLengths)).toBe(0);
  });
});

// 2026-06-08 — the shared clipLengths builder now used by AnimaticPlayer, the
// /animatic-timing route AND EXEC-STITCH, so all three clamp to the same real
// clip lengths (closes the timeline-60s vs Save-76.5s vs final-cut divergence).
describe('clipLengthsFromVidShotRows', () => {
  it('builds shot_id → duration from VID-shot metadata', () => {
    const map = clipLengthsFromVidShotRows([
      { metadata: { shot_id: 'SH01', duration_seconds: 4 } },
      { metadata: { shot_id: 'SH02', duration_seconds: 5.5 } },
    ]);
    expect(map.get('SH01')).toBe(4);
    expect(map.get('SH02')).toBe(5.5);
    expect(map.size).toBe(2);
  });

  it('keeps the FIRST positive duration per shot_id (caller passes newest first)', () => {
    const map = clipLengthsFromVidShotRows([
      { metadata: { shot_id: 'SH01', duration_seconds: 4 } }, // newest
      { metadata: { shot_id: 'SH01', duration_seconds: 9 } }, // older — ignored
    ]);
    expect(map.get('SH01')).toBe(4);
    expect(map.size).toBe(1);
  });

  it('skips rows with missing / non-positive / malformed metadata', () => {
    const map = clipLengthsFromVidShotRows([
      { metadata: { shot_id: 'SH01', duration_seconds: 0 } }, // non-positive
      { metadata: { shot_id: 'SH02' } }, // no duration
      { metadata: { duration_seconds: 3 } }, // no shot_id
      { metadata: null },
      {},
    ]);
    expect(map.size).toBe(0);
  });
});

describe('isDeletedShot — Director ≤0.5s soft-delete', () => {
  it('flags a shot whose override duration is ≤0.5s', () => {
    const overrides: Record<string, AnimaticDirectorOverride> = {
      SH02: { duration_seconds: 0.5 },
      SH03: { duration_seconds: 0.1 },
    };
    expect(isDeletedShot(shot('SH02', 4), overrides)).toBe(true);
    expect(isDeletedShot(shot('SH03', 4), overrides)).toBe(true);
  });

  it('does NOT flag a live shot (override above threshold, or no override)', () => {
    const overrides: Record<string, AnimaticDirectorOverride> = {
      SH01: { duration_seconds: 3 },
    };
    expect(isDeletedShot(shot('SH01', 3), overrides)).toBe(false);
    expect(isDeletedShot(shot('SH04', 4), overrides)).toBe(false); // no override
    expect(isDeletedShot(shot('SH05', 4), undefined)).toBe(false);
  });

  it('is decidable without clip lengths (override drives the verdict)', () => {
    // The completeness gate has no media context — the verdict must come from
    // the override alone, which it does.
    const overrides: Record<string, AnimaticDirectorOverride> = {
      SH01: { duration_seconds: DELETED_SHOT_MAX_SECONDS },
    };
    expect(isDeletedShot(shot('SH01', 8), overrides)).toBe(true);
  });
});
