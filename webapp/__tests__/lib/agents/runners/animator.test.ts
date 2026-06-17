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
  vanimAliasFor,
  buildResolutionContractBlock,
  buildEpisodeFormatAuthorityBlock,
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

// TD-85 (2026-06-01): resolution contract injected into the Animator's (and
// Critic's) input context — DRY source for the «pick resolution from the
// provider's supported set» rule. Sourced from VIDEO_PROVIDER_CAPS (SSOT), so
// the markdown prompts never hardcode the enum.
describe('buildResolutionContractBlock — TD-85', () => {
  const block = buildResolutionContractBlock();

  it('lists every allowlist provider', () => {
    for (const alias of VANIM_PROVIDER_ALLOWLIST) {
      expect(block).toContain(alias);
    }
  });

  it('exposes the Seedance supported set from the capability manifest', () => {
    // Seedance aliases must surface the real contract resolutions.
    expect(block).toMatch(/seedance-fast → supported: 480p, 720p, 1080p/);
    expect(block).toMatch(/seedance-standard → supported: 480p, 720p, 1080p/);
    expect(block).toMatch(
      /seedance-with-end-image → supported: 480p, 720p, 1080p/,
    );
  });

  it('marks Veo as fixed-resolution → null', () => {
    expect(block).toMatch(/veo-standard → fixed resolution \(no chooser\) → set resolution: null/);
  });

  it('does not hardcode resolutions outside the manifest (no 4k/1440p)', () => {
    expect(block).not.toMatch(/1440p|4k/i);
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

// ── 2026-06-17: episode FORMAT authority (Slice 1) ──────────────────────────────
describe('vanimAliasFor — reverse provider map', () => {
  it('maps each (impl, quality, prefersEndImage) to the allowlist alias', () => {
    expect(vanimAliasFor('seedance-fal-img2vid', 'fast', false)).toBe('seedance-fast');
    expect(vanimAliasFor('seedance-fal-img2vid', 'standard', false)).toBe('seedance-standard');
    expect(vanimAliasFor('seedance-fal-img2vid', 'standard', true)).toBe('seedance-with-end-image');
    expect(vanimAliasFor('veo-3-img2vid', 'standard', false)).toBe('veo-standard');
    expect(vanimAliasFor('veo-3-img2vid', 'fast', false)).toBe('veo-standard');
  });
});

describe('buildEpisodeFormatAuthorityBlock', () => {
  it('returns empty string for an un-configured episode', () => {
    expect(buildEpisodeFormatAuthorityBlock(null)).toBe('');
    expect(buildEpisodeFormatAuthorityBlock({})).toBe('');
  });
  it('lists declared fields + BINDING semantics when overrides off', () => {
    const b = buildEpisodeFormatAuthorityBlock({
      provider_id: 'seedance-fal-img2vid',
      resolution: '720p',
      allow_shot_overrides: false,
    });
    expect(b).toContain('720p');
    expect(b).toContain('BINDING');
  });
  it('signals override-allowed when overrides on', () => {
    const b = buildEpisodeFormatAuthorityBlock({ resolution: '720p', allow_shot_overrides: true });
    expect(b).toContain('allow_shot_overrides` is ON');
  });
});

describe('runAnimator — episode FORMAT authority conform', () => {
  const SHOT = 'SS-S99-E99-A1-SC01-SH01';
  const baseBody = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    shot_id: SHOT,
    plan_version: 'v01',
    delivery_targets: ['youtube_landscape'],
    provider: { id: 'seedance-standard', rationale: 'hero' },
    aspect_ratio: '16:9',
    duration_seconds: 4,
    quality_tier: 'standard',
    resolution: '1080p',
    seed_strategy: { mode: 'random', seed_value: null, rationale: 'x' },
    end_image: { eref_asset_id: null, rationale: null },
    reference_anchor: { kind: 'none', asset_id: null, slug: null },
    prompt: 'SUBJECT: Sandy. ACTION: walks. CAMERA: WIDE static.',
    prompt_format: 'seedance-7-slot',
    negative: ['no text'],
    estimated_cost_usd: 2.722,
    policy_notes: [],
    ...over,
  });
  const planMd = (body: Record<string, unknown>): string =>
    ['# Shot Plan — ' + SHOT + ' · v01', '', '```json', JSON.stringify(body, null, 2), '```'].join('\n');
  const run = (body: Record<string, unknown>, genVideoCfg?: Record<string, unknown>) => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: planMd(body),
      body,
      costUsd: 0.02,
      model: VANIM_MODEL,
    });
    return runAnimator({
      inputs: {
        agent_id: 'EXEC-VANIM',
        episode: {
          id: 'ep-1',
          episode_code: 'SS-S99-E99',
          title_working: 'Test',
          series_id: null,
          metadata: {
            delivery_targets: ['youtube_landscape'],
            ...(genVideoCfg ? { generation_config: { video: genVideoCfg } } : {}),
          },
        },
        upstream_assets: [STB_ASSET],
        bible: MIN_BIBLE,
      } as never,
      shotId: SHOT,
    });
  };

  it('conforms resolution to the episode (720p wins over LLM 1080p) when overrides off + scrubs the fabricated hard-contract', async () => {
    const r = await run(
      baseBody({ policy_notes: ["Director hard-contract honoured: resolution='1080p'"] }),
      { provider_id: 'seedance-fal-img2vid', resolution: '720p', quality_tier: 'standard', aspect_ratio: '16:9', allow_shot_overrides: false },
    );
    expect(r.body.resolution).toBe('720p');
    expect(r.body.estimated_cost_usd).not.toBe(2.722);
    const notes = r.body.policy_notes as string[];
    expect(notes.some((n) => /Director hard-contract honoured.*resolution/i.test(n))).toBe(false);
    expect(notes.some((n) => /Rationale \(Animator\): FORMAT conformed/.test(n))).toBe(true);
  });

  it('keeps the LLM resolution (1080p) when allow_shot_overrides is on', async () => {
    const r = await run(baseBody(), {
      provider_id: 'seedance-fal-img2vid',
      resolution: '720p',
      allow_shot_overrides: true,
    });
    expect(r.body.resolution).toBe('1080p');
  });

  it('writes resolution:null for a fixed-resolution provider (Veo) episode', async () => {
    const r = await run(baseBody({ provider: { id: 'veo-standard', rationale: 'v' } }), {
      provider_id: 'veo-3-img2vid',
      allow_shot_overrides: false,
    });
    expect(r.body.resolution).toBeNull();
  });

  it('preserves seedance-with-end-image alias when episode forces no family/quality change', async () => {
    const r = await run(
      baseBody({ provider: { id: 'seedance-with-end-image', rationale: 'end' }, resolution: '720p' }),
      { provider_id: 'seedance-fal-img2vid', quality_tier: 'standard', aspect_ratio: '16:9', resolution: '720p', allow_shot_overrides: false },
    );
    expect((r.body.provider as { id: string }).id).toBe('seedance-with-end-image');
  });

  it('legacy passthrough: no episode generation_config → FORMAT untouched', async () => {
    // Consistent fixture: seedance-fast ⇒ quality_tier fast (else the conform would
    // correctly reconcile the alias to the explicit quality_tier).
    const r = await run(
      baseBody({ provider: { id: 'seedance-fast', rationale: 'i' }, quality_tier: 'fast', resolution: '720p' }),
    );
    expect(r.body.resolution).toBe('720p');
    expect((r.body.provider as { id: string }).id).toBe('seedance-fast');
  });
});
