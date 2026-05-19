// Unit tests for the Designer's Critic runner (Sprint «Дизайнер и Аниматор»
// Day 4, 2026-05-19). Mocks Anthropic provider — no real API key, no spend.

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
  EPREV_CONTRACT,
  EPREV_MODEL,
  EpisodeReferenceCriticError,
  runEpisodeReferenceCritic,
  _resetCriticSystemPromptCacheForTests,
} from '@/lib/agents/runners/episode-reference-critic';

type MockedAnthropic = ReturnType<typeof vi.fn> & {
  mockResolvedValueOnce: (v: unknown) => unknown;
  mockRejectedValueOnce: (e: unknown) => unknown;
};
const mockedAnthropic = generateAnthropicText as unknown as MockedAnthropic;

function makePlanRow(content: string, status = 'REVIEW') {
  return {
    id: 'plan-1',
    file_type: 'SPC-ref_plan',
    status,
    content,
  };
}

function mockSupabase(planRow: Record<string, unknown> | null, updateOk = true) {
  const updateCalls: Array<{ id: unknown; status: unknown }> = [];
  const builder = {
    select: (_cols: string) => builder,
    eq: (col: string, val: unknown) => {
      if (col === 'id' && builder._updatingTo !== null) {
        updateCalls.push({ id: val, status: builder._updatingTo });
        builder._updatingTo = null;
      }
      return builder;
    },
    update: (patch: Record<string, unknown>) => {
      builder._updatingTo = patch.status ?? null;
      return builder;
    },
    maybeSingle: async () => ({ data: planRow, error: null }),
    _updatingTo: null as unknown,
  };
  const sb = {
    from: (_table: string) => builder,
    _updateCalls: updateCalls,
    _updateOk: updateOk,
  };
  return sb as never;
}

const VALID_PLAN_CONTENT = [
  '# Plan',
  '```json',
  JSON.stringify({
    shot_id: 'SS-S99-E99-A1-SC01-SH01',
    provider: { id: 'gpt-image-2', rationale: 'allowlist' },
    size: { width: 1536, height: 1024, rationale: 'youtube' },
    variants: { count: 1, rationale: 'pilot' },
    prompt: 'WIDE shot, sandy in bar.',
    negative: ['no text', 'no logos'],
    continuity_strategy: { mode: 'openai-edits-multi', anchor_assets: ['sandy'] },
  }),
  '```',
].join('\n');

beforeEach(() => {
  _resetCriticSystemPromptCacheForTests();
  mockedAnthropic.mockReset?.();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runEpisodeReferenceCritic', () => {
  it('extracts PASS verdict + acceptance criteria empty', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: '# Critic Verdict\nPASS',
      body: {
        verdict: 'PASS',
        plan_asset_id: 'plan-1',
        shot_id: 'SS-S99-E99-A1-SC01-SH01',
        failed_checks: [],
        passed_checks: ['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07', 'V08', 'V09'],
        acceptance_criteria: [],
        estimated_cost_usd: 0.02,
      },
      costUsd: 0.02,
      model: EPREV_MODEL,
    });
    const r = await runEpisodeReferenceCritic({
      inputs: {} as never,
      supabase: mockSupabase(makePlanRow(VALID_PLAN_CONTENT)),
      planAssetId: 'plan-1',
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(r.verdict).toBe('PASS');
    expect(r.passedChecks).toHaveLength(9);
    expect(r.failedChecks).toHaveLength(0);
    expect(r.acceptanceCriteria).toHaveLength(0);
    expect(r.contract).toBe(EPREV_CONTRACT);
  });

  it('extracts REVISE verdict + acceptance_criteria for re-fire', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: '# Critic Verdict\nREVISE',
      body: {
        verdict: 'REVISE',
        plan_asset_id: 'plan-1',
        shot_id: 'SS-S99-E99-A1-SC01-SH01',
        failed_checks: [
          { check: 'V05', diagnosis: 'negative missing "no text"' },
        ],
        passed_checks: ['V01', 'V02', 'V03', 'V04', 'V06', 'V07', 'V08'],
        acceptance_criteria: [
          'Add "no text" to negative[]',
          'Add "no logos" to negative[]',
        ],
      },
      costUsd: 0.018,
      model: EPREV_MODEL,
    });
    const r = await runEpisodeReferenceCritic({
      inputs: {} as never,
      supabase: mockSupabase(makePlanRow(VALID_PLAN_CONTENT)),
      planAssetId: 'plan-1',
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(r.verdict).toBe('REVISE');
    expect(r.failedChecks).toHaveLength(1);
    expect(r.failedChecks[0]?.check).toBe('V05');
    expect(r.acceptanceCriteria).toEqual([
      'Add "no text" to negative[]',
      'Add "no logos" to negative[]',
    ]);
  });

  it('extracts FAIL verdict on structural break', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: '# Critic Verdict\nFAIL',
      body: {
        verdict: 'FAIL',
        plan_asset_id: 'plan-1',
        shot_id: 'SS-S99-E99-A1-SC01-SH01',
        failed_checks: [
          { check: 'V08', diagnosis: 'shot_id mismatch — Designer wrote wrong shot' },
        ],
        passed_checks: [],
        acceptance_criteria: [],
      },
      costUsd: 0.015,
      model: EPREV_MODEL,
    });
    const r = await runEpisodeReferenceCritic({
      inputs: {} as never,
      supabase: mockSupabase(makePlanRow(VALID_PLAN_CONTENT)),
      planAssetId: 'plan-1',
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(r.verdict).toBe('FAIL');
  });

  it('returns UNKNOWN verdict when Critic emits no JSON body', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: '# Critic Verdict — no JSON',
      body: null,
      costUsd: 0.01,
      model: EPREV_MODEL,
    });
    const r = await runEpisodeReferenceCritic({
      inputs: {} as never,
      supabase: mockSupabase(makePlanRow(VALID_PLAN_CONTENT)),
      planAssetId: 'plan-1',
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(r.verdict).toBe('UNKNOWN');
    expect(r.notes.some((n) => n.includes('no parseable JSON'))).toBe(true);
  });

  it('throws when planAssetId is empty', async () => {
    await expect(
      runEpisodeReferenceCritic({
        inputs: {} as never,
        supabase: mockSupabase(makePlanRow(VALID_PLAN_CONTENT)),
        planAssetId: '',
        shotId: 'SS-S99-E99-A1-SC01-SH01',
      }),
    ).rejects.toThrow(/planAssetId is required/);
  });

  it('throws when shotId is empty', async () => {
    await expect(
      runEpisodeReferenceCritic({
        inputs: {} as never,
        supabase: mockSupabase(makePlanRow(VALID_PLAN_CONTENT)),
        planAssetId: 'plan-1',
        shotId: '',
      }),
    ).rejects.toThrow(/shotId is required/);
  });

  it('throws when Plan asset is not SPC-ref_plan', async () => {
    const row = { id: 'plan-1', file_type: 'STB-storyboard', status: 'REVIEW', content: VALID_PLAN_CONTENT };
    await expect(
      runEpisodeReferenceCritic({
        inputs: {} as never,
        supabase: mockSupabase(row),
        planAssetId: 'plan-1',
        shotId: 'SS-S99-E99-A1-SC01-SH01',
      }),
    ).rejects.toThrow(/expected SPC-ref_plan/);
  });

  it('throws when Plan content is empty', async () => {
    const row = { id: 'plan-1', file_type: 'SPC-ref_plan', status: 'REVIEW', content: '' };
    await expect(
      runEpisodeReferenceCritic({
        inputs: {} as never,
        supabase: mockSupabase(row),
        planAssetId: 'plan-1',
        shotId: 'SS-S99-E99-A1-SC01-SH01',
      }),
    ).rejects.toThrow(/content is empty/);
  });

  it('throws EpisodeReferenceCriticError instance on rejection', async () => {
    try {
      await runEpisodeReferenceCritic({
        inputs: {} as never,
        supabase: mockSupabase(null),
        planAssetId: 'plan-1',
        shotId: 'SS-S99-E99-A1-SC01-SH01',
      });
      throw new Error('should have rejected');
    } catch (err) {
      expect(err).toBeInstanceOf(EpisodeReferenceCriticError);
    }
  });

  it('annotates note when cost exceeds ceiling', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'PASS',
      body: { verdict: 'PASS', failed_checks: [], passed_checks: [], acceptance_criteria: [] },
      costUsd: 0.20, // > EPREV_COST_CEILING_USD (0.08)
      model: EPREV_MODEL,
    });
    const r = await runEpisodeReferenceCritic({
      inputs: {} as never,
      supabase: mockSupabase(makePlanRow(VALID_PLAN_CONTENT)),
      planAssetId: 'plan-1',
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(r.notes.some((n) => n.startsWith('Cost overrun'))).toBe(true);
  });
});
