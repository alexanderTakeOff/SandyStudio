// Unit tests for the shared delivery-targets leaf module + the aspect→target
// reverse helper that lets Episode Settings write the canonical delivery_targets.
import { describe, expect, it } from 'vitest';
import {
  readDeliveryTargetsFromMetadata,
  readEpisodeDeliveryTargets,
  resolveDeliveryTargets,
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
