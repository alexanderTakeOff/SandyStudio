// Unit tests for the Animator runner (Sprint «Дизайнер и Аниматор» Day 6-7,
// 2026-05-19). Mocks Anthropic provider — no real API key, no spend.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/agents/providers/anthropic-text', () => ({
  AnthropicTextError: class AnthropicTextError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AnthropicTextError';
    }
  },
  generateAnthropicText: vi.fn(),
}));

import { generateAnthropicText } from '@/lib/agents/providers/anthropic-text';
import {
  VANIM_CONTRACT,
  VANIM_MODEL,
  VANIM_PROVIDER_ALLOWLIST,
  ASPECT_BY_DELIVERY_TARGET,
  AnimatorError,
  resolveAnimatorDeliveryTargets,
  resolveVanimProviderId,
  runAnimator,
  _resetAnimatorPromptCacheForTests,
} from '@/lib/agents/runners/animator';

type MockedAnthropic = ReturnType<typeof vi.fn> & {
  mockResolvedValueOnce: (v: unknown) => unknown;
  mockRejectedValueOnce: (e: unknown) => unknown;
};
const mockedAnthropic = generateAnthropicText as unknown as MockedAnthropic;

const MIN_STB_CONTENT = [
  '```json',
  JSON.stringify({
    acts: [
      {
        shots: [
          {
            shot_id: 'SS-S99-E99-A1-SC01-SH01',
            shot_role: 'establishing',
            camera_angle: 'WIDE',
            duration_seconds: 4,
            action_prose: 'Sandy walks into the bar, surveys the room.',
            characters: [{ bible_slug: 'sandy' }],
          },
        ],
      },
    ],
  }),
  '```',
].join('\n');

const STB_ASSET = {
  id: 'stb-1',
  file_type: 'STB-storyboard',
  status: 'APPROVED',
  content: MIN_STB_CONTENT,
  filename: 'STB-storyboard.md',
};

const MIN_BIBLE = {
  series_id: 'S99',
  general_idea: 'a comedy series',
  characters: [{ slug: 'sandy', description: 'protagonist' }],
  locations: [],
  styles: [],
  total_entries: 1,
};

beforeEach(() => {
  _resetAnimatorPromptCacheForTests();
  mockedAnthropic.mockReset?.();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveAnimatorDeliveryTargets', () => {
  it('prefers episode metadata when present', () => {
    expect(
      resolveAnimatorDeliveryTargets({
        episodeMetadata: { delivery_targets: ['tiktok', 'instagram_reels'] },
      }),
    ).toEqual(['tiktok', 'instagram_reels']);
  });
  it('falls back to series defaults when episode has none', () => {
    expect(
      resolveAnimatorDeliveryTargets({
        episodeMetadata: null,
        seriesDeliveryTargets: ['youtube_shorts'],
      }),
    ).toEqual(['youtube_shorts']);
  });
  it('falls back to youtube_landscape when neither set', () => {
    expect(
      resolveAnimatorDeliveryTargets({
        episodeMetadata: null,
        seriesDeliveryTargets: null,
      }),
    ).toEqual(['youtube_landscape']);
  });
  it('ignores non-array delivery_targets', () => {
    expect(
      resolveAnimatorDeliveryTargets({
        episodeMetadata: { delivery_targets: 'tiktok' },
      }),
    ).toEqual(['youtube_landscape']);
  });
});

describe('ASPECT_BY_DELIVERY_TARGET', () => {
  it('has all 6 canonical targets', () => {
    expect(ASPECT_BY_DELIVERY_TARGET.youtube_landscape).toBe('16:9');
    expect(ASPECT_BY_DELIVERY_TARGET.youtube_shorts).toBe('9:16');
    expect(ASPECT_BY_DELIVERY_TARGET.instagram_reels).toBe('9:16');
    expect(ASPECT_BY_DELIVERY_TARGET.tiktok).toBe('9:16');
    expect(ASPECT_BY_DELIVERY_TARGET.instagram_post).toBe('1:1');
    expect(ASPECT_BY_DELIVERY_TARGET.print_poster).toBe('16:9');
  });
});

describe('VANIM_PROVIDER_ALLOWLIST', () => {
  it('contains exactly the sprint providers (TD-67a 2026-05-27: four-alias policy restored — seedance-standard re-added per Director directive q49b)', () => {
    expect(VANIM_PROVIDER_ALLOWLIST).toEqual([
      'seedance-fast',
      'seedance-standard',
      'veo-standard',
      'seedance-with-end-image',
    ]);
  });
});

// TD-44 (2026-05-24): provider.id → {providerImpl, qualityTier} resolver.
// Single source of truth for the Animator-to-VGEN provider/quality bridge.
describe('resolveVanimProviderId — TD-44', () => {
  it('seedance-fast → seedance-fal-img2vid + fast', () => {
    expect(resolveVanimProviderId('seedance-fast')).toEqual({
      providerImpl: 'seedance-fal-img2vid',
      qualityTier: 'fast',
      prefersEndImage: false,
    });
  });

  // TD-67a (2026-05-27): seedance-standard RESTORED per Director directive
  // q49b. SH01 regression case again served by this alias for action-heavy
  // single-frame shots (no end anchor required).
  it('seedance-standard → seedance-fal-img2vid + standard (TD-67a restored)', () => {
    expect(resolveVanimProviderId('seedance-standard')).toEqual({
      providerImpl: 'seedance-fal-img2vid',
      qualityTier: 'standard',
      prefersEndImage: false,
    });
  });

  it('seedance-with-end-image → seedance-fal-img2vid + standard + end-image hint', () => {
    expect(resolveVanimProviderId('seedance-with-end-image')).toEqual({
      providerImpl: 'seedance-fal-img2vid',
      qualityTier: 'standard',
      prefersEndImage: true,
    });
  });

  it('veo-standard → veo-3-img2vid + standard', () => {
    expect(resolveVanimProviderId('veo-standard')).toEqual({
      providerImpl: 'veo-3-img2vid',
      qualityTier: 'standard',
      prefersEndImage: false,
    });
  });

  it('throws on unknown provider id (out-of-allowlist)', () => {
    expect(() => resolveVanimProviderId('flux-pro-ultra')).toThrow(
      /unknown Animator provider/,
    );
  });

  it('throws on empty string', () => {
    expect(() => resolveVanimProviderId('')).toThrow(/unknown Animator provider/);
  });
});

describe('runAnimator — happy path', () => {
  it('returns Plan with provider, aspect, duration, prompt', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: '# Shot Plan',
      body: {
        shot_id: 'SS-S99-E99-A1-SC01-SH01',
        plan_version: 'v01',
        delivery_targets: ['youtube_landscape'],
        provider: { id: 'seedance-fast', rationale: 'iteration default' },
        aspect_ratio: '16:9',
        duration_seconds: 4,
        quality_tier: 'fast',
        seed_strategy: { mode: 'random', seed_value: null, rationale: 'first try' },
        end_image: { eref_asset_id: null, rationale: null },
        reference_anchor: { kind: 'none', asset_id: null, slug: null },
        prompt: 'SUBJECT: Sandy. ACTION: walks. CAMERA: WIDE static.',
        prompt_format: 'seedance-7-slot',
        negative: ['no text', 'no logos', 'no watermarks', 'no captions'],
        estimated_cost_usd: 0.12,
        policy_notes: [],
      },
      costUsd: 0.025,
      model: VANIM_MODEL,
    });

    const r = await runAnimator({
      inputs: {
        agent_id: 'EXEC-VANIM',
        episode: {
          id: 'ep-1',
          episode_code: 'SS-S99-E99',
          title_working: 'Test',
          metadata: { delivery_targets: ['youtube_landscape'] },
        },
        upstream_assets: [STB_ASSET],
        bible: MIN_BIBLE,
      } as never,
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(r.contract).toBe(VANIM_CONTRACT);
    expect(r.shotId).toBe('SS-S99-E99-A1-SC01-SH01');
    expect(r.deliveryTargets).toEqual(['youtube_landscape']);
    expect(r.body.provider).toEqual({ id: 'seedance-fast', rationale: 'iteration default' });
  });
});

describe('runAnimator — preconditions', () => {
  it('throws when shotId is empty', async () => {
    await expect(
      runAnimator({
        inputs: { upstream_assets: [STB_ASSET], bible: MIN_BIBLE } as never,
        shotId: '',
      }),
    ).rejects.toThrow(/shotId is required/);
  });

  it('throws when no APPROVED STB-storyboard upstream', async () => {
    await expect(
      runAnimator({
        inputs: { upstream_assets: [], bible: MIN_BIBLE } as never,
        shotId: 'SS-S99-E99-A1-SC01-SH01',
      }),
    ).rejects.toThrow(/STB-storyboard not found/);
  });

  it('throws when shotId not in storyboard', async () => {
    await expect(
      runAnimator({
        inputs: { upstream_assets: [STB_ASSET], bible: MIN_BIBLE } as never,
        shotId: 'NONEXISTENT',
      }),
    ).rejects.toThrow(/not found in STB asset/);
  });

  it('throws AnimatorError on Anthropic failure', async () => {
    mockedAnthropic.mockRejectedValueOnce(new Error('upstream 503'));
    await expect(
      runAnimator({
        inputs: {
          episode: { episode_code: 'X', title_working: 'X', metadata: {} },
          upstream_assets: [STB_ASSET],
          bible: MIN_BIBLE,
        } as never,
        shotId: 'SS-S99-E99-A1-SC01-SH01',
      }),
    ).rejects.toThrow();
  });

  it('throws AnimatorError when LLM returns no JSON body', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'no JSON',
      body: null,
      costUsd: 0.01,
      model: VANIM_MODEL,
    });
    await expect(
      runAnimator({
        inputs: {
          episode: { episode_code: 'X', title_working: 'X', metadata: {} },
          upstream_assets: [STB_ASSET],
          bible: MIN_BIBLE,
        } as never,
        shotId: 'SS-S99-E99-A1-SC01-SH01',
      }),
    ).rejects.toThrow(/no parseable JSON/);
  });
});

describe('runAnimator — warning notes', () => {
  it('annotates when provider is outside sprint allowlist', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'Plan',
      body: {
        shot_id: 'SS-S99-E99-A1-SC01-SH01',
        provider: { id: 'flux-pro-1.1-ultra', rationale: 'experimental' },
        size: {},
      },
      costUsd: 0.02,
      model: VANIM_MODEL,
    });
    const r = await runAnimator({
      inputs: {
        episode: { episode_code: 'X', title_working: 'X', metadata: {} },
        upstream_assets: [STB_ASSET],
        bible: MIN_BIBLE,
      } as never,
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(r.notes.some((n) => n.includes('outside sprint allowlist'))).toBe(true);
  });

  it('annotates when cost exceeds ceiling', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'Plan',
      body: { provider: { id: 'seedance-fast' } },
      costUsd: 0.25, // > 0.15
      model: VANIM_MODEL,
    });
    const r = await runAnimator({
      inputs: {
        episode: { episode_code: 'X', title_working: 'X', metadata: {} },
        upstream_assets: [STB_ASSET],
        bible: MIN_BIBLE,
      } as never,
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(r.notes.some((n) => n.startsWith('Cost overrun'))).toBe(true);
  });

  it('annotates when bible is empty (MVP mode)', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'Plan',
      body: { provider: { id: 'seedance-fast' } },
      costUsd: 0.02,
      model: VANIM_MODEL,
    });
    const r = await runAnimator({
      inputs: {
        episode: { episode_code: 'X', title_working: 'X', metadata: {} },
        upstream_assets: [STB_ASSET],
        bible: {
          series_id: null,
          general_idea: null,
          characters: [],
          locations: [],
          styles: [],
          total_entries: 0,
        },
      } as never,
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(r.notes.some((n) => n.includes('MVP mode'))).toBe(true);
  });
});

describe('AnimatorError', () => {
  it('is the error class thrown by precondition failures', async () => {
    try {
      await runAnimator({
        inputs: { upstream_assets: [], bible: MIN_BIBLE } as never,
        shotId: 'X',
      });
      throw new Error('should reject');
    } catch (err) {
      expect(err).toBeInstanceOf(AnimatorError);
    }
  });
});
