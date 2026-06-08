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
});
