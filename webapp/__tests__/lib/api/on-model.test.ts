// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/api/on-model.test.ts
// On-model gate — the pure canon-compliance decision + strictness reader.
// medium enforces silhouette+location; strict enforces every axis; null = N/A.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  decideOnModel,
  readOnModelStrictness,
  DEFAULT_ON_MODEL_STRICTNESS,
  type OnModelRaw,
} from '@/lib/api/on-model';

/** All axes PASS by default; override the ones a case cares about. */
const axes = (over: Partial<OnModelRaw> = {}): OnModelRaw => ({
  silhouette_ok: true,
  transparency_ok: true,
  location_ok: true,
  style_ok: true,
  objects_ok: true,
  reason: 't',
  ...over,
});

describe('decideOnModel', () => {
  it('loose is always PASS (gate off), whatever the axes', () => {
    expect(decideOnModel(axes({ silhouette_ok: false, location_ok: false, style_ok: false }), 'loose', false)).toBe('PASS');
  });

  describe('medium — silhouette + location only', () => {
    it('FAILs on silhouette loss', () => {
      expect(decideOnModel(axes({ silhouette_ok: false }), 'medium', false)).toBe('FAIL');
    });
    it('FAILs on wrong location', () => {
      expect(decideOnModel(axes({ location_ok: false }), 'medium', false)).toBe('FAIL');
    });
    it('tolerates transparency / style / objects drift', () => {
      expect(decideOnModel(axes({ transparency_ok: false, style_ok: false, objects_ok: false }), 'medium', false)).toBe('PASS');
    });
    it('PASSes when silhouette + location are fine', () => {
      expect(decideOnModel(axes(), 'medium', false)).toBe('PASS');
    });
  });

  describe('strict — every axis', () => {
    it.each(['silhouette_ok', 'transparency_ok', 'location_ok', 'style_ok', 'objects_ok'] as const)(
      'FAILs when %s is off',
      (axis) => {
        expect(decideOnModel(axes({ [axis]: false }), 'strict', false)).toBe('FAIL');
      },
    );
    it('PASSes when all axes are fine', () => {
      expect(decideOnModel(axes(), 'strict', false)).toBe('PASS');
    });
  });

  describe('null axes (no canon of that kind) are never enforced', () => {
    it('medium PASSes when location canon is absent (null), even a pure-env shot', () => {
      expect(decideOnModel(axes({ silhouette_ok: null, transparency_ok: null, location_ok: null }), 'medium', false)).toBe('PASS');
    });
    it('strict PASSes when only-present axes are fine and the rest are null', () => {
      expect(decideOnModel(axes({ silhouette_ok: true, transparency_ok: true, location_ok: null, style_ok: null, objects_ok: null }), 'strict', false)).toBe('PASS');
    });
    it('strict still FAILs a present axis that is off while others are null', () => {
      expect(decideOnModel(axes({ silhouette_ok: false, location_ok: null, style_ok: null, objects_ok: null }), 'strict', false)).toBe('FAIL');
    });
  });

  describe('transformation exception (suppresses ONLY silhouette)', () => {
    it('medium: silhouette loss on a transformation shot PASSes', () => {
      expect(decideOnModel(axes({ silhouette_ok: false }), 'medium', true)).toBe('PASS');
    });
    it('medium: wrong location on a transformation shot still FAILs', () => {
      expect(decideOnModel(axes({ silhouette_ok: false, location_ok: false }), 'medium', true)).toBe('FAIL');
    });
    it('strict: transformation suppresses silhouette but transparency drift still FAILs', () => {
      expect(decideOnModel(axes({ silhouette_ok: false, transparency_ok: false }), 'strict', true)).toBe('FAIL');
      expect(decideOnModel(axes({ silhouette_ok: false, transparency_ok: true }), 'strict', true)).toBe('PASS');
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
