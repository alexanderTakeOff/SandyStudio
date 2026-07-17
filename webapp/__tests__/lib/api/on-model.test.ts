// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/api/on-model.test.ts
// On-model gate — the pure decision + defensive strictness reader.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  decideOnModel,
  readOnModelStrictness,
  DEFAULT_ON_MODEL_STRICTNESS,
  type OnModelRaw,
} from '@/lib/api/on-model';

const ON = (silhouette_ok: boolean, transparency_ok: boolean): OnModelRaw => ({
  silhouette_ok,
  transparency_ok,
  reason: 't',
});

describe('decideOnModel', () => {
  it('loose is always PASS (gate off), whatever the axes', () => {
    expect(decideOnModel(ON(false, false), 'loose', false)).toBe('PASS');
    expect(decideOnModel(ON(false, false), 'loose', true)).toBe('PASS');
    expect(decideOnModel(ON(true, true), 'loose', false)).toBe('PASS');
  });

  describe('medium — silhouette only, transparency tolerated', () => {
    it('FAILs on silhouette loss', () => {
      expect(decideOnModel(ON(false, true), 'medium', false)).toBe('FAIL');
    });
    it('PASSes a milky/opaque body (transparency drift tolerated)', () => {
      expect(decideOnModel(ON(true, false), 'medium', false)).toBe('PASS');
    });
    it('PASSes when both axes are fine', () => {
      expect(decideOnModel(ON(true, true), 'medium', false)).toBe('PASS');
    });
    it('transformation shot passes even with silhouette loss', () => {
      expect(decideOnModel(ON(false, true), 'medium', true)).toBe('PASS');
      // transparency is tolerated under medium regardless
      expect(decideOnModel(ON(false, false), 'medium', true)).toBe('PASS');
    });
  });

  describe('strict — silhouette OR transparency', () => {
    it('FAILs on silhouette loss', () => {
      expect(decideOnModel(ON(false, true), 'strict', false)).toBe('FAIL');
    });
    it('FAILs on transparency drift', () => {
      expect(decideOnModel(ON(true, false), 'strict', false)).toBe('FAIL');
    });
    it('PASSes when both axes are fine', () => {
      expect(decideOnModel(ON(true, true), 'strict', false)).toBe('PASS');
    });
  });

  describe('transformation exception composition (the load-bearing edge cases)', () => {
    it('suppresses ONLY the silhouette term — transparency drift still FAILs under strict', () => {
      expect(decideOnModel(ON(false, false), 'strict', true)).toBe('FAIL');
    });
    it('a transformation shot with intact transparency PASSes under strict despite silhouette loss', () => {
      expect(decideOnModel(ON(false, true), 'strict', true)).toBe('PASS');
    });
  });
});

describe('readOnModelStrictness', () => {
  it('defaults to loose on absent / garbage metadata', () => {
    expect(readOnModelStrictness(null)).toBe(DEFAULT_ON_MODEL_STRICTNESS);
    expect(readOnModelStrictness(undefined)).toBe('loose');
    expect(readOnModelStrictness({})).toBe('loose');
    expect(readOnModelStrictness({ on_model_strictness: 'nonsense' })).toBe('loose');
    expect(readOnModelStrictness('not an object')).toBe('loose');
  });
  it('reads each valid level', () => {
    expect(readOnModelStrictness({ on_model_strictness: 'loose' })).toBe('loose');
    expect(readOnModelStrictness({ on_model_strictness: 'medium' })).toBe('medium');
    expect(readOnModelStrictness({ on_model_strictness: 'strict' })).toBe('strict');
  });
});
