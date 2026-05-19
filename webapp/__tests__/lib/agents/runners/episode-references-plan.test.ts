// ──────────────────────────────────────────────────────────────────────────────
// Tests for the Plan-driven branch of EXEC-EREF (Sprint «Дизайнер и Аниматор»
// Day 3.2, 2026-05-18). Exercises the pure-function size mapper and the
// Plan-loader's validation paths against a lightweight Supabase mock — no
// real OpenAI calls, no money spent.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import {
  EpisodeReferencesError,
  loadPlanOverrides,
  planSizeToProviderSize,
} from '@/lib/agents/runners/episode-references';

// ── Minimal Supabase mock — supports the chain
//    .from('assets').select(...).eq('id', X).maybeSingle()
// which is the only path loadPlanOverrides uses. Returns whatever row is
// configured in the constructor.
function mockSupabaseWithAsset(row: Record<string, unknown> | null) {
  const builder = {
    select: (_cols: string) => builder,
    eq: (_col: string, _val: unknown) => builder,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return {
    from: (_table: string) => builder,
  } as never;
}

function mockSupabaseWithError(message: string) {
  const builder = {
    select: (_cols: string) => builder,
    eq: (_col: string, _val: unknown) => builder,
    maybeSingle: async () => ({ data: null, error: { message } }),
  };
  return {
    from: (_table: string) => builder,
  } as never;
}

// A Plan markdown body with a valid JSON code block. Mirrors what the
// Designer runner emits (agents/exec/episode_reference_designer.md).
function planContent(overrides: Record<string, unknown> = {}): string {
  const body = {
    shot_id: 'SS-S99-E99-A1-SC01-SH01',
    plan_version: 'v01',
    delivery_targets: ['youtube_landscape'],
    provider: { id: 'gpt-image-2', rationale: 'allowlist' },
    size: {
      width: 1536,
      height: 1024,
      rationale: 'youtube_landscape',
    },
    variants: { count: 1, rationale: 'pilot' },
    continuity_strategy: {
      mode: 'openai-edits-multi',
      anchor_assets: ['sandy'],
      rationale: 'multi-character anchor',
    },
    prompt: 'WIDE shot of Sandy in the bar, neon lighting, 16:9.',
    negative: ['no text', 'no logos'],
    camera_intent: {
      angle: 'WIDE',
      sub_area_variation: 'establishing',
    },
    estimated_cost_usd: 0.08,
    policy_notes: [],
    ...overrides,
  };
  return [
    '# Reference Plan — SS-S99-E99-A1-SC01-SH01 · v01',
    '',
    '## Цель шота',
    'Establishing bar interior.',
    '',
    '```json',
    JSON.stringify(body, null, 2),
    '```',
  ].join('\n');
}

describe('planSizeToProviderSize', () => {
  it('maps youtube_landscape (1536×1024) 1:1', () => {
    expect(planSizeToProviderSize({ width: 1536, height: 1024 })).toBe(
      '1536x1024',
    );
  });

  it('maps square (1024×1024) 1:1', () => {
    expect(planSizeToProviderSize({ width: 1024, height: 1024 })).toBe(
      '1024x1024',
    );
  });

  it('maps portrait 1024×1536 1:1', () => {
    expect(planSizeToProviderSize({ width: 1024, height: 1536 })).toBe(
      '1024x1536',
    );
  });

  it('clamps unsupported portrait (1024×1792) to 1024x1536', () => {
    expect(planSizeToProviderSize({ width: 1024, height: 1792 })).toBe(
      '1024x1536',
    );
  });

  it('clamps unsupported landscape (2048×1536) to 1536x1024', () => {
    expect(planSizeToProviderSize({ width: 2048, height: 1536 })).toBe(
      '1536x1024',
    );
  });

  it('falls back to square for equal width=height non-standard', () => {
    expect(planSizeToProviderSize({ width: 999, height: 999 })).toBe(
      '1024x1024',
    );
  });
});

describe('loadPlanOverrides — happy path', () => {
  it('extracts provider, size, variants, prompt, negative, continuity from a valid Plan', async () => {
    const row = {
      id: 'plan-1',
      file_type: 'SPC-ref_plan',
      status: 'APPROVED',
      content: planContent(),
    };
    const overrides = await loadPlanOverrides(
      mockSupabaseWithAsset(row),
      'plan-1',
      'SS-S99-E99-A1-SC01-SH01',
    );
    expect(overrides.shotId).toBe('SS-S99-E99-A1-SC01-SH01');
    expect(overrides.planAssetId).toBe('plan-1');
    expect(overrides.providerId).toBe('gpt-image-2');
    expect(overrides.size).toEqual({ width: 1536, height: 1024 });
    expect(overrides.variantsCount).toBe(1);
    expect(overrides.prompt).toContain('WIDE shot of Sandy');
    expect(overrides.negative).toEqual(['no text', 'no logos']);
    expect(overrides.continuityMode).toBe('openai-edits-multi');
    expect(overrides.policyNotes).toEqual([]);
  });

  it('floors variants.count to integer ≥ 1', async () => {
    const row = {
      id: 'plan-1',
      file_type: 'SPC-ref_plan',
      status: 'APPROVED',
      content: planContent({ variants: { count: 3.7, rationale: 'fanout' } }),
    };
    const overrides = await loadPlanOverrides(
      mockSupabaseWithAsset(row),
      'plan-1',
      'SS-S99-E99-A1-SC01-SH01',
    );
    expect(overrides.variantsCount).toBe(3);
  });

  it('defaults continuityMode when continuity_strategy absent', async () => {
    const row = {
      id: 'plan-1',
      file_type: 'SPC-ref_plan',
      status: 'APPROVED',
      content: planContent({ continuity_strategy: undefined }),
    };
    const overrides = await loadPlanOverrides(
      mockSupabaseWithAsset(row),
      'plan-1',
      'SS-S99-E99-A1-SC01-SH01',
    );
    expect(overrides.continuityMode).toBe('openai-edits-multi');
  });
});

describe('loadPlanOverrides — rejection paths', () => {
  it('throws when supabase returns an error', async () => {
    await expect(
      loadPlanOverrides(
        mockSupabaseWithError('connection refused'),
        'plan-1',
        'SS-S99-E99-A1-SC01-SH01',
      ),
    ).rejects.toThrow(/Plan asset fetch failed/);
  });

  it('throws when the asset row does not exist', async () => {
    await expect(
      loadPlanOverrides(
        mockSupabaseWithAsset(null),
        'plan-1',
        'SS-S99-E99-A1-SC01-SH01',
      ),
    ).rejects.toThrow(/not found/);
  });

  it('throws when file_type is not SPC-ref_plan', async () => {
    const row = {
      id: 'plan-1',
      file_type: 'STB-storyboard',
      status: 'APPROVED',
      content: planContent(),
    };
    await expect(
      loadPlanOverrides(
        mockSupabaseWithAsset(row),
        'plan-1',
        'SS-S99-E99-A1-SC01-SH01',
      ),
    ).rejects.toThrow(/expected "SPC-ref_plan"/);
  });

  it('throws when status is not APPROVED', async () => {
    const row = {
      id: 'plan-1',
      file_type: 'SPC-ref_plan',
      status: 'REVIEW',
      content: planContent(),
    };
    await expect(
      loadPlanOverrides(
        mockSupabaseWithAsset(row),
        'plan-1',
        'SS-S99-E99-A1-SC01-SH01',
      ),
    ).rejects.toThrow(/expected APPROVED/);
  });

  it('throws when content has no parseable JSON block', async () => {
    const row = {
      id: 'plan-1',
      file_type: 'SPC-ref_plan',
      status: 'APPROVED',
      content: '# Plan\n\nNo JSON here.',
    };
    await expect(
      loadPlanOverrides(
        mockSupabaseWithAsset(row),
        'plan-1',
        'SS-S99-E99-A1-SC01-SH01',
      ),
    ).rejects.toThrow(/no parseable JSON/);
  });

  it('throws when shot_id mismatches event payload', async () => {
    const row = {
      id: 'plan-1',
      file_type: 'SPC-ref_plan',
      status: 'APPROVED',
      content: planContent({ shot_id: 'DIFFERENT-SHOT' }),
    };
    await expect(
      loadPlanOverrides(
        mockSupabaseWithAsset(row),
        'plan-1',
        'SS-S99-E99-A1-SC01-SH01',
      ),
    ).rejects.toThrow(/does not match event shotId/);
  });

  it('throws when provider.id is missing', async () => {
    const row = {
      id: 'plan-1',
      file_type: 'SPC-ref_plan',
      status: 'APPROVED',
      content: planContent({ provider: { rationale: 'oops' } }),
    };
    await expect(
      loadPlanOverrides(
        mockSupabaseWithAsset(row),
        'plan-1',
        'SS-S99-E99-A1-SC01-SH01',
      ),
    ).rejects.toThrow(/missing provider.id/);
  });

  it('throws when size.width / size.height missing', async () => {
    const row = {
      id: 'plan-1',
      file_type: 'SPC-ref_plan',
      status: 'APPROVED',
      content: planContent({ size: { width: 1536, rationale: 'x' } }),
    };
    await expect(
      loadPlanOverrides(
        mockSupabaseWithAsset(row),
        'plan-1',
        'SS-S99-E99-A1-SC01-SH01',
      ),
    ).rejects.toThrow(/size.width \/ size.height missing/);
  });

  it('throws when prompt is missing or empty', async () => {
    const row = {
      id: 'plan-1',
      file_type: 'SPC-ref_plan',
      status: 'APPROVED',
      content: planContent({ prompt: '' }),
    };
    await expect(
      loadPlanOverrides(
        mockSupabaseWithAsset(row),
        'plan-1',
        'SS-S99-E99-A1-SC01-SH01',
      ),
    ).rejects.toThrow(/missing prompt/);
  });
});

describe('loadPlanOverrides — error class', () => {
  it('all rejections are EpisodeReferencesError instances', async () => {
    try {
      await loadPlanOverrides(
        mockSupabaseWithAsset(null),
        'plan-1',
        'SS-S99-E99-A1-SC01-SH01',
      );
      throw new Error('should have rejected');
    } catch (err) {
      expect(err).toBeInstanceOf(EpisodeReferencesError);
    }
  });
});
