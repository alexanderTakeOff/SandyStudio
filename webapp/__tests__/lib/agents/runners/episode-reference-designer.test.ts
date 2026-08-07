// Unit tests for the Episode Reference Designer runner (Sprint «Дизайнер и
// Аниматор», Day 2-3). Guards: provider allowlist, size table, delivery_targets
// precedence, STB pre-flight, system-prompt loading, anthropic call wiring,
// and surfaced warning notes (provider-out-of-allowlist, cost overrun).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Anthropic provider — runner is exercised end-to-end, but no real
// API key is used and no money is spent in test runs.
vi.mock('@/lib/providers/anthropic-text', () => ({
  AnthropicTextError: class AnthropicTextError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AnthropicTextError';
    }
  },
  generateAnthropicText: vi.fn(),
}));

import { generateAnthropicText } from '@/lib/providers/anthropic-text';
import {
  EREF_DESIGNER_CONTRACT,
  EREF_DESIGNER_MODEL,
  EREF_DESIGNER_PROVIDER_ALLOWLIST,
  SIZE_BY_DELIVERY_TARGET,
  EpisodeReferenceDesignerError,
  resolveDeliveryTargets,
  runEpisodeReferenceDesigner,
  findLatestApprovedImgByLocation,
  buildEpisodeImageFormatAuthorityBlock,
  collectSceneLightingEvidence,
  buildSceneLightAuthorityBlock,
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

  it('injects the next shot prose as narrative context when planning SH01', async () => {
    await runEpisodeReferenceDesigner({
      inputs: happyInputs(),
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    const call = mockedAnthropic.mock.calls[0]?.[0] as { userMessage?: string };
    expect(call.userMessage).toContain('Narrative context');
    expect(call.userMessage).toContain('DO NOT render');
    // SH01 is first → previous is (none), next is SH02 with its full prose.
    expect(call.userMessage).toContain('PREVIOUS: (none');
    expect(call.userMessage).toContain('Sandy leans over the counter to inspect a bottle.');
  });

  it('injects the previous shot prose as narrative context when planning SH02', async () => {
    await runEpisodeReferenceDesigner({
      inputs: happyInputs(),
      shotId: 'SS-S99-E99-A1-SC01-SH02',
    });
    const call = mockedAnthropic.mock.calls[0]?.[0] as { userMessage?: string };
    // SH02 is last → next is (none), previous is SH01 with its full prose + gag.
    expect(call.userMessage).toContain('Sandy enters the perfume shop, scanning the counters.');
    expect(call.userMessage).toContain('NEXT: (none');
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
    expect(call.userMessage).toContain('youtube_shorts: 1024×1536');
    expect(call.userMessage).toContain('gpt-image-2');
  });
});

// ─── TD-30: scene continuity anchor ─────────────────────────────────────────
//
// Helper-level test for findLatestApprovedImgByLocation + Designer-runner
// integration tests that the user message correctly carries anchor context
// for the LLM. Executor wiring (planOverrides.continuityAnchors[] →
// loadContinuityAnchor → buildMultiImageRefs with anchor refs appended)
// is covered by `episode-references-plan.test.ts` (data-side seam there).

describe('findLatestApprovedImgByLocation (TD-30)', () => {
  /** Build a chainable mock that satisfies the helper's query shape:
   *  from('assets').select(...).eq(...).eq(...).order(...).limit(...) */
  function mockSupabase(rows: Array<Record<string, unknown>>, error: unknown = null) {
    const promise = Promise.resolve({ data: rows, error });
    const limit = vi.fn(() => promise);
    const order = vi.fn(() => ({ limit }));
    const eq2 = vi.fn(() => ({ order }));
    const eq1 = vi.fn(() => ({ eq: eq2, order }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ select }));
    return { from } as unknown as Parameters<typeof findLatestApprovedImgByLocation>[0];
  }

  it('returns asset_id of the most recent APPROVED IMG-episode_ref matching location_slug', async () => {
    const sb = mockSupabase([
      {
        id: 'asset-new',
        file_type: 'IMG-episode_ref',
        status: 'APPROVED',
        metadata: { shot_reference: { location_slug: 'bedroom_main' } },
        created_at: '2026-05-21T13:00:00Z',
      },
      {
        id: 'asset-old',
        file_type: 'IMG-episode_ref',
        status: 'APPROVED',
        metadata: { shot_reference: { location_slug: 'bedroom_main' } },
        created_at: '2026-05-21T12:00:00Z',
      },
    ]);
    const found = await findLatestApprovedImgByLocation(sb, 'ep-1', 'bedroom_main');
    expect(found).toBe('asset-new');
  });

  it('returns null when no row matches the requested location_slug', async () => {
    const sb = mockSupabase([
      {
        id: 'asset-other',
        file_type: 'IMG-episode_ref',
        status: 'APPROVED',
        metadata: { shot_reference: { location_slug: 'kitchen_morning' } },
        created_at: '2026-05-21T13:00:00Z',
      },
    ]);
    const found = await findLatestApprovedImgByLocation(sb, 'ep-1', 'bedroom_main');
    expect(found).toBeNull();
  });

  it('returns null when empty location_slug or episode_id is passed', async () => {
    const sb = mockSupabase([]);
    expect(await findLatestApprovedImgByLocation(sb, '', 'bedroom_main')).toBeNull();
    expect(await findLatestApprovedImgByLocation(sb, 'ep-1', '')).toBeNull();
  });

  it('returns null when supabase returns an error', async () => {
    const sb = mockSupabase([], { message: 'db down' });
    expect(
      await findLatestApprovedImgByLocation(sb, 'ep-1', 'bedroom_main'),
    ).toBeNull();
  });

  it('filters out rows with wrong file_type even when status APPROVED matches', async () => {
    const sb = mockSupabase([
      {
        id: 'asset-stb',
        file_type: 'STB-storyboard',
        status: 'APPROVED',
        metadata: { shot_reference: { location_slug: 'bedroom_main' } },
        created_at: '2026-05-21T13:00:00Z',
      },
    ]);
    const found = await findLatestApprovedImgByLocation(sb, 'ep-1', 'bedroom_main');
    expect(found).toBeNull();
  });

  it('accepts IMG-episode_ref-<suffix> variants (TD-24 file_type shape)', async () => {
    const sb = mockSupabase([
      {
        id: 'asset-variant',
        file_type: 'IMG-episode_ref-SS-S15-E01-A1-SC01-SH02',
        status: 'APPROVED',
        metadata: { shot_reference: { location_slug: 'bedroom_main' } },
        created_at: '2026-05-21T13:00:00Z',
      },
    ]);
    const found = await findLatestApprovedImgByLocation(sb, 'ep-1', 'bedroom_main');
    expect(found).toBe('asset-variant');
  });
});

describe('runEpisodeReferenceDesigner — scene continuity context (TD-30)', () => {
  function mockSupabaseWithMatch(assetId: string | null) {
    const rows = assetId
      ? [
          {
            id: assetId,
            file_type: 'IMG-episode_ref',
            status: 'APPROVED',
            metadata: { shot_reference: { location_slug: 'bedroom_main' } },
            created_at: '2026-05-21T13:00:00Z',
          },
        ]
      : [];
    const promise = Promise.resolve({ data: rows, error: null });
    const limit = vi.fn(() => promise);
    const order = vi.fn(() => ({ limit }));
    const eq2 = vi.fn(() => ({ order }));
    const eq1 = vi.fn(() => ({ eq: eq2, order }));
    const select = vi.fn(() => ({ eq: eq1 }));
    return { from: vi.fn(() => ({ select })) };
  }

  /** Build STB content where the shot has a structured location object so the
   *  Designer picks up `location.slug` for the helper lookup. */
  const STB_WITH_LOCATION = (() => {
    const stb = [
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
                action_prose: 'Sandy enters the bedroom.',
                location: { slug: 'bedroom_main' },
                characters: [{ bible_slug: 'sandy' }],
              },
            ],
          },
        ],
      }),
      '```',
    ].join('\n');
    return {
      id: 'stb-asset-uuid-1',
      file_type: 'STB-storyboard',
      status: 'APPROVED',
      content: stb,
    };
  })();

  const inputsWithLocation = () => ({
    episode_id: 'ep-1',
    episode: {
      id: 'ep-1',
      episode_code: 'SS-S99-E99',
      title_working: 'Test Episode',
      metadata: {},
    },
    upstream_assets: [STB_WITH_LOCATION],
    bible: { series_id: null, general_idea: null, characters: [], locations: [], styles: [], total_entries: 0 },
  });

  it('mentions prior anchor asset id in the user message when supabase finds one', async () => {
    const sb = mockSupabaseWithMatch('prior-img-uuid-42');
    await runEpisodeReferenceDesigner({
      inputs: inputsWithLocation(),
      shotId: 'SS-S99-E99-A1-SC01-SH01',
      supabase: sb as unknown as Parameters<typeof runEpisodeReferenceDesigner>[0]['supabase'],
    });
    const call = mockedAnthropic.mock.calls[0]?.[0] as { userMessage?: string };
    // TD-33 rename: section header is now "Continuity anchors" (with spatial
    // + temporal subsections). Concrete anchor uuid still surfaces.
    expect(call.userMessage).toContain('Continuity anchors');
    expect(call.userMessage).toContain('Spatial anchor');
    expect(call.userMessage).toContain('prior-img-uuid-42');
    expect(call.userMessage).toContain('bedroom_main');
    expect(call.userMessage).toContain('continuity_anchors');
    expect(call.userMessage).toContain('spatial_same_location');
  });

  it('says "first shot in location" when no prior anchor exists', async () => {
    const sb = mockSupabaseWithMatch(null);
    await runEpisodeReferenceDesigner({
      inputs: inputsWithLocation(),
      shotId: 'SS-S99-E99-A1-SC01-SH01',
      supabase: sb as unknown as Parameters<typeof runEpisodeReferenceDesigner>[0]['supabase'],
    });
    const call = mockedAnthropic.mock.calls[0]?.[0] as { userMessage?: string };
    expect(call.userMessage).toContain('FIRST shot in location');
    expect(call.userMessage).toContain('bedroom_main');
  });

  it('skips lookup when supabase is omitted (replay-pilot mock path)', async () => {
    await runEpisodeReferenceDesigner({
      inputs: inputsWithLocation(),
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    const call = mockedAnthropic.mock.calls[0]?.[0] as { userMessage?: string };
    // Block still renders to keep prompt shape stable, but Designer is told
    // explicitly that NO lookup happened — so it can't claim "first shot".
    expect(call.userMessage).toContain('Continuity anchors');
    // Both spatial and temporal lookup-not-performed messages render.
    expect(call.userMessage).toContain('Spatial-continuity lookup was NOT performed');
    expect(call.userMessage).toContain('Temporal-continuity lookup was NOT performed');
    expect(call.userMessage).not.toContain('FIRST shot in location');
    // Must NOT mention any concrete anchor uuid — there is no lookup.
    expect(call.userMessage).not.toContain('prior-img-uuid');
  });
});

// ── TD-33 temporal anchor (q7a sprint, Step 2+3) ───────────────────────────
describe('runEpisodeReferenceDesigner — temporal continuity context (TD-33)', () => {
  /** Mock supabase whose .from('assets').select(...).eq(...).eq(...).order(...).limit(...)
   *  resolves to a row matching the given shot_id in metadata.shot_reference. Returns no
   *  rows when assetId is null. Mirrors mockSupabaseWithMatch in the TD-30 block. */
  function mockSupabaseForTemporal(assetId: string | null, prevShotId: string) {
    const rows = assetId
      ? [
          {
            id: assetId,
            file_type: 'IMG-episode_ref',
            status: 'APPROVED',
            metadata: { shot_reference: { shot_id: prevShotId } },
            created_at: '2026-05-22T10:00:00Z',
          },
        ]
      : [];
    const promise = Promise.resolve({ data: rows, error: null });
    const limit = vi.fn(() => promise);
    const order = vi.fn(() => ({ limit }));
    const eq2 = vi.fn(() => ({ order }));
    const eq1 = vi.fn(() => ({ eq: eq2, order }));
    const select = vi.fn(() => ({ eq: eq1 }));
    return { from: vi.fn(() => ({ select })) };
  }

  const STB_TWO_SHOTS = (() => {
    const stb = [
      '# Storyboard',
      '',
      '```json',
      JSON.stringify({
        acts: [
          {
            shots: [
              {
                shot_id: 'SS-S99-E99-A1-SC01-SH01',
                shot_role: 'establishing',
                camera_angle: 'WIDE',
                action_prose: 'Sandy enters.',
                location: { slug: 'bedroom_main' },
                characters: [{ bible_slug: 'sandy' }],
              },
              {
                shot_id: 'SS-S99-E99-A1-SC01-SH02',
                shot_role: 'reaction',
                camera_angle: 'CLOSE',
                action_prose: 'Sandy reacts.',
                location: { slug: 'bedroom_main' },
                characters: [{ bible_slug: 'sandy' }],
              },
            ],
          },
        ],
      }),
      '```',
    ].join('\n');
    return {
      id: 'stb-asset-uuid-1',
      file_type: 'STB-storyboard',
      status: 'APPROVED',
      content: stb,
    };
  })();

  const inputsWithTwoShots = () => ({
    episode_id: 'ep-1',
    episode: {
      id: 'ep-1',
      episode_code: 'SS-S99-E99',
      title_working: 'Test Episode',
      metadata: {},
    },
    upstream_assets: [STB_TWO_SHOTS],
    bible: {
      series_id: null,
      general_idea: null,
      characters: [],
      locations: [],
      styles: [],
      total_entries: 0,
    },
  });

  it('surfaces the previous shot id and its anchor when supabase finds an APPROVED reference', async () => {
    const sb = mockSupabaseForTemporal('prev-shot-img-uuid', 'SS-S99-E99-A1-SC01-SH01');
    await runEpisodeReferenceDesigner({
      inputs: inputsWithTwoShots(),
      shotId: 'SS-S99-E99-A1-SC01-SH02',
      supabase: sb as unknown as Parameters<typeof runEpisodeReferenceDesigner>[0]['supabase'],
    });
    const call = mockedAnthropic.mock.calls[0]?.[0] as { userMessage?: string };
    expect(call.userMessage).toContain('Temporal anchor');
    expect(call.userMessage).toContain('SS-S99-E99-A1-SC01-SH01');
    expect(call.userMessage).toContain('prev-shot-img-uuid');
    expect(call.userMessage).toContain('temporal_previous_shot');
    // Skip-cases guidance must surface so Designer knows when NOT to use it.
    expect(call.userMessage).toContain('cutaway');
    expect(call.userMessage).toContain('hard cut');
  });

  it('reports first shot of episode when current shot is SH01 (no predecessor)', async () => {
    const sb = mockSupabaseForTemporal('any-uuid', 'whatever');
    await runEpisodeReferenceDesigner({
      inputs: inputsWithTwoShots(),
      shotId: 'SS-S99-E99-A1-SC01-SH01',
      supabase: sb as unknown as Parameters<typeof runEpisodeReferenceDesigner>[0]['supabase'],
    });
    const call = mockedAnthropic.mock.calls[0]?.[0] as { userMessage?: string };
    expect(call.userMessage).toContain('first shot of the episode');
    expect(call.userMessage).not.toContain('Do not emit a temporal anchor.\n\nNote'); // no candidate uuid surfaces
  });

  it('reports missing approved reference when previous shot exists but has none yet', async () => {
    const sb = mockSupabaseForTemporal(null, 'SS-S99-E99-A1-SC01-SH01');
    await runEpisodeReferenceDesigner({
      inputs: inputsWithTwoShots(),
      shotId: 'SS-S99-E99-A1-SC01-SH02',
      supabase: sb as unknown as Parameters<typeof runEpisodeReferenceDesigner>[0]['supabase'],
    });
    const call = mockedAnthropic.mock.calls[0]?.[0] as { userMessage?: string };
    expect(call.userMessage).toContain('SS-S99-E99-A1-SC01-SH01');
    expect(call.userMessage).toContain('no APPROVED IMG-episode_ref yet');
  });
});

describe('getPreviousShotIdInSequence (TD-33)', () => {
  const stb = (shotIds: string[]) => {
    const content = [
      '```json',
      JSON.stringify({
        acts: [
          {
            shots: shotIds.map((id) => ({ shot_id: id, characters: [] })),
          },
        ],
      }),
      '```',
    ].join('\n');
    return content;
  };

  it('returns null for the first shot in the episode', async () => {
    const { getPreviousShotIdInSequence } = await import(
      '@/lib/agents/runners/episode-reference-designer'
    );
    expect(
      getPreviousShotIdInSequence(stb(['SH01', 'SH02', 'SH03']), 'SH01'),
    ).toBeNull();
  });

  it('returns the previous shot in narrative order', async () => {
    const { getPreviousShotIdInSequence } = await import(
      '@/lib/agents/runners/episode-reference-designer'
    );
    expect(
      getPreviousShotIdInSequence(stb(['SH01', 'SH02', 'SH03']), 'SH03'),
    ).toBe('SH02');
  });

  it('returns null when shotId not found', async () => {
    const { getPreviousShotIdInSequence } = await import(
      '@/lib/agents/runners/episode-reference-designer'
    );
    expect(
      getPreviousShotIdInSequence(stb(['SH01', 'SH02']), 'SH99'),
    ).toBeNull();
  });

  it('returns null on malformed STB content', async () => {
    const { getPreviousShotIdInSequence } = await import(
      '@/lib/agents/runners/episode-reference-designer'
    );
    expect(getPreviousShotIdInSequence('not a storyboard', 'SH01')).toBeNull();
  });
});

// ── Slice 2: episode IMAGE FORMAT authority block ───────────────────────────────
describe('buildEpisodeImageFormatAuthorityBlock', () => {
  it('returns empty string for an un-configured episode (legacy prompt byte-for-byte)', () => {
    expect(buildEpisodeImageFormatAuthorityBlock(null)).toBe('');
    expect(buildEpisodeImageFormatAuthorityBlock({})).toBe('');
  });

  it('surfaces provider as the plan-alias gpt-image-2 + quality, never size/override', () => {
    const block = buildEpisodeImageFormatAuthorityBlock({
      provider_id: 'openai-edits-multi',
      quality: 'high',
    });
    expect(block).toContain('gpt-image-2');
    expect(block).toContain('high');
    expect(block).not.toContain('openai-edits-multi'); // translated to alias
    expect(block).not.toMatch(/size/i);
    expect(block).not.toMatch(/allow_shot_overrides/i);
  });
});

// ── E33: scene light outranks the reference plate's neutral light ──────────────
describe('collectSceneLightingEvidence', () => {
  it('gathers lighting statements from sub_area, prose and continuity_notes across the whole board', () => {
    const evidence = collectSceneLightingEvidence([
      {
        shot_id: 'SH01',
        location: { slug: 'bedroom', sub_area: 'crib corner, warm lamplight pool' },
        action_prose:
          'Sandy lowers the baby into the crib. One warm pool of desk-lamp light, the rest of the bedroom in shadow.',
      },
      { shot_id: 'SH02', action_prose: 'Sandy lies flat. Both sand states STILL.' },
      {
        shot_id: 'SH03',
        action_prose: 'Sandy tips over.',
        continuity_notes: 'The desk lamp stays the only source lit in frame.',
      },
    ]);
    const joined = evidence.join('\n');
    expect(joined).toContain('SH01 (sub_area)');
    expect(joined).toContain('SH01 (action_prose)');
    expect(joined).toContain('SH03 (continuity_notes)');
    expect(joined).not.toContain('SH02'); // says nothing about light
  });

  it('does not read the costume word "dark" as a lighting statement', () => {
    expect(
      collectSceneLightingEvidence([
        { shot_id: 'SH01', action_prose: 'His dark rubber-hose limbs extend outward.' },
      ]),
    ).toEqual([]);
  });

  it('returns nothing when the storyboard is silent about light', () => {
    expect(
      collectSceneLightingEvidence([
        { shot_id: 'SH01', action_prose: 'Sandy walks to the bed and sits down.' },
      ]),
    ).toEqual([]);
  });

  // The declared contract fields are the primary source; prose is the fallback
  // for boards authored before storyboarder@v2 carried them.
  it('emits the DECLARED fields first, ahead of every prose line', () => {
    const evidence = collectSceneLightingEvidence([
      {
        shot_id: 'SH01',
        action_prose: 'One warm pool of desk-lamp light, the rest in shadow.',
      },
      {
        shot_id: 'SH02',
        time_of_day: 'NIGHT',
        lighting_condition: 'teal desk lamp at frame-right is the only key; falloff into shadow',
      },
    ]);
    expect(evidence[0]).toContain('SH02 [DECLARED time_of_day]');
    expect(evidence[1]).toContain('SH02 [DECLARED lighting_condition]');
    expect(evidence.some((l) => l.includes('SH01 (action_prose)'))).toBe(true);
  });

  it('emits a declared field even when it carries no recognised light cue word', () => {
    // The regex gate applies to PROSE only — a contract field IS the statement.
    // Bare "DAY" is deliberately absent from LIGHT_CUE_RE, so a prose-only
    // pipeline would have dropped it.
    const evidence = collectSceneLightingEvidence([{ shot_id: 'SH01', time_of_day: 'DAY' }]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toContain('[DECLARED time_of_day]');
  });
});

describe('buildSceneLightAuthorityBlock', () => {
  it('demotes the plate, names the banned phrasing, and carries the evidence', () => {
    const block = buildSceneLightAuthorityBlock(['- SH01 (action_prose): "night interior"']);
    expect(block).toContain('- SH01 (action_prose): "night interior"');
    expect(block).toMatch(/outranks every reference plate/i);
    expect(block).toContain('no dramatic shadows');
    expect(block).toContain('even lighting');
  });

  it('ranks the shot\'s DECLARED contract fields above its prose', () => {
    const block = buildSceneLightAuthorityBlock([]);
    const declaredAt = block.indexOf('DECLARED `time_of_day`');
    const proseAt = block.indexOf("THIS shot's own prose");
    expect(declaredAt).toBeGreaterThan(-1);
    expect(proseAt).toBeGreaterThan(declaredAt);
  });

  it('an empty storyboard light gets an explicit no-default instruction, never silence', () => {
    const block = buildSceneLightAuthorityBlock([]);
    expect(block).toContain('(none —');
    expect(block).toMatch(/do NOT quietly fall back to daylight/i);
    expect(block).toContain('policy_notes');
  });
});
