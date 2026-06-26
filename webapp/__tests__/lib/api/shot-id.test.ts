// Unit tests for the single-source-of-truth shot identity module
// (refactor 2026-06-26, Director q2): `S{season}-E{episode}-SH{number}`.

import { describe, expect, test } from 'vitest';
import {
  SHOT_ID_RE,
  canonicalShotId,
  episodeShort,
  resolveShotId,
} from '@/lib/api/shot-id';

describe('episodeShort', () => {
  test('strips the SS studio prefix, idempotent', () => {
    expect(episodeShort('SS-S15-E12')).toBe('S15-E12');
    expect(episodeShort('S15-E12')).toBe('S15-E12');
    expect(episodeShort(null)).toBe('');
    expect(episodeShort(undefined)).toBe('');
  });
});

describe('canonicalShotId', () => {
  test('builds an SS-free, act/scene-free, zero-padded id by position', () => {
    expect(canonicalShotId('SS-S15-E12', 1)).toBe('S15-E12-SH01');
    expect(canonicalShotId('SS-S15-E12', 7)).toBe('S15-E12-SH07');
    expect(canonicalShotId('SS-S15-E12', 123)).toBe('S15-E12-SH123');
  });
});

describe('SHOT_ID_RE', () => {
  test('accepts the new canonical shape, rejects the legacy compound', () => {
    expect(SHOT_ID_RE.test('S15-E12-SH07')).toBe(true);
    expect(SHOT_ID_RE.test('s15-e12-sh07')).toBe(true); // case-insensitive
    expect(SHOT_ID_RE.test('SS-S15-E12-A2-SC07-SH07')).toBe(false);
    expect(SHOT_ID_RE.test('S15-E12')).toBe(false);
    expect(SHOT_ID_RE.test('SH07')).toBe(false);
  });
});

describe('resolveShotId (q6 — button number is enough)', () => {
  const ep = 'SS-S15-E12';

  test('bare button number → canonical id', () => {
    expect(resolveShotId('7', ep)).toBe('S15-E12-SH07');
    expect(resolveShotId('123', ep)).toBe('S15-E12-SH123');
  });

  test('bare SH token (any case / padding) → canonical id', () => {
    expect(resolveShotId('SH7', ep)).toBe('S15-E12-SH07');
    expect(resolveShotId('sh07', ep)).toBe('S15-E12-SH07');
    expect(resolveShotId('SH123', ep)).toBe('S15-E12-SH123');
  });

  test('already-canonical id → unchanged (case-normalised)', () => {
    expect(resolveShotId('S15-E12-SH07', ep)).toBe('S15-E12-SH07');
    expect(resolveShotId('s15-e12-sh07', ep)).toBe('S15-E12-SH07');
  });

  test('legacy compound / unknown shape → passed through untouched', () => {
    // Frozen legacy episode keeps its stored id; a wrong id fails loud later.
    expect(resolveShotId('SS-S15-E11-A2-SC07-SH07', ep)).toBe(
      'SS-S15-E11-A2-SC07-SH07',
    );
    expect(resolveShotId('garbage', ep)).toBe('garbage');
  });

  test('no episode context → number cannot be expanded, left as-is', () => {
    expect(resolveShotId('7', null)).toBe('7');
  });
});
