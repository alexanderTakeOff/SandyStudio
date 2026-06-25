import { describe, it, expect } from 'vitest';

import {
  recordConciergeCost,
  isConciergeBudgetTripped,
  conciergeAutoReactEnabled,
  CONCIERGE_AGENT_ID,
} from '@/lib/concierge/cost';

// Minimal supabase mock that captures budget_log inserts.
function mockInsertCapture() {
  const inserted: Array<Record<string, unknown>> = [];
  const client = {
    from: (_t: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserted.push(row);
        return { error: null };
      },
    }),
  } as never;
  return { client, inserted };
}

// Minimal supabase mock for the select→eq→gte read path.
function mockSelect(
  rows: Array<{ cost_usd: number | null }> | null,
  error: unknown = null,
) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    gte: () => Promise.resolve({ data: rows, error }),
  };
  return { from: () => builder } as never;
}

describe('recordConciergeCost', () => {
  it('writes a budget_log row with EXEC-CONC attribution and real opus cost', async () => {
    const { client, inserted } = mockInsertCapture();
    await recordConciergeCost(client, {
      model: 'claude-opus-4-8',
      usage: { promptTokens: 1000, completionTokens: 500 },
      source: 'auto_react',
      episodeId: 'ep-123',
    });
    expect(inserted).toHaveLength(1);
    const row = inserted[0];
    expect(row.agent_id).toBe(CONCIERGE_AGENT_ID);
    expect(row.operation).toBe('concierge_auto_react');
    expect(row.model_or_tier).toBe('claude-opus-4-8');
    expect(row.episode_id).toBe('ep-123');
    expect(row.job_id).toBeNull(); // never collides on the partial-unique index
    expect(row.tokens_used).toBe(1500);
    // opus rates $15/$75 per M → 1000*15/1e6 + 500*75/1e6 = 0.0525
    expect(row.cost_usd).toBeCloseTo(0.0525, 4);
  });

  it('skips the insert when there are no tokens to record', async () => {
    const { client, inserted } = mockInsertCapture();
    await recordConciergeCost(client, {
      model: 'claude-opus-4-8',
      usage: { promptTokens: 0, completionTokens: 0 },
      source: 'auto_react',
    });
    expect(inserted).toHaveLength(0);
  });
});

describe('isConciergeBudgetTripped — rolling-window circuit-breaker', () => {
  // maxCalls high so the COUNT limb never trips in the cost-focused cases.
  const COST = { capUsd: 20, windowHours: 24, maxCalls: 1000 };

  it('not tripped under the cap', async () => {
    const client = mockSelect([{ cost_usd: 5 }, { cost_usd: 4.5 }]);
    const r = await isConciergeBudgetTripped(client, COST);
    expect(r.tripped).toBe(false);
    expect(r.reason).toBeNull();
    expect(r.spent).toBeCloseTo(9.5, 4);
  });

  it('tripped at/over the cost cap', async () => {
    const client = mockSelect([{ cost_usd: 12 }, { cost_usd: 8 }, { cost_usd: 1 }]);
    const r = await isConciergeBudgetTripped(client, COST);
    expect(r.tripped).toBe(true);
    expect(r.reason).toBe('cost');
    expect(r.spent).toBeCloseTo(21, 4);
  });

  it('tripped on the PROVIDER-INDEPENDENT call-count limb (cost still under cap)', async () => {
    // 3 cheap rows: $0.06 total is far under $20, but 3 calls ≥ maxCalls 3.
    const client = mockSelect([{ cost_usd: 0.02 }, { cost_usd: 0.02 }, { cost_usd: 0.02 }]);
    const r = await isConciergeBudgetTripped(client, { capUsd: 20, windowHours: 24, maxCalls: 3 });
    expect(r.tripped).toBe(true);
    expect(r.reason).toBe('calls');
    expect(r.calls).toBe(3);
    expect(r.maxCalls).toBe(3);
  });

  it('fails OPEN on a read error (cap is a backstop, not a lock)', async () => {
    const client = mockSelect(null, { message: 'boom' });
    const r = await isConciergeBudgetTripped(client, { capUsd: 1, windowHours: 24, maxCalls: 1 });
    expect(r.tripped).toBe(false);
    expect(r.reason).toBeNull();
    expect(r.spent).toBe(0);
  });

  it('treats null cost rows as zero', async () => {
    const client = mockSelect([{ cost_usd: null }, { cost_usd: 3 }]);
    const r = await isConciergeBudgetTripped(client, COST);
    expect(r.spent).toBeCloseTo(3, 4);
  });
});

describe('conciergeAutoReactEnabled — master kill-switch', () => {
  it('defaults ON when unset', async () => {
    delete process.env.CONCIERGE_AUTO_REACT_ENABLED;
    expect(conciergeAutoReactEnabled()).toBe(true);
  });
  it('OFF only on explicit false', async () => {
    process.env.CONCIERGE_AUTO_REACT_ENABLED = 'false';
    expect(conciergeAutoReactEnabled()).toBe(false);
    process.env.CONCIERGE_AUTO_REACT_ENABLED = 'true';
    expect(conciergeAutoReactEnabled()).toBe(true);
    delete process.env.CONCIERGE_AUTO_REACT_ENABLED;
  });
});
