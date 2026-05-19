// Tests for genre helper (Sprint «Дизайнер и Аниматор» Day 11+ 2026-05-19).
// Used by GAGAD chain to gate firing on comedy-like genres.

import { describe, it, expect } from 'vitest';
import { isComedyLikeGenre, COMEDY_LIKE_GENRES } from '@/lib/api/genre';

describe('isComedyLikeGenre', () => {
  it('returns true for "comedy"', () => {
    expect(isComedyLikeGenre('comedy')).toBe(true);
  });

  it('returns false for non-comedy genres', () => {
    expect(isComedyLikeGenre('drama')).toBe(false);
    expect(isComedyLikeGenre('doc')).toBe(false);
    expect(isComedyLikeGenre('sci_fi')).toBe(false);
    expect(isComedyLikeGenre('other')).toBe(false);
  });

  it('returns false for null / undefined / empty', () => {
    expect(isComedyLikeGenre(null)).toBe(false);
    expect(isComedyLikeGenre(undefined)).toBe(false);
    expect(isComedyLikeGenre('')).toBe(false);
  });

  it('is case-sensitive (enum stores lowercase)', () => {
    expect(isComedyLikeGenre('Comedy')).toBe(false);
    expect(isComedyLikeGenre('COMEDY')).toBe(false);
  });

  it('ignores non-string values', () => {
    expect(isComedyLikeGenre(42 as unknown as string)).toBe(false);
    expect(isComedyLikeGenre({} as unknown as string)).toBe(false);
  });

  it('COMEDY_LIKE_GENRES is extensible — single entry today', () => {
    expect(COMEDY_LIKE_GENRES).toEqual(['comedy']);
    expect(COMEDY_LIKE_GENRES.length).toBe(1);
  });
});
