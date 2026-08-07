// Unit tests for the Creative Readability Critic runner (EXEC-CREAD, C1-Gate
// sprint 2026-06-10). Mocks the Anthropic provider AND the skill shelf so we can
// drive the HALT-without-paid-call rule deterministically — no real API key, no
// spend. Models after episode-reference-critic.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/providers/anthropic-text', () => ({
  AnthropicTextError: class AnthropicTextError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AnthropicTextError';
    }
  },
  generateAnthropicText: vi.fn(),
}));

// Skill shelf is mocked so each test controls whether a genre playbook is
// "available". getAgentSkillManifest drives the activation count;
// loadAgentSkillBodies returns matching loaded bodies. composeActivePlaybooksBlock
// returns a non-empty block when bodies exist.
vi.mock('@/lib/agents/load-skills', () => ({
  getAgentSkillManifest: vi.fn(),
  loadAgentSkillBodies: vi.fn(),
  composeSkillSelectionPrompt: vi.fn(() => 'select prompt'),
  composeActivePlaybooksBlock: vi.fn((bodies: ReadonlyArray<{ slug: string }>) =>
    bodies.length > 0
      ? `## Active Playbooks\n${bodies.map((b) => b.slug).join(', ')}`
      : '',
  ),
}));

import { generateAnthropicText } from '@/lib/providers/anthropic-text';
import {
  getAgentSkillManifest,
  loadAgentSkillBodies,
} from '@/lib/agents/load-skills';
import {
  CREAD_CONTRACT,
  CREAD_MODEL,
  runCreativeReadabilityCritic,
  _resetCreadSystemPromptCacheForTests,
} from '@/lib/agents/runners/creative-readability-critic';

type MockedFn = ReturnType<typeof vi.fn> & {
  mockResolvedValueOnce: (v: unknown) => unknown;
  mockResolvedValue: (v: unknown) => unknown;
  mockRejectedValueOnce: (e: unknown) => unknown;
};
const mockedAnthropic = generateAnthropicText as unknown as MockedFn;
const mockedManifest = getAgentSkillManifest as unknown as MockedFn;
const mockedBodies = loadAgentSkillBodies as unknown as MockedFn;

const STB_CONTENT = [
  '# Storyboard',
  '```json',
  JSON.stringify({
    storyboard_v1: {
      acts: [{ shots: [{ shot_id: 'SS-S15-E99-A1-SC01-SH01', action_prose: 'Sandy sweeps the floor.' }] }],
    },
  }),
  '```',
].join('\n');

function mockSupabaseWithStoryboard(content: string | null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    update: () => builder,
    maybeSingle: async () => ({
      data: content === null ? null : { id: 'stb-1', file_type: 'STB-storyboard', content },
      error: null,
    }),
  };
  return { from: () => builder } as never;
}

/** Helper: configure the skill shelf to report N comedy playbooks available
 *  and loaded. N=0 triggers the HALT-without-paid-call rule. */
function setPlaybooks(n: number) {
  const available = Array.from({ length: n }, (_, i) => ({
    slug: `readability-comedy-${i}`,
    bodyChars: 100,
  }));
  mockedManifest.mockResolvedValue({
    available,
    // `hard: true` slugs the selector may not decline. Empty here — these
    // fixtures exercise the selection path, not the mandatory-union path.
    mandatory: [],
    count: n,
    totalBodyChars: n * 100,
  });
  const loaded = available.map((m) => ({
    slug: m.slug,
    body: 'comedy engine body',
    frontmatter: { name: m.slug, description: 'desc' },
  }));
  mockedBodies.mockResolvedValue({
    loaded,
    totalChars: n * 100,
    truncatedCount: 0,
  });
}

const baseInputs = {
  episode_id: 'ep-1',
  series_genre: 'comedy',
  episode: { episode_code: 'SS-S15-E99', series_id: 'SS-S15' },
} as never;

beforeEach(() => {
  _resetCreadSystemPromptCacheForTests();
  mockedAnthropic.mockReset?.();
  mockedManifest.mockReset?.();
  mockedBodies.mockReset?.();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runCreativeReadabilityCritic — verdict parsing', () => {
  it('extracts PASS verdict + empty acceptance criteria', async () => {
    setPlaybooks(1);
    mockedAnthropic.mockResolvedValueOnce({
      markdown: '# Readability\nPASS',
      body: {
        verdict: 'PASS',
        storyboard_asset_id: 'stb-1',
        failed_checks: [],
        passed_checks: ['R01', 'R02', 'R03', 'R04', 'R05', 'R06'],
        acceptance_criteria: [],
      },
      costUsd: 0.02,
      model: CREAD_MODEL,
    });
    const r = await runCreativeReadabilityCritic({
      inputs: baseInputs,
      supabase: mockSupabaseWithStoryboard(STB_CONTENT),
      storyboardAssetId: 'stb-1',
    });
    expect(r.verdict).toBe('PASS');
    expect(r.passedChecks).toHaveLength(6);
    expect(r.failedChecks).toHaveLength(0);
    expect(r.acceptanceCriteria).toHaveLength(0);
    expect(r.contract).toBe(CREAD_CONTRACT);
    expect(r.activePlaybooks.length).toBeGreaterThan(0);
  });

  it('extracts REVISE verdict + acceptance_criteria for re-fire', async () => {
    setPlaybooks(1);
    mockedAnthropic.mockResolvedValueOnce({
      markdown: '# Readability\nREVISE',
      body: {
        verdict: 'REVISE',
        storyboard_asset_id: 'stb-1',
        failed_checks: [{ check: 'R02', diagnosis: 'no false-success beat before backfire' }],
        passed_checks: ['R01', 'R03'],
        acceptance_criteria: ['Insert a false-success beat between SH03 and SH04'],
      },
      costUsd: 0.018,
      model: CREAD_MODEL,
    });
    const r = await runCreativeReadabilityCritic({
      inputs: baseInputs,
      supabase: mockSupabaseWithStoryboard(STB_CONTENT),
      storyboardAssetId: 'stb-1',
    });
    expect(r.verdict).toBe('REVISE');
    expect(r.failedChecks[0]?.check).toBe('R02');
    expect(r.acceptanceCriteria).toEqual([
      'Insert a false-success beat between SH03 and SH04',
    ]);
  });

  it('extracts FAIL verdict on structural break', async () => {
    setPlaybooks(1);
    mockedAnthropic.mockResolvedValueOnce({
      markdown: '# Readability\nFAIL',
      body: {
        verdict: 'FAIL',
        storyboard_asset_id: 'stb-1',
        failed_checks: [{ check: 'R01', diagnosis: 'no parseable shot list' }],
        passed_checks: [],
        acceptance_criteria: [],
      },
      costUsd: 0.01,
      model: CREAD_MODEL,
    });
    const r = await runCreativeReadabilityCritic({
      inputs: baseInputs,
      supabase: mockSupabaseWithStoryboard(STB_CONTENT),
      storyboardAssetId: 'stb-1',
    });
    expect(r.verdict).toBe('FAIL');
  });

  it('downgrades UNKNOWN (no JSON body) — verdict UNKNOWN + note', async () => {
    setPlaybooks(1);
    mockedAnthropic.mockResolvedValueOnce({
      markdown: '# Readability — no JSON',
      body: null,
      costUsd: 0.01,
      model: CREAD_MODEL,
    });
    const r = await runCreativeReadabilityCritic({
      inputs: baseInputs,
      supabase: mockSupabaseWithStoryboard(STB_CONTENT),
      storyboardAssetId: 'stb-1',
    });
    expect(r.verdict).toBe('UNKNOWN');
    expect(r.notes.some((n) => n.includes('no parseable JSON'))).toBe(true);
  });
});

describe('runCreativeReadabilityCritic — HALT-without-paid-call rule', () => {
  it('returns HALT WITHOUT calling Anthropic when zero playbooks matched', async () => {
    setPlaybooks(0);
    const r = await runCreativeReadabilityCritic({
      inputs: baseInputs,
      supabase: mockSupabaseWithStoryboard(STB_CONTENT),
      storyboardAssetId: 'stb-1',
    });
    expect(r.verdict).toBe('HALT');
    expect(r.activePlaybooks).toHaveLength(0);
    expect(r.failedChecks[0]?.check).toBe('GENRE_ENGINE');
    // The paid model call must NOT have fired.
    expect(mockedAnthropic).not.toHaveBeenCalled();
  });

  it('returns HALT when series_genre is null (genre-resolution regression)', async () => {
    setPlaybooks(0);
    const nullGenreInputs = {
      episode_id: 'ep-1',
      series_genre: null,
      episode: { episode_code: 'SS-S15-E99', series_id: 'SS-S15' },
    } as never;
    const r = await runCreativeReadabilityCritic({
      inputs: nullGenreInputs,
      supabase: mockSupabaseWithStoryboard(STB_CONTENT),
      storyboardAssetId: 'stb-1',
    });
    expect(r.verdict).toBe('HALT');
    expect(mockedAnthropic).not.toHaveBeenCalled();
    // Diagnosis names the null genre so the Director can see the cause.
    expect(r.markdown).toContain('series_genre=null');
  });
});

describe('runCreativeReadabilityCritic — preconditions', () => {
  it('throws when the storyboard asset is not found', async () => {
    setPlaybooks(1);
    await expect(
      runCreativeReadabilityCritic({
        inputs: baseInputs,
        supabase: mockSupabaseWithStoryboard(null),
        storyboardAssetId: 'missing',
      }),
    ).rejects.toThrow(/not found/);
  });
});

// Per-shot readability phases (T1 consolidation 2026-06-10 — absorbed the
// retired EXEC-GAGAD eref_review / vanim_review). Same genre engine + HALT rule
// as the storyboard phase; the reviewed artifact is a per-shot plan, and the
// runner re-fires the producer (Designer/Animator) on REVISE.
function mockSupabaseWithPlan(planRow: Record<string, unknown> | null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: planRow, error: null }),
  };
  return { from: () => builder } as never;
}

const reviewInputs = {
  episode_id: 'ep-1',
  series_genre: 'comedy',
  episode: { episode_code: 'SS-S15-E99', series_id: 'SS-S15' },
  upstream_assets: [
    { id: 'stb-1', file_type: 'STB-storyboard', status: 'APPROVED', content: STB_CONTENT, version: 1 },
  ],
} as never;

describe('runCreativeReadabilityCritic — per-shot eref/vanim phases', () => {
  const refPlanRow = {
    id: 'plan-1',
    file_type: 'SPC-ref_plan',
    content: '```json\n{"shot_id":"SH01","provider":{"id":"gpt-image-2"}}\n```',
  };
  const shotPlanRow = {
    id: 'plan-2',
    file_type: 'SPC-shot_plan',
    content: '```json\n{"shot_id":"SH02","provider":{"id":"seedance-fast"}}\n```',
  };

  it('eref: REVISE carries acceptance_criteria, reviewedAssetId=plan, shotId', async () => {
    setPlaybooks(1);
    mockedAnthropic.mockResolvedValueOnce({
      markdown: '# Readability\nREVISE',
      body: {
        verdict: 'REVISE',
        plan_asset_id: 'plan-1',
        shot_id: 'SH01',
        failed_checks: [{ check: 'R04', diagnosis: 'banana payoff not visible in prompt' }],
        passed_checks: [],
        acceptance_criteria: ['Show the banana on the counter before the slip'],
      },
      costUsd: 0.02,
      model: CREAD_MODEL,
    });
    const r = await runCreativeReadabilityCritic({
      inputs: reviewInputs,
      supabase: mockSupabaseWithPlan(refPlanRow),
      phase: 'eref',
      planAssetId: 'plan-1',
      shotId: 'SH01',
    });
    expect(r.phase).toBe('eref');
    expect(r.verdict).toBe('REVISE');
    expect(r.reviewedAssetId).toBe('plan-1');
    expect(r.shotId).toBe('SH01');
    expect(r.acceptanceCriteria[0]).toContain('banana');
  });

  it('vanim: validates SPC-shot_plan and returns PASS', async () => {
    setPlaybooks(1);
    mockedAnthropic.mockResolvedValueOnce({
      markdown: '# Readability\nPASS',
      body: {
        verdict: 'PASS',
        plan_asset_id: 'plan-2',
        shot_id: 'SH02',
        failed_checks: [],
        passed_checks: ['R01', 'R02'],
        acceptance_criteria: [],
      },
      costUsd: 0.02,
      model: CREAD_MODEL,
    });
    const r = await runCreativeReadabilityCritic({
      inputs: reviewInputs,
      supabase: mockSupabaseWithPlan(shotPlanRow),
      phase: 'vanim',
      planAssetId: 'plan-2',
      shotId: 'SH02',
    });
    expect(r.phase).toBe('vanim');
    expect(r.verdict).toBe('PASS');
    expect(r.reviewedAssetId).toBe('plan-2');
  });

  it('eref: HALT WITHOUT paid call when zero playbooks matched', async () => {
    setPlaybooks(0);
    const r = await runCreativeReadabilityCritic({
      inputs: reviewInputs,
      supabase: mockSupabaseWithPlan(refPlanRow),
      phase: 'eref',
      planAssetId: 'plan-1',
      shotId: 'SH01',
    });
    expect(r.verdict).toBe('HALT');
    expect(r.shotId).toBe('SH01');
    expect(mockedAnthropic).not.toHaveBeenCalled();
  });

  it('eref: throws when the plan asset has the wrong file_type', async () => {
    setPlaybooks(1);
    await expect(
      runCreativeReadabilityCritic({
        inputs: reviewInputs,
        supabase: mockSupabaseWithPlan({ id: 'plan-1', file_type: 'STB-storyboard', content: 'x' }),
        phase: 'eref',
        planAssetId: 'plan-1',
        shotId: 'SH01',
      }),
    ).rejects.toThrow(/expected SPC-ref_plan/);
  });
});
