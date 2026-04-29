// ──────────────────────────────────────────────────────────────────────────────
// __tests__/api/status-transitions.test.ts
// Coverage for the asset/episode transition graphs (lib/api/status-transitions).
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import {
  ASSET_TRANSITIONS,
  EPISODE_TRANSITIONS,
  assertAssetTransition,
  assertEpisodeTransition,
} from '@/lib/api/status-transitions';

describe('asset transitions', () => {
  it('allows DRAFT → REVIEW', () => {
    expect(() => assertAssetTransition('DRAFT', 'REVIEW')).not.toThrow();
  });

  it('rejects DRAFT → APPROVED (must go through REVIEW)', () => {
    expect(() => assertAssetTransition('DRAFT', 'APPROVED')).toThrow(
      /transition not allowed/i,
    );
  });

  it('allows self-transition no-op', () => {
    expect(() => assertAssetTransition('REVIEW', 'REVIEW')).not.toThrow();
  });

  it('LOCKED is terminal', () => {
    expect(ASSET_TRANSITIONS.LOCKED).toEqual([]);
    expect(() => assertAssetTransition('LOCKED', 'REVIEW')).toThrow();
  });

  it('TEST (Mode 4 outputs) cannot promote to APPROVED', () => {
    expect(() => assertAssetTransition('TEST', 'APPROVED')).toThrow();
    expect(() => assertAssetTransition('TEST', 'INVALIDATED')).not.toThrow();
  });

  it('REVIEW → REVISION requires path through REVIEW or REVISION cascade', () => {
    expect(() => assertAssetTransition('REVIEW', 'REVISION')).not.toThrow();
    expect(() => assertAssetTransition('REVISION', 'REVIEW')).not.toThrow();
  });
});

describe('episode transitions', () => {
  it('forbids skipping the animatic gate', () => {
    expect(() => assertEpisodeTransition('STORYBOARD_APPROVED', 'GENERATION_IN_PROGRESS')).toThrow();
    expect(() => assertEpisodeTransition('STORYBOARD_APPROVED', 'ANIMATIC_IN_PROGRESS')).not.toThrow();
    expect(() => assertEpisodeTransition('ANIMATIC_APPROVED', 'GENERATION_IN_PROGRESS')).not.toThrow();
  });

  it('publish gate requires PUBLISH_PENDING → PUBLISHED', () => {
    expect(() => assertEpisodeTransition('PUBLISH_PENDING', 'PUBLISHED')).not.toThrow();
    expect(() => assertEpisodeTransition('GENERATION_APPROVED', 'PUBLISHED')).toThrow();
  });

  it('COMPLETE is terminal', () => {
    expect(EPISODE_TRANSITIONS.COMPLETE).toEqual([]);
  });
});
