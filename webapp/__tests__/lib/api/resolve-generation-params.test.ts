// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/api/resolve-generation-params.test.ts
//
// Precedence + regression-safety coverage for the episode-authoritative
// generation-params resolver (the linchpin that stops Director's provider/
// format directives from getting lost on the fan-out path).
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  resolveVideoParams,
  resolveImageParams,
  imageProviderAlias,
  imageQualityForProvider,
} from '@/lib/api/resolve-generation-params';
import type { VgenDefaults } from '@/lib/api/vgen-defaults';

const SERIES_SEEDANCE_169: VgenDefaults = {
  provider_id: 'seedance-fal-img2vid',
  aspect_ratio: '16:9',
  quality_tier: 'fast',
};

describe('resolveVideoParams — episode authority', () => {
  it('episode config wins over shot override when allow_shot_overrides is off', () => {
    const r = resolveVideoParams({
      episodeConfig: {
        provider_id: 'seedance-fal-img2vid',
        aspect_ratio: '9:16',
        quality_tier: 'standard',
        resolution: '1080p',
        // allow_shot_overrides absent → default false → episode authority
      },
      shotOverride: { aspect_ratio: '16:9', quality_tier: 'fast', resolution: '480p' },
    });
    expect(r.aspectRatio).toBe('9:16');
    expect(r.qualityTier).toBe('standard');
    expect(r.resolution).toBe('1080p');
    expect(r.source.aspect).toBe('episode');
    expect(r.source.quality).toBe('episode');
  });

  it('shot override wins when allow_shot_overrides is on', () => {
    const r = resolveVideoParams({
      episodeConfig: {
        provider_id: 'seedance-fal-img2vid',
        aspect_ratio: '9:16',
        quality_tier: 'standard',
        resolution: '1080p',
        allow_shot_overrides: true,
      },
      shotOverride: { aspect_ratio: '16:9' },
    });
    // aspect overridden by shot; quality/resolution fall back to episode
    expect(r.aspectRatio).toBe('16:9');
    expect(r.source.aspect).toBe('shot');
    expect(r.qualityTier).toBe('standard');
    expect(r.resolution).toBe('1080p');
  });

  it('honours a shot override for a field the episode did NOT declare (no regression)', () => {
    const r = resolveVideoParams({
      // episode declares only aspect; provider/quality come from the shot
      episodeConfig: { aspect_ratio: '9:16' },
      shotOverride: {
        provider_id: 'veo-3-img2vid',
        quality_tier: 'standard',
      },
    });
    expect(r.aspectRatio).toBe('9:16'); // episode authority on declared field
    expect(r.providerId).toBe('veo-3-img2vid'); // shot fills the undeclared field
    expect(r.qualityTier).toBe('standard');
  });
});

describe('resolveVideoParams — fallback chain', () => {
  it('falls through to series defaults when episode + shot are silent', () => {
    const r = resolveVideoParams({
      episodeConfig: null,
      shotOverride: {},
      seriesDefaults: {
        provider_id: 'veo-3-img2vid',
        aspect_ratio: '9:16',
        quality_tier: 'standard',
      },
    });
    expect(r.providerId).toBe('veo-3-img2vid');
    expect(r.aspectRatio).toBe('9:16');
    expect(r.qualityTier).toBe('standard');
    expect(r.source.provider).toBe('series');
    // Veo is fixed-resolution → no resolution knob
    expect(r.resolution).toBeNull();
  });

  it('uses the assignment provider below episode but above series', () => {
    const r = resolveVideoParams({
      episodeConfig: null,
      assignmentProviderId: 'veo-3-img2vid',
      seriesDefaults: SERIES_SEEDANCE_169,
    });
    expect(r.providerId).toBe('veo-3-img2vid');
    expect(r.source.provider).toBe('assignment');
  });

  it('derives aspect from delivery_target when nothing else sets it', () => {
    const r = resolveVideoParams({
      episodeConfig: null,
      deliveryAspect: '9:16', // youtube_shorts
    });
    expect(r.aspectRatio).toBe('9:16');
    expect(r.source.aspect).toBe('delivery');
  });

  it('reproduces the legacy hardcode for a fully un-configured episode', () => {
    const r = resolveVideoParams({});
    expect(r.providerId).toBe('seedance-fal-img2vid');
    expect(r.aspectRatio).toBe('16:9');
    expect(r.qualityTier).toBe('fast');
    expect(r.resolution).toBeNull(); // null = provider default (no silent pin)
  });
});

describe('resolveVideoParams — capability clamping', () => {
  it('drops a resolution the resolved provider cannot render', () => {
    // Veo has an empty resolution set → any requested resolution → null
    const r = resolveVideoParams({
      episodeConfig: { provider_id: 'veo-3-img2vid', resolution: '1080p' },
    });
    expect(r.providerId).toBe('veo-3-img2vid');
    expect(r.resolution).toBeNull();
  });

  it('keeps a supported resolution', () => {
    const r = resolveVideoParams({
      episodeConfig: { provider_id: 'seedance-fal-img2vid', resolution: '480p' },
    });
    expect(r.resolution).toBe('480p');
    expect(r.source.resolution).toBe('episode');
  });
});

describe('resolveImageParams', () => {
  it('episode image config wins over config fallback', () => {
    const r = resolveImageParams({
      episodeConfig: { provider_id: 'flux-pro-1.1-ultra', quality: 'medium' },
      configProviderId: 'openai-edits-multi',
    });
    expect(r.providerId).toBe('flux-pro-1.1-ultra');
    expect(r.quality).toBe('medium');
    expect(r.source.provider).toBe('episode');
  });

  it('falls back to config provider then hard fallback', () => {
    const r = resolveImageParams({ configProviderId: 'flux-pro-1.1-ultra' });
    expect(r.providerId).toBe('flux-pro-1.1-ultra');
    expect(r.source.provider).toBe('config');
    expect(r.quality).toBe('high'); // hard fallback
  });
});

describe('imageProviderAlias', () => {
  it('translates openai-edits-multi to the plan-alias gpt-image-2', () => {
    expect(imageProviderAlias('openai-edits-multi')).toBe('gpt-image-2');
  });
  it('passes flux through unchanged', () => {
    expect(imageProviderAlias('flux-pro-1.1-ultra')).toBe('flux-pro-1.1-ultra');
  });
});

describe('imageQualityForProvider', () => {
  it('clamps auto to high (provider arg has no auto)', () => {
    expect(imageQualityForProvider('auto')).toBe('high');
  });
  it('passes low/medium/high through', () => {
    expect(imageQualityForProvider('low')).toBe('low');
    expect(imageQualityForProvider('medium')).toBe('medium');
    expect(imageQualityForProvider('high')).toBe('high');
  });
});
