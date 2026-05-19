// Tests for PA EREF tools (Sprint «Дизайнер и Аниматор» Day 4.5, 2026-05-19).
// Pure-supabase-mock — no Inngest, no HTTP fetch, no real Anthropic calls.

import { describe, it, expect } from 'vitest';

import {
  getRefPlan,
  listRefPlans,
  getCriticVerdict,
} from '@/lib/concierge/tools/eref';
import type { ToolContext } from '@/lib/concierge/tools/types';

// Thenable supabase builder mock. Each query resolves to {data, error} when
// awaited; .maybeSingle() returns immediately. The terminal payload is chosen
// by the LAST .eq('file_type', X) call observed in the chain.
function mockSupabase(opts: {
  asset?: Record<string, unknown> | null;
  assetList?: Array<Record<string, unknown>>;
  criticList?: Array<Record<string, unknown>>;
}) {
  function makeBuilder() {
    let lastFileType: string | null = null;
    const builder: Record<string, unknown> = {};
    const resolve = () => {
      if (lastFileType === 'SPC-ref_plan') {
        return { data: opts.assetList ?? [], error: null };
      }
      if (lastFileType === 'REV-ref_plan') {
        return { data: opts.criticList ?? [], error: null };
      }
      return { data: opts.assetList ?? [], error: null };
    };
    builder.select = () => builder;
    builder.eq = (col: string, val: unknown) => {
      if (col === 'file_type' && typeof val === 'string') lastFileType = val;
      return builder;
    };
    builder.order = () => builder;
    builder.maybeSingle = async () => ({ data: opts.asset ?? null, error: null });
    // Make the builder awaitable so `await q` works for list queries.
    (builder as { then?: unknown }).then = (
      onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
    ) => onFulfilled(resolve());
    return builder;
  }
  return {
    from: (_table: string) => makeBuilder(),
  } as never;
}

const ctx: ToolContext = {
  supabase: null as never,
  threadId: 't1',
  mode: 1 as never,
  episodeId: 'ep-1',
  appOrigin: 'http://localhost:3000',
};

describe('getRefPlan', () => {
  it('returns parsed JSON body alongside markdown', async () => {
    const planContent = [
      '# Plan',
      '```json',
      '{"shot_id":"SH01","provider":{"id":"gpt-image-2"}}',
      '```',
    ].join('\n');
    const sb = mockSupabase({
      asset: {
        id: 'plan-1',
        file_type: 'SPC-ref_plan',
        filename: 'SS-S99-E99-SPC-ref_plan-SH01-v01-REVIEW.md',
        status: 'REVIEW',
        version: 1,
        episode_id: 'ep-1',
        description: 'Plan',
        content: planContent,
        metadata: { shot_id: 'SH01' },
        created_at: '2026-05-19T00:00:00Z',
        updated_at: '2026-05-19T00:00:00Z',
      },
    });
    const r = await getRefPlan.execute(
      { planAssetId: 'plan-1' },
      { ...ctx, supabase: sb },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { bodyJson?: { shot_id?: string } };
      expect(data.bodyJson?.shot_id).toBe('SH01');
    }
  });

  it('fails when planAssetId not found', async () => {
    const sb = mockSupabase({ asset: null });
    const r = await getRefPlan.execute(
      { planAssetId: 'plan-missing' },
      { ...ctx, supabase: sb },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not_found');
  });

  it('fails when asset is not SPC-ref_plan', async () => {
    const sb = mockSupabase({
      asset: {
        id: 'sb-1',
        file_type: 'STB-storyboard',
        filename: 'STB.md',
        status: 'APPROVED',
        version: 1,
        episode_id: 'ep-1',
        description: 'Storyboard',
        content: '',
        metadata: null,
        created_at: '',
        updated_at: '',
      },
    });
    const r = await getRefPlan.execute(
      { planAssetId: 'sb-1' },
      { ...ctx, supabase: sb },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('wrong_type');
  });

  it('parse validates planAssetId required', () => {
    expect(() => getRefPlan.parse('{}')).toThrow(/planAssetId is required/);
    expect(() => getRefPlan.parse('not-json')).toThrow();
  });
});

describe('listRefPlans', () => {
  it('lists Plans with Critic verdict joined via metadata link', async () => {
    const sb = mockSupabase({
      assetList: [
        {
          id: 'plan-1',
          filename: 'SS-S99-E99-SPC-ref_plan-SH01-v01-REVIEW.md',
          status: 'REVIEW',
          version: 1,
          description: 'Plan SH01',
          metadata: { shot_id: 'SH01' },
          created_at: '2026-05-19T00:00:00Z',
          updated_at: '2026-05-19T00:00:00Z',
        },
        {
          id: 'plan-2',
          filename: 'SS-S99-E99-SPC-ref_plan-SH02-v01-REVISION.md',
          status: 'REVISION',
          version: 1,
          description: 'Plan SH02',
          metadata: { shot_id: 'SH02' },
          created_at: '2026-05-19T00:01:00Z',
          updated_at: '2026-05-19T00:01:00Z',
        },
      ],
      criticList: [
        {
          id: 'rev-1',
          metadata: {
            plan_asset_id: 'plan-1',
            verdict: 'PASS',
            failed_checks: [],
          },
        },
        {
          id: 'rev-2',
          metadata: {
            plan_asset_id: 'plan-2',
            verdict: 'REVISE',
            failed_checks: [{ check: 'V05', diagnosis: 'missing no-text' }],
          },
        },
      ],
    });
    const r = await listRefPlans.execute(
      { episodeId: 'ep-1' },
      { ...ctx, supabase: sb },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as {
        count: number;
        plans: Array<{ id: string; criticVerdict: string | null; criticFailedCount: number | null }>;
      };
      expect(data.count).toBe(2);
      expect(data.plans[0]?.criticVerdict).toBe('PASS');
      expect(data.plans[1]?.criticVerdict).toBe('REVISE');
      expect(data.plans[1]?.criticFailedCount).toBe(1);
    }
  });

  it('fails when no episodeId in args or context', async () => {
    const sb = mockSupabase({ assetList: [] });
    const r = await listRefPlans.execute(
      {},
      { ...ctx, supabase: sb, episodeId: null },
    );
    expect(r.ok).toBe(false);
  });
});

describe('getCriticVerdict', () => {
  it('returns the linked verdict when one exists', async () => {
    // First call (Plan lookup) returns the Plan row; second call (Critic list)
    // returns the REV rows. The mock alternates by file_type filter.
    let firstCall = true;
    const sb = {
      from: () => ({
        select: () => ({
          eq: (col: string, val: unknown) => {
            if (col === 'id') {
              return {
                maybeSingle: async () => ({
                  data: { episode_id: 'ep-1', filename: 'Plan.md' },
                  error: null,
                }),
              };
            }
            // episode_id+file_type chain
            return {
              eq: () => ({
                order: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'rev-1',
                        filename: 'REV.md',
                        status: 'REVIEW',
                        content: 'verdict narrative',
                        metadata: {
                          plan_asset_id: 'plan-1',
                          verdict: 'REVISE',
                          failed_checks: [
                            { check: 'V05', diagnosis: 'oops' },
                          ],
                          passed_checks: ['V01', 'V02'],
                          acceptance_criteria: ['fix negative list'],
                        },
                        created_at: '2026-05-19',
                      },
                    ],
                    error: null,
                  }),
              }),
            };
          },
        }),
      }),
    } as never;
    void firstCall;
    const r = await getCriticVerdict.execute(
      { planAssetId: 'plan-1' },
      { ...ctx, supabase: sb },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { verdict: string; acceptanceCriteria: string[] };
      expect(data.verdict).toBe('REVISE');
      expect(data.acceptanceCriteria).toContain('fix negative list');
    }
  });
});
