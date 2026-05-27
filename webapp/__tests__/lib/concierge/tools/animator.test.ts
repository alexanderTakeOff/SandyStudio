// Tests for PA Animator tools (Sprint «Дизайнер и Аниматор» Day 8.5, 2026-05-19).
// Pure-supabase-mock — no Inngest, no HTTP fetch.

import { describe, it, expect } from 'vitest';

import {
  getShotPlan,
  listShotPlans,
  getAnimatorCriticVerdict,
  unstickPlanForApproval,
} from '@/lib/concierge/tools/animator';
import type { ToolContext } from '@/lib/concierge/tools/types';

function mockSupabase(opts: {
  asset?: Record<string, unknown> | null;
  assetList?: Array<Record<string, unknown>>;
  criticList?: Array<Record<string, unknown>>;
}) {
  function makeBuilder() {
    let lastFileType: string | null = null;
    const builder: Record<string, unknown> = {};
    const resolve = () => {
      if (lastFileType === 'SPC-shot_plan') {
        return { data: opts.assetList ?? [], error: null };
      }
      if (lastFileType === 'REV-shot_plan') {
        return { data: opts.criticList ?? [], error: null };
      }
      return { data: opts.assetList ?? [], error: null };
    };
    builder.select = () => builder;
    builder.eq = (col: string, val: unknown) => {
      if (col === 'file_type' && typeof val === 'string') lastFileType = val;
      return builder;
    };
    // TD-75 (2026-05-27): listShotPlans + getAnimatorCriticVerdict now use
    // `.or('file_type.eq.X,file_type.like.X-%')` to match both bare and
    // suffixed file_type. Parse the first eq.X token to set lastFileType.
    builder.or = (expr: string) => {
      const m = /file_type\.eq\.([^,]+)/.exec(expr ?? '');
      if (m && m[1]) lastFileType = m[1];
      return builder;
    };
    builder.order = () => builder;
    builder.maybeSingle = async () => ({ data: opts.asset ?? null, error: null });
    (builder as { then?: unknown }).then = (
      onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
    ) => onFulfilled(resolve());
    return builder;
  }
  return { from: () => makeBuilder() } as never;
}

const ctx: ToolContext = {
  supabase: null as never,
  threadId: 't1',
  mode: 1 as never,
  episodeId: 'ep-1',
  appOrigin: 'http://localhost:3000',
};

describe('getShotPlan', () => {
  it('returns parsed JSON body', async () => {
    const planContent = [
      '# Shot Plan',
      '```json',
      '{"shot_id":"SH01","provider":{"id":"seedance-fast"}}',
      '```',
    ].join('\n');
    const sb = mockSupabase({
      asset: {
        id: 'plan-1',
        file_type: 'SPC-shot_plan',
        filename: 'SS-S99-E99-SPC-shot_plan-SH01-v01-REVIEW.md',
        status: 'REVIEW',
        version: 1,
        episode_id: 'ep-1',
        description: 'Shot Plan',
        content: planContent,
        metadata: { shot_id: 'SH01' },
        created_at: '',
        updated_at: '',
      },
    });
    const r = await getShotPlan.execute(
      { planAssetId: 'plan-1' },
      { ...ctx, supabase: sb },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const d = r.data as { bodyJson?: { provider?: { id?: string } } };
      expect(d.bodyJson?.provider?.id).toBe('seedance-fast');
    }
  });

  it('fails wrong_type when asset is SPC-ref_plan', async () => {
    const sb = mockSupabase({
      asset: {
        id: 'plan-1',
        file_type: 'SPC-ref_plan',
        filename: '',
        status: 'REVIEW',
        version: 1,
        episode_id: 'ep-1',
        description: '',
        content: '',
        metadata: null,
        created_at: '',
        updated_at: '',
      },
    });
    const r = await getShotPlan.execute(
      { planAssetId: 'plan-1' },
      { ...ctx, supabase: sb },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('wrong_type');
  });

  it('parse rejects missing planAssetId', () => {
    expect(() => getShotPlan.parse('{}')).toThrow();
  });
});

describe('listShotPlans', () => {
  it('joins Critic verdicts via metadata.plan_asset_id', async () => {
    const sb = mockSupabase({
      assetList: [
        {
          id: 'plan-1',
          filename: 'plan1.md',
          status: 'REVIEW',
          version: 1,
          description: '',
          metadata: { shot_id: 'SH01' },
          created_at: '',
          updated_at: '',
        },
      ],
      criticList: [
        {
          id: 'rev-1',
          metadata: { plan_asset_id: 'plan-1', verdict: 'PASS', failed_checks: [] },
        },
      ],
    });
    const r = await listShotPlans.execute(
      { episodeId: 'ep-1' },
      { ...ctx, supabase: sb },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const d = r.data as { plans: Array<{ criticVerdict: string | null }> };
      expect(d.plans[0]?.criticVerdict).toBe('PASS');
    }
  });

  it('fails when no episodeId', async () => {
    const sb = mockSupabase({ assetList: [] });
    const r = await listShotPlans.execute(
      {},
      { ...ctx, supabase: sb, episodeId: null },
    );
    expect(r.ok).toBe(false);
  });
});

describe('getAnimatorCriticVerdict', () => {
  it('returns linked verdict', async () => {
    const sb = {
      from: () => ({
        select: () => ({
          eq: (col: string) => {
            if (col === 'id') {
              return {
                maybeSingle: async () => ({
                  data: { episode_id: 'ep-1', filename: 'plan.md' },
                  error: null,
                }),
              };
            }
            // TD-75 (2026-05-27): getAnimatorCriticVerdict now does
            //   .eq('episode_id', ...).or('file_type.eq.X,file_type.like.X-%').order(...)
            // — the inline mock's second-level chain must provide `.or()`
            // returning the same shape `.eq()` used to.
            const finalRows = {
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: 'rev-1',
                      filename: 'REV.md',
                      status: 'REVIEW',
                      content: 'narrative',
                      metadata: {
                        plan_asset_id: 'plan-1',
                        verdict: 'REVISE',
                        failed_checks: [{ check: 'V04', diagnosis: 'multi-action' }],
                        passed_checks: ['V01'],
                        acceptance_criteria: ['use one verb'],
                      },
                      created_at: '',
                    },
                  ],
                  error: null,
                }),
            };
            return {
              eq: () => finalRows,
              or: () => finalRows,
            };
          },
        }),
      }),
    } as never;
    const r = await getAnimatorCriticVerdict.execute(
      { planAssetId: 'plan-1' },
      { ...ctx, supabase: sb },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const d = r.data as { verdict: string; acceptanceCriteria: string[] };
      expect(d.verdict).toBe('REVISE');
      expect(d.acceptanceCriteria).toContain('use one verb');
    }
  });
});

// TD-76 (2026-05-27) — unstickPlanForApproval state-machine recovery.

function mockUnstickSupabase(opts: {
  plan: { id: string; filename?: string; file_type?: string; status: string; episode_id?: string | null; version?: number } | null;
  criticRows?: Array<{ id: string; filename?: string; metadata: Record<string, unknown> | null; content?: string | null; created_at?: string }>;
  updateError?: { message: string } | null;
  captureUpdate?: { lastStatus?: string; lastWhereId?: string };
}) {
  return {
    from: (table: string) => {
      if (table !== 'assets') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (col: string, val: unknown) => {
            if (col === 'id') {
              return {
                maybeSingle: async () => ({ data: opts.plan, error: null }),
              };
            }
            // episode_id branch — returns the .or().order() chain for criticRows.
            const result = { data: opts.criticRows ?? [], error: null };
            return {
              or: () => ({
                order: () => Promise.resolve(result),
              }),
            };
          },
        }),
        update: (patch: { status?: string }) => ({
          eq: (_col: string, val: unknown) => {
            if (opts.captureUpdate) {
              opts.captureUpdate.lastStatus = patch.status;
              opts.captureUpdate.lastWhereId = String(val);
            }
            return Promise.resolve({ error: opts.updateError ?? null });
          },
        }),
      };
    },
  } as never;
}

const APPROVAL_TURNS = [
  {
    id: 't-approval',
    thread_id: 'th',
    role: 'director' as const,
    event_type: 'message' as const,
    content: 'давай',
    metadata: {},
    token_count: null,
    created_at: new Date().toISOString(),
  },
];

describe('unstickPlanForApproval (TD-76)', () => {
  it('flips REVISION → REVIEW when Critic verdict is PASS_WITH_UNCERTAINTY', async () => {
    const capture: { lastStatus?: string; lastWhereId?: string } = {};
    const sb = mockUnstickSupabase({
      plan: {
        id: 'plan-1',
        filename: 'Plan.md',
        file_type: 'SPC-shot_plan-shot-1',
        status: 'REVISION',
        episode_id: 'ep-1',
        version: 7,
      },
      criticRows: [
        {
          id: 'rev-1',
          filename: 'REV.md',
          metadata: {
            plan_asset_id: 'plan-1',
            verdict: 'PASS_WITH_UNCERTAINTY',
          },
        },
      ],
      captureUpdate: capture,
    });
    const r = await unstickPlanForApproval.execute(
      { planAssetId: 'plan-1' },
      { ...ctx, supabase: sb, recentTurns: APPROVAL_TURNS },
    );
    expect(r.ok).toBe(true);
    expect(capture.lastStatus).toBe('REVIEW');
    expect(capture.lastWhereId).toBe('plan-1');
  });

  it('refuses to unstick when Critic verdict is REVISE', async () => {
    const sb = mockUnstickSupabase({
      plan: {
        id: 'plan-2',
        file_type: 'SPC-shot_plan-shot-2',
        status: 'REVISION',
        episode_id: 'ep-1',
        version: 3,
      },
      criticRows: [
        {
          id: 'rev-2',
          metadata: { plan_asset_id: 'plan-2', verdict: 'REVISE' },
        },
      ],
    });
    const r = await unstickPlanForApproval.execute(
      { planAssetId: 'plan-2' },
      { ...ctx, supabase: sb, recentTurns: APPROVAL_TURNS },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('verdict_blocks');
    }
  });

  it('idempotent on REVIEW — no-op success', async () => {
    const capture: { lastStatus?: string } = {};
    const sb = mockUnstickSupabase({
      plan: {
        id: 'plan-3',
        file_type: 'SPC-shot_plan-shot-3',
        status: 'REVIEW',
        episode_id: 'ep-1',
        version: 4,
      },
      captureUpdate: capture,
    });
    const r = await unstickPlanForApproval.execute(
      { planAssetId: 'plan-3' },
      { ...ctx, supabase: sb, recentTurns: APPROVAL_TURNS },
    );
    expect(r.ok).toBe(true);
    expect(capture.lastStatus).toBeUndefined();
  });

  it('falls back to parsing verdict from Critic markdown when metadata is null', async () => {
    const capture: { lastStatus?: string } = {};
    const criticMarkdown = [
      '# Verdict',
      '```json',
      JSON.stringify({ verdict: 'PASS_WITH_UNCERTAINTY' }),
      '```',
    ].join('\n');
    const sb = mockUnstickSupabase({
      plan: {
        id: 'plan-4',
        file_type: 'SPC-shot_plan-shot-4',
        status: 'REVISION',
        episode_id: 'ep-1',
        version: 5,
      },
      criticRows: [
        {
          id: 'rev-4',
          metadata: { plan_asset_id: 'plan-4' },
          content: criticMarkdown,
        },
      ],
      captureUpdate: capture,
    });
    const r = await unstickPlanForApproval.execute(
      { planAssetId: 'plan-4' },
      { ...ctx, supabase: sb, recentTurns: APPROVAL_TURNS },
    );
    expect(r.ok).toBe(true);
    expect(capture.lastStatus).toBe('REVIEW');
  });

  it('refuses when no Critic verdict found', async () => {
    const sb = mockUnstickSupabase({
      plan: {
        id: 'plan-5',
        file_type: 'SPC-shot_plan-shot-5',
        status: 'REVISION',
        episode_id: 'ep-1',
        version: 1,
      },
      criticRows: [],
    });
    const r = await unstickPlanForApproval.execute(
      { planAssetId: 'plan-5' },
      { ...ctx, supabase: sb, recentTurns: APPROVAL_TURNS },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('no_verdict');
  });
});
