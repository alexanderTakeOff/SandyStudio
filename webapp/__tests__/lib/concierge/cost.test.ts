import { describe, it, expect } from 'vitest';

import {
  recordConciergeCost,
  isConciergeBudgetTripped,
  isFreeConciergeProvider,
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
//
// 2026-07-25: the breaker now reads through `pagedSelect`, because a bare select
// stops at PostgREST's 1000-row cap and would make the cap UNDER-count spend (and
// so never trip). The mock therefore has to model the real terminal surface —
// `.order(col, opts).range(from, to)` — and honour the range, or the paging loop
// would spin. `rows` is treated as the full result set and sliced per page.
const MOCK_PAGE = 1000;

function mockSelect(
  rows: Array<{ cost_usd: number | null; api_provider?: string | null }> | null,
  error: unknown = null,
) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    order: () => builder,
    range: (from: number, to: number) =>
      Promise.resolve(
        error || rows === null
          ? { data: null, error: error ?? { message: 'no rows' } }
          : { data: rows.slice(from, Math.min(to + 1, from + MOCK_PAGE)), error: null },
      ),
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
    // Opus 4.8 = $5/$25 per M → 1000*5/1e6 + 500*25/1e6 = 0.0175.
    // 2026-08-08: тут стояло 0.0525 по ставкам $15/$75 — цена ПРЕЖНИХ Opus-4.x.
    // Таблица цен ошибалась так же, поэтому тест её не ловил, а консервировал:
    // проверка, списанная с той же неверной константы, не защищает. Реальную
    // цену свёрили по документации Anthropic, когда D81 включил запись стоимости
    // ума в budget_log и завышение втрое пошло бы прямо в журнал.
    expect(row.cost_usd).toBeCloseTo(0.0175, 4);
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

  it('counts spend past the 1000-row page cap (2026-07-25)', async () => {
    // A long-running episode accumulates more than one page of concierge rows.
    // Before paging, the breaker saw only the first 1000 and under-counted spend
    // — the direction that lets a cap silently fail to trip. 1500 × $0.02 = $30.
    const rows = Array.from({ length: 1500 }, () => ({
      cost_usd: 0.02,
      api_provider: 'openai',
    }));
    const r = await isConciergeBudgetTripped(
      mockSelect(rows),
      { capUsd: 25, windowHours: 24, maxCalls: 100_000 },
      'ep-long',
    );
    expect(r.calls).toBe(1500);
    expect(r.spent).toBeCloseTo(30, 4);
    expect(r.tripped).toBe(true);
    expect(r.reason).toBe('cost');
  });
});

describe('isFreeConciergeProvider — free-tier exemption', () => {
  it('gemini / google are free', () => {
    expect(isFreeConciergeProvider('gemini')).toBe(true);
    expect(isFreeConciergeProvider('gemini-2.5-flash')).toBe(true);
    expect(isFreeConciergeProvider('google')).toBe(true);
    expect(isFreeConciergeProvider('GEMINI')).toBe(true);
  });
  it('paid / unknown / null are not free', () => {
    expect(isFreeConciergeProvider('anthropic')).toBe(false);
    expect(isFreeConciergeProvider('openai')).toBe(false);
    expect(isFreeConciergeProvider('mystery')).toBe(false);
    expect(isFreeConciergeProvider(null)).toBe(false);
    expect(isFreeConciergeProvider(undefined)).toBe(false);
  });
});

describe('isConciergeBudgetTripped — provider-aware count-fence (Director 07-03)', () => {
  it('free-provider (gemini) calls do NOT count toward the volume fence', async () => {
    // 42 gemini calls, tiny spend — the real 07-03 blocker. maxCalls 40 must NOT trip.
    const rows = Array.from({ length: 42 }, () => ({ cost_usd: 0.006, api_provider: 'gemini' }));
    const r = await isConciergeBudgetTripped(mockSelect(rows), {
      capUsd: 20,
      windowHours: 24,
      maxCalls: 40,
    });
    expect(r.tripped).toBe(false);
    expect(r.reason).toBeNull();
    expect(r.calls).toBe(0); // paid-call count
    expect(r.spent).toBeCloseTo(0.252, 3);
  });

  it('paid-provider calls still count toward the fence', async () => {
    const rows = Array.from({ length: 40 }, () => ({ cost_usd: 0.01, api_provider: 'anthropic' }));
    const r = await isConciergeBudgetTripped(mockSelect(rows), { capUsd: 20, windowHours: 24, maxCalls: 40 });
    expect(r.tripped).toBe(true);
    expect(r.reason).toBe('calls');
    expect(r.calls).toBe(40);
  });

  it('mixed: only paid calls count; free ones are ignored by the fence', async () => {
    const rows = [
      ...Array.from({ length: 100 }, () => ({ cost_usd: 0.006, api_provider: 'gemini' })),
      ...Array.from({ length: 3 }, () => ({ cost_usd: 0.01, api_provider: 'openai' })),
    ];
    const r = await isConciergeBudgetTripped(mockSelect(rows), { capUsd: 20, windowHours: 24, maxCalls: 3 });
    expect(r.reason).toBe('calls');
    expect(r.calls).toBe(3); // 100 gemini exempt, 3 openai trip the fence
  });

  it('free calls still bounded by the $ cost-cap', async () => {
    const rows = Array.from({ length: 5 }, () => ({ cost_usd: 5, api_provider: 'gemini' }));
    const r = await isConciergeBudgetTripped(mockSelect(rows), { capUsd: 20, windowHours: 24, maxCalls: 40 });
    expect(r.tripped).toBe(true);
    expect(r.reason).toBe('cost'); // $25 ≥ $20 even though provider is "free"
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
