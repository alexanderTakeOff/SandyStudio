// Unit tests for the Animator's Critic runner (Sprint «Дизайнер и Аниматор»
// Day 8, 2026-05-19). Mocks Anthropic; no real spend.

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

// 2026-06-06 — Bible loader is exercised by runAnimatorCritic so the Critic
// validates the Plan against Director's LOCKED standing orders in SBL-* assets.
// Mock it here so the test never touches real Supabase. Default: empty canon
// (so existing tests stay green); individual tests override per case.
vi.mock('@/lib/agents/bible-loader', () => ({
  loadSeriesBibleCanon: vi.fn(async () => ({
    series_id: null,
    general_idea: null,
    characters: [],
    locations: [],
    styles: [],
    total_entries: 0,
  })),
  formatBibleForPrompt: vi.fn(() => ''),
}));

import { generateAnthropicText } from '@/lib/agents/providers/anthropic-text';
import {
  loadSeriesBibleCanon,
  formatBibleForPrompt,
} from '@/lib/agents/bible-loader';
import {
  VPREV_CONTRACT,
  VPREV_MODEL,
  AnimatorCriticError,
  runAnimatorCritic,
  _resetVprevSystemPromptCacheForTests,
} from '@/lib/agents/runners/animator-critic';

type MockedAnthropic = ReturnType<typeof vi.fn> & {
  mockResolvedValueOnce: (v: unknown) => unknown;
  mockRejectedValueOnce: (e: unknown) => unknown;
};
const mockedAnthropic = generateAnthropicText as unknown as MockedAnthropic;

function makePlanRow(content: string, status = 'REVIEW') {
  return { id: 'plan-1', file_type: 'SPC-shot_plan', status, content };
}

function mockSupabase(planRow: Record<string, unknown> | null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    update: () => builder,
    maybeSingle: async () => ({ data: planRow, error: null }),
  };
  return { from: () => builder } as never;
}

const VALID_CONTENT = [
  '# Plan',
  '```json',
  JSON.stringify({
    shot_id: 'SS-S99-E99-A1-SC01-SH01',
    provider: { id: 'seedance-fast' },
    aspect_ratio: '16:9',
    duration_seconds: 4,
    prompt: 'SUBJECT: Sandy. ACTION: walks. CAMERA: WIDE.',
    prompt_format: 'seedance-7-slot',
    negative: ['no text', 'no logos', 'no watermarks', 'no captions'],
  }),
  '```',
].join('\n');

beforeEach(() => {
  _resetVprevSystemPromptCacheForTests();
  mockedAnthropic.mockReset?.();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runAnimatorCritic', () => {
  it('extracts PASS verdict', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'PASS',
      body: {
        verdict: 'PASS',
        passed_checks: ['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07', 'V08', 'V09'],
        failed_checks: [],
        acceptance_criteria: [],
      },
      costUsd: 0.02,
      model: VPREV_MODEL,
    });
    const r = await runAnimatorCritic({
      inputs: {} as never,
      supabase: mockSupabase(makePlanRow(VALID_CONTENT)),
      planAssetId: 'plan-1',
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(r.verdict).toBe('PASS');
    expect(r.passedChecks).toHaveLength(9);
    expect(r.contract).toBe(VPREV_CONTRACT);
  });

  it('extracts REVISE + acceptance_criteria', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'REVISE',
      body: {
        verdict: 'REVISE',
        failed_checks: [{ check: 'V04', diagnosis: 'V04 parallel actions: two independent verbs on same subject' }],
        passed_checks: ['V01', 'V02', 'V03'],
        acceptance_criteria: ['Reduce ACTION slot to ONE causal chain on one primary subject'],
      },
      costUsd: 0.02,
      model: VPREV_MODEL,
    });
    const r = await runAnimatorCritic({
      inputs: {} as never,
      supabase: mockSupabase(makePlanRow(VALID_CONTENT)),
      planAssetId: 'plan-1',
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(r.verdict).toBe('REVISE');
    expect(r.failedChecks[0]?.check).toBe('V04');
    expect(r.acceptanceCriteria[0]).toContain('ONE causal chain');
  });

  it('TD-74: directorOverrides demotes REVISE to PASS_WITH_UNCERTAINTY + warnings populated', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'PASS_WITH_UNCERTAINTY',
      body: {
        verdict: 'PASS_WITH_UNCERTAINTY',
        failed_checks: [],
        passed_checks: ['V01', 'V02', 'V03', 'V04*', 'V05', 'V06', 'V07', 'V08', 'V09'],
        warnings: [
          'V04* (Director waiver — multi-beat causal chain preserved per Director directive 2026-05-27): ACTION slot encodes four beats (tap → launch → smash → vibrate) — would have been REVISE but Director authorised.',
        ],
        acceptance_criteria: [],
      },
      costUsd: 0.018,
      model: VPREV_MODEL,
    });
    const r = await runAnimatorCritic({
      inputs: {} as never,
      supabase: mockSupabase(makePlanRow(VALID_CONTENT)),
      planAssetId: 'plan-1',
      shotId: 'SS-S99-E99-A1-SC01-SH01',
      directorOverrides: [
        {
          check: 'V04',
          rationale: 'multi-beat causal chain preserved per Director directive 2026-05-27',
        },
      ],
    });
    expect(r.verdict).toBe('PASS_WITH_UNCERTAINTY');
    expect(r.passedChecks).toContain('V04*');
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('V04*');
    expect(r.warnings[0]).toContain('Director waiver');
    // Verify the user message sent to Anthropic carries the authoritative-override block.
    const callArgs = mockedAnthropic.mock.calls[0]?.[0] as { userMessage?: string } | undefined;
    expect(callArgs?.userMessage).toContain('UPSTREAM AUTHORITATIVE OVERRIDES');
    expect(callArgs?.userMessage).toContain('"check": "V04"');
  });

  it('2026-06-06: Bible standing orders appear in Critic user message when canon is non-empty', async () => {
    // The Critic must validate against Director's LOCKED standing orders in
    // SBL-general_idea / other SBL-* assets — not only against the provider
    // compatibility contract. This regression-locks the Critic-blind-to-Bible
    // gap that let SH27 ship at 720p despite the Director's 1080p directive.
    (loadSeriesBibleCanon as unknown as MockedAnthropic).mockResolvedValueOnce({
      series_id: 'SS-S99',
      general_idea: {
        slug: '',
        file_type: 'SBL-general_idea',
        filename: 'SS-S99-BIB-general_idea-v01-LOCKED.md',
        description: '',
        content: 'Director standing orders: all shots must render at 1080p; minimum duration 3s.',
        drive_web_view_url: null,
      },
      characters: [],
      locations: [],
      styles: [],
      total_entries: 1,
    });
    (formatBibleForPrompt as unknown as MockedAnthropic).mockReturnValueOnce(
      '## Series Bible canon (LOCKED)\n\n### General idea\n\nDirector standing orders: all shots must render at 1080p; minimum duration 3s.',
    );
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'PASS',
      body: {
        verdict: 'PASS',
        passed_checks: ['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07', 'V08', 'V09'],
        failed_checks: [],
        acceptance_criteria: [],
      },
      costUsd: 0.02,
      model: VPREV_MODEL,
    });
    await runAnimatorCritic({
      inputs: { episode_id: 'ep-1' } as never,
      supabase: mockSupabase(makePlanRow(VALID_CONTENT)),
      planAssetId: 'plan-1',
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    const callArgs = mockedAnthropic.mock.calls[0]?.[0] as { userMessage?: string } | undefined;
    expect(callArgs?.userMessage).toContain('Director standing orders');
    expect(callArgs?.userMessage).toContain('1080p');
    expect(callArgs?.userMessage).toContain('Series Bible canon');
    // And the explicit instruction telling the Critic to honour LOCKED Bible orders.
    expect(callArgs?.userMessage).toContain('LOCKED Bible order');
  });

  it('2026-06-06: empty Bible → no Series Bible canon block in user message (back-compat)', async () => {
    // Default Bible-loader mock returns empty canon + empty formatted block.
    // Verify the Critic user message omits the section entirely so existing
    // episodes without a series Bible see the same prompt as before.
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'PASS',
      body: {
        verdict: 'PASS',
        passed_checks: ['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07', 'V08', 'V09'],
        failed_checks: [],
        acceptance_criteria: [],
      },
      costUsd: 0.02,
      model: VPREV_MODEL,
    });
    await runAnimatorCritic({
      inputs: { episode_id: 'ep-1' } as never,
      supabase: mockSupabase(makePlanRow(VALID_CONTENT)),
      planAssetId: 'plan-1',
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    const callArgs = mockedAnthropic.mock.calls[0]?.[0] as { userMessage?: string } | undefined;
    // The injected canon section header is precise — the Hard-rules tail mentions
    // "Series Bible canon above" in its conditional instruction (intentional, so the
    // Critic still hears the rule even when canon is empty for this run).
    expect(callArgs?.userMessage).not.toContain(
      '## Series Bible canon (LOCKED — Plan must comply',
    );
  });

  it('TD-74: no directorOverrides → user message has no authoritative-override block', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'PASS',
      body: {
        verdict: 'PASS',
        passed_checks: ['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07', 'V08', 'V09'],
        failed_checks: [],
        acceptance_criteria: [],
      },
      costUsd: 0.014,
      model: VPREV_MODEL,
    });
    await runAnimatorCritic({
      inputs: {} as never,
      supabase: mockSupabase(makePlanRow(VALID_CONTENT)),
      planAssetId: 'plan-1',
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    const callArgs = mockedAnthropic.mock.calls[0]?.[0] as { userMessage?: string } | undefined;
    expect(callArgs?.userMessage).not.toContain('UPSTREAM AUTHORITATIVE OVERRIDES');
  });

  it('extracts FAIL verdict', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'FAIL',
      body: {
        verdict: 'FAIL',
        failed_checks: [{ check: 'V08', diagnosis: 'shot_id mismatch' }],
        passed_checks: [],
        acceptance_criteria: [],
      },
      costUsd: 0.015,
      model: VPREV_MODEL,
    });
    const r = await runAnimatorCritic({
      inputs: {} as never,
      supabase: mockSupabase(makePlanRow(VALID_CONTENT)),
      planAssetId: 'plan-1',
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(r.verdict).toBe('FAIL');
  });

  it('returns UNKNOWN when no JSON body', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'no JSON',
      body: null,
      costUsd: 0.01,
      model: VPREV_MODEL,
    });
    const r = await runAnimatorCritic({
      inputs: {} as never,
      supabase: mockSupabase(makePlanRow(VALID_CONTENT)),
      planAssetId: 'plan-1',
      shotId: 'SS-S99-E99-A1-SC01-SH01',
    });
    expect(r.verdict).toBe('UNKNOWN');
  });

  it('throws when planAssetId empty', async () => {
    await expect(
      runAnimatorCritic({
        inputs: {} as never,
        supabase: mockSupabase(makePlanRow(VALID_CONTENT)),
        planAssetId: '',
        shotId: 'SH01',
      }),
    ).rejects.toThrow(/planAssetId is required/);
  });

  it('throws when shotId empty', async () => {
    await expect(
      runAnimatorCritic({
        inputs: {} as never,
        supabase: mockSupabase(makePlanRow(VALID_CONTENT)),
        planAssetId: 'plan-1',
        shotId: '',
      }),
    ).rejects.toThrow(/shotId is required/);
  });

  it('throws when Plan asset has wrong file_type', async () => {
    const row = {
      id: 'plan-1',
      file_type: 'SPC-ref_plan', // wrong — that's for EREF
      status: 'REVIEW',
      content: VALID_CONTENT,
    };
    await expect(
      runAnimatorCritic({
        inputs: {} as never,
        supabase: mockSupabase(row),
        planAssetId: 'plan-1',
        shotId: 'SH01',
      }),
    ).rejects.toThrow(/expected SPC-shot_plan/);
  });

  // TD-66 (2026-05-26): Animator writes file_type as `SPC-shot_plan-<shot_id>`
  // (e.g. `SPC-shot_plan-SS-S15-E01-A2-SC04-SH09`). Live SH09 v01 crashed the
  // Critic here on strict equality. Same widening as TD-24 applied to EREF.
  it('accepts SPC-shot_plan-<shot_id> file_type (TD-66)', async () => {
    const row = {
      id: 'plan-1',
      file_type: 'SPC-shot_plan-SS-S15-E01-A2-SC04-SH09',
      status: 'REVIEW',
      content: VALID_CONTENT,
    };
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'PASS',
      body: {
        verdict: 'PASS',
        passed_checks: ['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07', 'V08', 'V09'],
        failed_checks: [],
        acceptance_criteria: [],
      },
      costUsd: 0.02,
      model: VPREV_MODEL,
    });
    const r = await runAnimatorCritic({
      inputs: {} as never,
      supabase: mockSupabase(row),
      planAssetId: 'plan-1',
      shotId: 'SS-S15-E01-A2-SC04-SH09',
    });
    expect(r.verdict).toBe('PASS');
  });

  it('throws when content empty', async () => {
    const row = { id: 'plan-1', file_type: 'SPC-shot_plan', status: 'REVIEW', content: '' };
    await expect(
      runAnimatorCritic({
        inputs: {} as never,
        supabase: mockSupabase(row),
        planAssetId: 'plan-1',
        shotId: 'SH01',
      }),
    ).rejects.toThrow(/content is empty/);
  });

  it('is AnimatorCriticError instance', async () => {
    try {
      await runAnimatorCritic({
        inputs: {} as never,
        supabase: mockSupabase(null),
        planAssetId: 'plan-1',
        shotId: 'SH01',
      });
      throw new Error('should reject');
    } catch (err) {
      expect(err).toBeInstanceOf(AnimatorCriticError);
    }
  });

  it('annotates cost overrun', async () => {
    mockedAnthropic.mockResolvedValueOnce({
      markdown: 'PASS',
      body: { verdict: 'PASS', failed_checks: [], passed_checks: [], acceptance_criteria: [] },
      costUsd: 0.20,
      model: VPREV_MODEL,
    });
    const r = await runAnimatorCritic({
      inputs: {} as never,
      supabase: mockSupabase(makePlanRow(VALID_CONTENT)),
      planAssetId: 'plan-1',
      shotId: 'SH01',
    });
    expect(r.notes.some((n) => n.startsWith('Cost overrun'))).toBe(true);
  });
});
