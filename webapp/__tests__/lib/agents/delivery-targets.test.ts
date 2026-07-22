// Unit tests for the shared delivery-targets leaf module + the aspect→target
// reverse helper that lets Episode Settings write the canonical delivery_targets.
import { describe, expect, it } from 'vitest';
import {
  readDeliveryTargetsFromMetadata,
  readEpisodeDeliveryTargets,
  resolveDeliveryTargets,
  readEpisodeRuntimeTarget,
  resolveRuntimeTarget,
  DEFAULT_RUNTIME_SECONDS,
  DEFAULT_SHORTS_RUNTIME_SECONDS,
} from '@/lib/agents/delivery-targets';
import { deliveryTargetsForAspect } from '@/lib/api/provider-capabilities';

describe('readDeliveryTargetsFromMetadata', () => {
  it('reads string entries, null on absent/garbage', () => {
    expect(readDeliveryTargetsFromMetadata({ delivery_targets: ['youtube_shorts'] })).toEqual(['youtube_shorts']);
    expect(readDeliveryTargetsFromMetadata({})).toBeNull();
    expect(readDeliveryTargetsFromMetadata(null)).toBeNull();
    expect(readDeliveryTargetsFromMetadata({ delivery_targets: 'x' })).toBeNull();
  });
  it('filters non-string / empty entries', () => {
    expect(readDeliveryTargetsFromMetadata({ delivery_targets: ['youtube_shorts', 3, '', null] })).toEqual(['youtube_shorts']);
  });
});

describe('readEpisodeDeliveryTargets', () => {
  it('reads off an episode row, always an array', () => {
    expect(readEpisodeDeliveryTargets({ metadata: { delivery_targets: ['tiktok'] } })).toEqual(['tiktok']);
    expect(readEpisodeDeliveryTargets({ metadata: {} })).toEqual([]);
    expect(readEpisodeDeliveryTargets(null)).toEqual([]);
  });
});

describe('resolveDeliveryTargets — precedence', () => {
  it('1. episode metadata wins', () => {
    expect(
      resolveDeliveryTargets({
        episodeMetadata: { delivery_targets: ['youtube_shorts'] },
        seriesDeliveryTargets: ['youtube_landscape'],
      }),
    ).toEqual(['youtube_shorts']);
  });
  it('2. falls back to series default', () => {
    expect(
      resolveDeliveryTargets({ episodeMetadata: {}, seriesDeliveryTargets: ['instagram_reels'] }),
    ).toEqual(['instagram_reels']);
  });
  it('3. final fallback is youtube_landscape', () => {
    expect(resolveDeliveryTargets({ episodeMetadata: {}, seriesDeliveryTargets: null })).toEqual(['youtube_landscape']);
    expect(resolveDeliveryTargets({ episodeMetadata: null })).toEqual(['youtube_landscape']);
  });
});

describe('deliveryTargetsForAspect — reverse map (Settings writes the canonical key)', () => {
  it('maps vertical/landscape/square to a canonical representative', () => {
    expect(deliveryTargetsForAspect('9:16')).toEqual(['youtube_shorts']);
    expect(deliveryTargetsForAspect('16:9')).toEqual(['youtube_landscape']);
    expect(deliveryTargetsForAspect('1:1')).toEqual(['instagram_post']);
  });
  it('returns [] for unmapped aspects so the caller leaves delivery_targets untouched', () => {
    expect(deliveryTargetsForAspect('auto')).toEqual([]);
    expect(deliveryTargetsForAspect('21:9')).toEqual([]);
    expect(deliveryTargetsForAspect(null)).toEqual([]);
  });
});

describe('readEpisodeRuntimeTarget', () => {
  it('reads a valid integer in [5,300]', () => {
    expect(readEpisodeRuntimeTarget({ metadata: { target_runtime_seconds: 60 } })).toBe(60);
    expect(readEpisodeRuntimeTarget({ metadata: { target_runtime_seconds: 5 } })).toBe(5);
    expect(readEpisodeRuntimeTarget({ metadata: { target_runtime_seconds: 300 } })).toBe(300);
  });
  it('rounds fractional values', () => {
    expect(readEpisodeRuntimeTarget({ metadata: { target_runtime_seconds: 59.6 } })).toBe(60);
  });
  it('returns null for absent / out-of-range / garbage', () => {
    expect(readEpisodeRuntimeTarget({ metadata: {} })).toBeNull();
    expect(readEpisodeRuntimeTarget({ metadata: { target_runtime_seconds: 0 } })).toBeNull();
    expect(readEpisodeRuntimeTarget({ metadata: { target_runtime_seconds: 999 } })).toBeNull();
    expect(readEpisodeRuntimeTarget({ metadata: { target_runtime_seconds: 'x' } })).toBeNull();
    expect(readEpisodeRuntimeTarget(null)).toBeNull();
  });
});

describe('resolveRuntimeTarget', () => {
  it('Director-set value is authoritative — wins even for a shorts episode', () => {
    expect(resolveRuntimeTarget({ episodeMetadata: { target_runtime_seconds: 60 }, shortsIsTarget: true })).toBe(60);
  });
  it('falls back to shorts default when unset + shorts', () => {
    expect(resolveRuntimeTarget({ episodeMetadata: {}, shortsIsTarget: true })).toBe(DEFAULT_SHORTS_RUNTIME_SECONDS);
  });
  it('falls back to long-form default when unset + not shorts', () => {
    expect(resolveRuntimeTarget({ episodeMetadata: {}, shortsIsTarget: false })).toBe(DEFAULT_RUNTIME_SECONDS);
  });
  it('DEFAULT_RUNTIME_SECONDS is 60 (Director: "60 by default")', () => {
    expect(DEFAULT_RUNTIME_SECONDS).toBe(60);
  });
});
