// Unit tests for the Gag Assistant Director runner (Sprint «Дизайнер и
// Аниматор» Day 11+, 2026-05-19). Mocks Anthropic; no real spend.

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
  GAGAD_CONTRACT,
  GAGAD_MODEL,
  GagAssistantDirectorError,
  runGagAssistantDirector,
  _resetGagadSystemPromptCacheForTests,
} from '@/lib/agents/runners/gag-assistant-director';

type MockedAnthropic = ReturnType<typeof vi.fn> & {
  mockResolvedValueOnce: (v: unknown) => unknown;
  mockRejectedValueOnce: (e: unknown) => unknown;
};
const mockedAnthropic = generateAnthropicText as unknown as MockedAnthropic;

const MIN_SCRIPT_ASSET = {
  id: 'scr-1',
  file_type: 'SCR-script',
  status: 'APPROVED',
  content: '# Episode script\n\nSandy enters the bar. He slips on banana.',
};

const MIN_STB_ASSET = {
  id: 'stb-1',
  file_type: 'STB-storyboard',
  status: 'APPROVED',
  content: '```json\n{"acts":[{"shots":[{"shot_id":"SH01","duration_seconds":4}]}]}\n```',
};

const MIN_BIBLE = {
  series_id: 'S99',
  general_idea: 'a sand-bodied comedy hero',
  characters: [{ slug: 'sandy', description: 'protagonist' }],
  locations: [],
  styles: [],
  total_entries: 1,
};

function mockSupabase(args: {
  planRow?: Record<string, unknown> | null;
  gagPlanRow?: Record<string, unknown> | null;
  insertReturnId?: string;
}) {
  const updateCalls: Array<Record<string, unknown>> = [];
  const insertCalls: Array<Record<string, unknown>> = [];
  return {
    from(_table: string) {
      let lastFileType: string | null = null;
      let lastStatus: string | null = null;
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (col: string, val: unknown) => {
        if (col === 'file_type' && typeof val === 'string') lastFileType = val;
        if (col === 'status' && typeof val === 'string') lastStatus = val;
        return builder;
      };
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.like = () => builder;
      builder.maybeSingle = async () => {
        if (lastFileType === 'SPC-gag_plan' && lastStatus === 'APPROVED') {
          return { data: args.gagPlanRow ?? null, error: null };
        }
        return { data: args.planRow ?? null, error: null };
      };
      builder.update = (patch: Record<string, unknown>) => {
        updateCalls.push(patch);
        const u = {
          eq: () => Promise.resolve({ data: null, error: null }),
        };
        return u;
      };
      builder.insert = (row: Record<string, unknown>) => {
        insertCalls.push(row);
        return {
          select: () => ({
            single: async () => ({
              data: { id: args.insertReturnId ?? 'inserted-1' },
              error: null,
            }),
          }),
        };
      };
      (builder as { then?: unknown }).then = (
        onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
      ) => onFulfilled({ data: [], error: null });
      return builder;
    },
    _updateCalls: updateCalls,
    _insertCalls: insertCalls,
  } as never;
}

beforeEach(() => {
  _resetGagadSystemPromptCacheForTests();
  mockedAnthropic.mockReset?.();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runGagAssistantDirector — Phase plan', () => {
  it('writes a Gag Plan with theme + shots[] from APPROVED script', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: '# Gag Plan',
      body: {
        episode_id: 'ep-1',
        plan_version: 'v01',
        theme: 'Sandy wants to take a nap in the park.',
        antagonist: 'pigeon-flock',
        escalation_pattern: 'D',
        shots: [
          { shot_id: 'SH01', act: 'setup', gag_category: 'BODY_GAGS' },
        ],
      },
      costUsd: 0.05,
      model: GAGAD_MODEL,
    });
    const r = await runGagAssistantDirector({
      phase: 'plan',
      inputs: {
        episode: { id: 'ep-1', episode_code: 'SS-S99-E01', title_working: 'Nap' },
        upstream_assets: [MIN_SCRIPT_ASSET, MIN_STB_ASSET],
        bible: MIN_BIBLE,
      } as never,
      supabase: mockSupabase({}),
    });
    expect(r.phase).toBe('plan');
    expect(r.contract).toBe(GAGAD_CONTRACT);
    expect(r.body.theme).toContain('Sandy wants');
  });

  it('throws if no APPROVED SCR-script in upstream', async () => {
    await expect(
      runGagAssistantDirector({
        phase: 'plan',
        inputs: { upstream_assets: [], bible: MIN_BIBLE } as never,
        supabase: mockSupabase({}),
      }),
    ).rejects.toThrow(/SCR-script/);
  });

  it('throws if LLM returns no JSON body', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'no JSON',
      body: null,
      costUsd: 0.01,
      model: GAGAD_MODEL,
    });
    await expect(
      runGagAssistantDirector({
        phase: 'plan',
        inputs: {
          episode: { episode_code: 'X', title_working: 'X', metadata: {} },
          upstream_assets: [MIN_SCRIPT_ASSET],
          bible: MIN_BIBLE,
        } as never,
        supabase: mockSupabase({}),
      }),
    ).rejects.toThrow(/no parseable JSON/);
  });

  it('annotates revision-iteration note when revisionNote provided', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: '# Gag Plan v2',
      body: { theme: 'Sandy needs to deliver fragile package.', shots: [] },
      costUsd: 0.04,
      model: GAGAD_MODEL,
    });
    const r = await runGagAssistantDirector({
      phase: 'plan',
      inputs: {
        episode: { episode_code: 'X', title_working: 'X' },
        upstream_assets: [MIN_SCRIPT_ASSET],
        bible: MIN_BIBLE,
      } as never,
      supabase: mockSupabase({}),
      revisionNote: 'Add more chain reactions',
    });
    expect(r.notes.some((n) => n.includes('Revision'))).toBe(true);
  });

  it('annotates MVP mode when Bible is empty', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: '# Gag Plan',
      body: { theme: 'Sandy needs something.', shots: [] },
      costUsd: 0.03,
      model: GAGAD_MODEL,
    });
    const r = await runGagAssistantDirector({
      phase: 'plan',
      inputs: {
        episode: { episode_code: 'X', title_working: 'X' },
        upstream_assets: [MIN_SCRIPT_ASSET],
        bible: {
          series_id: null,
          general_idea: null,
          characters: [],
          locations: [],
          styles: [],
          total_entries: 0,
        },
      } as never,
      supabase: mockSupabase({}),
    });
    expect(r.notes.some((n) => n.includes('MVP'))).toBe(true);
  });
});

describe('runGagAssistantDirector — Phase eref_review', () => {
  const refPlanRow = {
    id: 'plan-1',
    file_type: 'SPC-ref_plan',
    status: 'REVIEW',
    content: '```json\n{"shot_id":"SH01","provider":{"id":"gpt-image-2"}}\n```',
    metadata: {},
  };
  const gagPlanRow = {
    id: 'gp-1',
    content: '```json\n{"shots":[{"shot_id":"SH01","visual_keys":["banana"]}]}\n```',
    version: 1,
  };

  it('returns PASS verdict when all checks pass', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'PASS',
      body: {
        verdict: 'PASS',
        phase: 'eref_review',
        plan_asset_id: 'plan-1',
        shot_id: 'SH01',
        revision_count_before: 0,
        passed_checks: ['visual_keys_present'],
        failed_checks: [],
        acceptance_criteria: [],
      },
      costUsd: 0.02,
      model: GAGAD_MODEL,
    });
    const r = await runGagAssistantDirector({
      phase: 'eref_review',
      inputs: {
        episode: { id: 'ep-1', episode_code: 'SS-S99-E01' },
        episode_id: 'ep-1',
        upstream_assets: [MIN_STB_ASSET],
      } as never,
      supabase: mockSupabase({ planRow: refPlanRow, gagPlanRow }),
      planAssetId: 'plan-1',
      shotId: 'SH01',
    });
    expect(r.verdict).toBe('PASS');
    expect(r.revisionCountBefore).toBe(0);
  });

  it('returns REVISE with acceptance_criteria when missing visual_key', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'REVISE',
      body: {
        verdict: 'REVISE',
        phase: 'eref_review',
        plan_asset_id: 'plan-1',
        shot_id: 'SH01',
        revision_count_before: 0,
        passed_checks: [],
        failed_checks: [{ check: 'missing_visual_key', diagnosis: 'banana not in prompt' }],
        acceptance_criteria: ['Add banana to the prompt visible on the counter'],
      },
      costUsd: 0.025,
      model: GAGAD_MODEL,
    });
    const r = await runGagAssistantDirector({
      phase: 'eref_review',
      inputs: {
        episode: { id: 'ep-1' },
        episode_id: 'ep-1',
        upstream_assets: [MIN_STB_ASSET],
      } as never,
      supabase: mockSupabase({ planRow: refPlanRow, gagPlanRow }),
      planAssetId: 'plan-1',
      shotId: 'SH01',
    });
    expect(r.verdict).toBe('REVISE');
    expect(r.acceptanceCriteria?.[0]).toContain('banana');
  });

  it('enforces server-side cap: REVISE → HALT when count >= 2', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'REVISE',
      body: {
        verdict: 'REVISE',
        phase: 'eref_review',
        plan_asset_id: 'plan-1',
        shot_id: 'SH01',
        revision_count_before: 2,
        failed_checks: [{ check: 'still_missing', diagnosis: '...' }],
        acceptance_criteria: ['Final try note'],
      },
      costUsd: 0.02,
      model: GAGAD_MODEL,
    });
    const planAtCap = { ...refPlanRow, metadata: { gagad_revision_count: 2 } };
    const r = await runGagAssistantDirector({
      phase: 'eref_review',
      inputs: {
        episode: { id: 'ep-1' },
        episode_id: 'ep-1',
        upstream_assets: [MIN_STB_ASSET],
      } as never,
      supabase: mockSupabase({ planRow: planAtCap, gagPlanRow }),
      planAssetId: 'plan-1',
      shotId: 'SH01',
    });
    expect(r.verdict).toBe('HALT');
    expect(r.notes.some((n) => n.includes('Cap enforced'))).toBe(true);
  });

  it('soft-skips when no APPROVED SPC-gag_plan exists (race)', async () => {
    const r = await runGagAssistantDirector({
      phase: 'eref_review',
      inputs: {
        episode: { id: 'ep-1' },
        episode_id: 'ep-1',
        upstream_assets: [MIN_STB_ASSET],
      } as never,
      supabase: mockSupabase({ planRow: refPlanRow, gagPlanRow: null }),
      planAssetId: 'plan-1',
      shotId: 'SH01',
    });
    expect(r.verdict).toBe('PASS');
    expect(r.notes.some((n) => n.includes('No APPROVED SPC-gag_plan'))).toBe(true);
  });

  it('throws on wrong file_type upstream', async () => {
    await expect(
      runGagAssistantDirector({
        phase: 'eref_review',
        inputs: {
          episode: { id: 'ep-1' },
          episode_id: 'ep-1',
          upstream_assets: [MIN_STB_ASSET],
        } as never,
        supabase: mockSupabase({
          planRow: { ...refPlanRow, file_type: 'STB-storyboard' },
          gagPlanRow,
        }),
        planAssetId: 'plan-1',
        shotId: 'SH01',
      }),
    ).rejects.toThrow(/expected SPC-ref_plan/);
  });

  it('throws when planAssetId is empty', async () => {
    await expect(
      runGagAssistantDirector({
        phase: 'eref_review',
        inputs: { episode_id: 'ep-1' } as never,
        supabase: mockSupabase({}),
        planAssetId: '',
        shotId: 'SH01',
      }),
    ).rejects.toThrow(/planAssetId is required/);
  });
});

describe('runGagAssistantDirector — Phase vanim_review', () => {
  it('validates SPC-shot_plan (file_type guard differs from eref_review)', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'PASS',
      body: {
        verdict: 'PASS',
        phase: 'vanim_review',
        plan_asset_id: 'plan-2',
        shot_id: 'SH02',
        revision_count_before: 0,
        passed_checks: [],
        failed_checks: [],
        acceptance_criteria: [],
      },
      costUsd: 0.02,
      model: GAGAD_MODEL,
    });
    const shotPlanRow = {
      id: 'plan-2',
      file_type: 'SPC-shot_plan',
      status: 'REVIEW',
      content: '```json\n{"shot_id":"SH02","provider":{"id":"seedance-fast"}}\n```',
      metadata: {},
    };
    const gagPlanRow = {
      id: 'gp-1',
      content: '```json\n{"shots":[{"shot_id":"SH02","atoms":["slipped"]}]}\n```',
      version: 1,
    };
    const r = await runGagAssistantDirector({
      phase: 'vanim_review',
      inputs: {
        episode: { id: 'ep-1' },
        episode_id: 'ep-1',
        upstream_assets: [MIN_STB_ASSET],
      } as never,
      supabase: mockSupabase({ planRow: shotPlanRow, gagPlanRow }),
      planAssetId: 'plan-2',
      shotId: 'SH02',
    });
    expect(r.phase).toBe('vanim_review');
    expect(r.verdict).toBe('PASS');
  });
});

describe('error class', () => {
  it('throws GagAssistantDirectorError on precondition failure', async () => {
    try {
      await runGagAssistantDirector({
        phase: 'plan',
        inputs: { upstream_assets: [] } as never,
        supabase: mockSupabase({}),
      });
      throw new Error('should reject');
    } catch (err) {
      expect(err).toBeInstanceOf(GagAssistantDirectorError);
    }
  });
});
