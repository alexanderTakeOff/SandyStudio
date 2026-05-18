// Unit tests for the Episode Reference Designer runner (Sprint «Дизайнер и
// Аниматор», Day 2-3). Guards: provider allowlist, size table, delivery_targets
// precedence, STB pre-flight, system-prompt loading, anthropic call wiring,
// and surfaced warning notes (provider-out-of-allowlist, cost overrun).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Anthropic provider — runner is exercised end-to-end, but no real
// API key is used and no money is spent in test runs.
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
  EREF_DESIGNER_CONTRACT,
  EREF_DESIGNER_MODEL,
  EREF_DESIGNER_PROVIDER_ALLOWLIST,
  SIZE_BY_DELIVERY_TARGET,
  EpisodeReferenceDesignerError,
  resolveDeliveryTargets,
  runEpisodeReferenceDesigner,
  _resetSystemPromptCacheForTests,
} from '@/lib/agents/runners/episode-reference-designer';

type MockedAnthropic = ReturnType<typeof vi.fn> & {
  mockResolvedValueOnce: (v: unknown) => unknown;
  mockResolvedValue: (v: unknown) => unknown;
  mockRejectedValueOnce: (e: unknown) => unknown;
  mock: { calls: unknown[][] };
};
const mockedAnthropic = generateAnthropicText as unknown as MockedAnthropic;

// Minimal valid STB content with one shot SS-S99-E99-A1-SC01-SH01.
const STB_CONTENT_VALID = [
  '# Storyboard — SS-S99-E99 — test',
  '',
  '```json',
  JSON.stringify({
    acts: [
      {
        shots: [
          {
            shot_id: 'SS-S99-E99-A1-SC01-SH01',
            shot_role: 'establishing',
            duration_seconds: 4,
            camera_angle: 'WIDE',
            action_prose: 'Sandy enters the perfume shop, scanning the counters.',
            expected_gag: 'Sandy bumps into a perfume stand',
            expected_emotion: 'curious',
            characters: [
              { bible_slug: 'sandy', display_name: 'Sandy', emotion: 'curious' },
            ],
          },
          {
            shot_id: 'SS-S99-E99-A1-SC01-SH02',
            shot_role: 'action',
            duration_seconds: 5,
            camera_angle: 'MEDIUM',
            action_prose: 'Sandy leans over the counter to inspect a bottle.',
            characters: [{ bible_slug: 'sandy', display_name: 'Sandy' }],
          },
        ],
      },
    ],
  }),
  '```',
].join('\n');

const BIBLE_MINIMAL = {
  series_id: 'SS-S99',
  general_idea: null,
  characters: [],
  locations: [],
  styles: [],
  total_entries: 0,
};

const STB_ASSET = {
  id: 'stb-asset-uuid-1',
  file_type: 'STB-storyboard',
  status: 'APPROVED',
  content: STB_CONTENT_VALID,
  filename: 'SS-S99-E99-STB-test-v01-APPROVED.md',
};

// Stable mock Anthropic response — Designer-shaped JSON body.
const VALID_DESIGNER_RESPONSE = {
  markdown: '# Reference Plan — SS-S99-E99-A1-SC01-SH01 · v01\n... and JSON below ...',
  body: {
    shot_id: 'SS-S99-E99-A1-SC01-SH01',
    plan_version: 'v01',
    delivery_targets: ['youtube_landscape'],
    provider: {
      id: 'gpt-image-2',
      rationale: 'Sprint-scope default; faces benefit from gpt-image-2 fidelity.',
    },
    size: {
      width: 1536,
      height: 1024,
      rationale: '16:9 landscape for youtube_landscape per Sprint table.',
    },
    variants: { count: 2, rationale: 'Pilot mode — establishing + action.' },
    continuity_strategy: {
      mode: 'openai-edits-multi',
      anchor_assets: ['sandy'],
      rationale: 'Anchor identity on Bible Sandy.',
    },
    prompt: '[Action] Sandy enters the perfume shop ...',
    negative: [
      'no extra limbs',
      'no face morphing',
      'no costume changes',
      'no text or logos',
      'no on-screen captions',
    ],
    camera_intent: {
      angle: 'WIDE',
      sub_area_variation: 'Wide of counter aisle; sibling SH02 will be over-shoulder.',
    },
    estimated_cost_usd: 0.06,
    policy_notes: [],
  },
  costUsd: 0.022,
  model: EREF_DESIGNER_MODEL,
  usage: { inputTokens: 4200, outputTokens: 850 },
};

beforeEach(() => {
  mockedAnthropic.mockResolvedValue(VALID_DESIGNER_RESPONSE);
});

afterEach(() => {
  vi.clearAllMocks();
  _resetSystemPromptCacheForTests();
});

// ─── Constants & data tables ────────────────────────────────────────────────

describe('Designer constants and tables', () => {
  it('provider allowlist contains gpt-image-2 (Director directive q1 2026-05-18)', () => {
    expect(EREF_DESIGNER_PROVIDER_ALLOWLIST).toContain('gpt-image-2');
  });

  it('provider allowlist is exactly one entry this sprint (Flux deferred)', () => {
    // Guards against accidental allowlist drift before E22 retro evaluation.
    expect(EREF_DESIGNER_PROVIDER_ALLOWLIST).toHaveLength(1);
  });

  it('SIZE_BY_DELIVERY_TARGET covers all 6 canonical slugs with valid dimensions', () => {
    const slugs = [
      'youtube_landscape',
      'youtube_shorts',
      'instagram_reels',
      'instagram_post',
      'tiktok',
      'print_poster',
    ];
    for (const slug of slugs) {
      const dims = SIZE_BY_DELIVERY_TARGET[slug];
      expect(dims, `no size for ${slug}`).toBeDefined();
      expect(dims!.width).toBeGreaterThan(0);
      expect(dims!.height).toBeGreaterThan(0);
    }
  });

  it('youtube_landscape maps to 1536×1024 (closes Director Stage A issue #1)', () => {
    expect(SIZE_BY_DELIVERY_TARGET.youtube_landscape).toEqual({
      width: 1536,
      height: 1024,
    });
  });
});

// ─── resolveDeliveryTargets precedence ──────────────────────────────────────

describe('resolveDeliveryTargets', () => {
  it('episode-level override wins over series default', () => {
    const result = resolveDeliveryTargets({
      episodeMetadata: { delivery_targets: ['youtube_shorts', 'instagram_reels'] },
      seriesDeliveryTargets: ['youtube_landscape'],
    });
    expect(result).toEqual(['youtube_shorts', 'instagram_reels']);
  });

  it('falls through to series default when episode has no override', () => {
    const result = resolveDeliveryTargets({
      episodeMetadata: { archival: { state: 'PARTIAL' } }, // no delivery_targets key
      seriesDeliveryTargets: ['youtube_landscape'],
    });
    expect(result).toEqual(['youtube_landscape']);
  });

  it('falls back to ["youtube_landscape"] when both layers are empty', () => {
    const result = resolveDeliveryTargets({
      episodeMetadata: {},
      seriesDeliveryTargets: [],
    });
    expect(result).toEqual(['youtube_landscape']);
  });

  it('ignores non-string entries in episode delivery_targets array', () => {
    const result = resolveDeliveryTargets({
      episodeMetadata: { delivery_targets: ['youtube_shorts', 42, null, ''] },
      seriesDeliveryTargets: null,
    });
    expect(result).toEqual(['youtube_shorts']);
  });

  it('handles null / non-object episode metadata gracefully', () => {
    const result = resolveDeliveryTargets({
      episodeMetadata: null,
      seriesDeliveryTargets: ['print_poster'],
    });
    expect(result).toEqual(['print_poster']);
  });
});

// ─── Pre-flight errors ──────────────────────────────────────────────────────

describe('runEpisodeReferenceDesigner — pre-flight errors', () => {
  it('throws when shotId is empty', async () => {
    await expect(
      runEpisodeReferenceDesigner({
        inputs: { episode_id: 'ep-1' },
        shotId: '',
      }),
    ).rejects.toThrow(EpisodeReferenceDesignerError);
  });

  it('throws when no APPROVED STB-storyboard is in upstream_assets', async () => {
    await expect(
      runEpisodeReferenceDesigner({
        inputs: {
          episode_id: 'ep-1',
          upstream_assets: [
            { ...STB_ASSET, status: 'REVIEW' }, // not APPROVED
          ],
        },
        shotId: 'SS-S99-E99-A1-SC01-SH01',
      }),
    ).rejects.toThrow(/APPROVED STB-storyboard/);
  });

  it('throws when shotId is not present in STB content', async () => {
    await expect(
      runEpisodeReferenceDesigner({
        inputs: {
          episode_id: 'ep-1',
          upstream_assets: [STB_ASSET],
        },
        shotId: 'SS-S99-E99-A1-SC99-SH99', // doesn't exist
      }),
    ).rejects.toThrow(/shotId="SS-S99-E99-A1-SC99-SH99"/);
  });

  it('throws when STB asset has no content', async () => {
    await expect(
      runEpisodeReferenceDesigner({
        inputs: {
          episode_id: 'ep-1',
          upstream_assets: [{ ...STB_ASSET, content: '' }],
        },
        shotId: 'SS-S99-E99-A1-SC01-SH01',
      }),
    ).rejects.toThrow(/APPROVED STB-storyboard/);
  });
});

// ─── Happy path + downstream contract ──────────────────────────────────────

describe('runEpisodeReferenceDesigner — happy path', () => {
  const happyInputs = () => ({
    episode_id: 'ep-1',
    episode: {
      episode_code: 'SS-S99-E99',
      title_working: 'Test Episode',
      metadata: {},
    },
    upstream_assets: [STB_ASSET],
    bible: BIBLE_MINIMAL,
  });

  it('returns runner result with body, costUsd, model, contract', async () => {
    const result = await runEpisodeReferenceDesigner({
      inputs: happyInputs(),
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });

    expect(result.contract).toBe(EREF_DESIGNER_CONTRACT);
    expect(result.model).toBe(EREF_DESIGNER_MODEL);
    expect(result.costUsd).toBeCloseTo(0.022, 4);
    expect(result.body).toBeDefined();
    expect(result.shotId).toBe('SS-S99-E99-A1-SC01-SH01');
    expect(result.storyboardAssetId).toBe('stb-asset-uuid-1');
  });

  it('resolves deliveryTargets to fallback when nothing supplied', async () => {
    const result = await runEpisodeReferenceDesigner({
      inputs: happyInputs(),
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(result.deliveryTargets).toEqual(['youtube_landscape']);
  });

  it('respects episode metadata.delivery_targets override', async () => {
    const inputs = {
      ...happyInputs(),
      episode: {
        ...happyInputs().episode,
        metadata: { delivery_targets: ['instagram_post'] },
      },
    };
    const result = await runEpisodeReferenceDesigner({
      inputs,
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(result.deliveryTargets).toEqual(['instagram_post']);
  });

  it('calls generateAnthropicText with Sonnet model + expectsJson=true', async () => {
    await runEpisodeReferenceDesigner({
      inputs: happyInputs(),
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(mockedAnthropic).toHaveBeenCalledTimes(1);
    const call = mockedAnthropic.mock.calls[0]?.[0] as {
      model?: string;
      expectsJson?: boolean;
      systemPrompt?: string;
      userMessage?: string;
    };
    expect(call.model).toBe(EREF_DESIGNER_MODEL);
    expect(call.expectsJson).toBe(true);
    expect(call.systemPrompt).toContain('Episode Reference Designer');
    expect(call.userMessage).toContain('SS-S99-E99-A1-SC01-SH01');
  });

  it('injects revisionNote into user message when supplied', async () => {
    await runEpisodeReferenceDesigner({
      inputs: happyInputs(),
      shotId: 'SS-S99-E99-A1-SC01-SH01',
      revisionNote: 'Wrong aspect — must be 16:9',
    });
    const call = mockedAnthropic.mock.calls[0]?.[0] as { userMessage?: string };
    expect(call.userMessage).toContain('HARD ACCEPTANCE CRITERIA');
    expect(call.userMessage).toContain('Wrong aspect — must be 16:9');
  });

  it('emits notes about Bible state (empty in this fixture)', async () => {
    const result = await runEpisodeReferenceDesigner({
      inputs: happyInputs(),
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(result.notes.some((n) => /Series Bible empty/.test(n))).toBe(true);
  });

  it('flags provider-out-of-allowlist in notes (sanity check for Critic)', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      ...VALID_DESIGNER_RESPONSE,
      body: {
        ...VALID_DESIGNER_RESPONSE.body,
        provider: { id: 'flux-2-pro', rationale: 'Cheaper.' }, // not on allowlist
      },
    });
    const result = await runEpisodeReferenceDesigner({
      inputs: happyInputs(),
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(result.notes.some((n) => /flux-2-pro/.test(n))).toBe(true);
    expect(result.notes.some((n) => /allowlist/.test(n))).toBe(true);
  });

  it('flags cost overrun beyond the per-Plan ceiling', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      ...VALID_DESIGNER_RESPONSE,
      costUsd: 0.42, // way above 0.15 ceiling
    });
    const result = await runEpisodeReferenceDesigner({
      inputs: happyInputs(),
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(result.notes.some((n) => /Cost overrun/.test(n))).toBe(true);
  });

  it('includes provider id + size + variants + cost in the description string', async () => {
    const result = await runEpisodeReferenceDesigner({
      inputs: happyInputs(),
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(result.description).toContain('gpt-image-2');
    expect(result.description).toContain('1536×1024');
    expect(result.description).toContain('2 variants');
    expect(result.description).toContain('est $0.060');
  });

  it('throws EpisodeReferenceDesignerError when LLM returns no JSON body', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      ...VALID_DESIGNER_RESPONSE,
      body: null,
    });
    await expect(
      runEpisodeReferenceDesigner({
        inputs: {
          episode_id: 'ep-1',
          episode: { episode_code: 'SS-S99-E99', title_working: 't', metadata: {} },
          upstream_assets: [STB_ASSET],
          bible: BIBLE_MINIMAL,
        },
        shotId: 'SS-S99-E99-A1-SC01-SH01',
      }),
    ).rejects.toThrow(/no parseable JSON block/);
  });

  it('passes delivery_targets and provider allowlist into user message', async () => {
    await runEpisodeReferenceDesigner({
      inputs: {
        ...happyInputs(),
        episode: {
          ...happyInputs().episode,
          metadata: { delivery_targets: ['youtube_landscape', 'youtube_shorts'] },
        },
      },
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    const call = mockedAnthropic.mock.calls[0]?.[0] as { userMessage?: string };
    expect(call.userMessage).toContain('youtube_landscape: 1536×1024');
    expect(call.userMessage).toContain('youtube_shorts: 1024×1792');
    expect(call.userMessage).toContain('gpt-image-2');
  });
});
