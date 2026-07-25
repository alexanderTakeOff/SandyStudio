// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/budget-summary.test.ts
// Money math for the Budget tab. Every case here is a way the previous version
// LOST money on screen — the point of the suite is that no dollar recorded in
// budget_log can fail to appear somewhere in the payload.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import {
  aggregateBudget,
  BURN_RATE_WINDOW,
  type BudgetEpisodeInput,
  type BudgetLogInput,
} from '@/lib/budget-summary';

function ep(over: Partial<BudgetEpisodeInput> & { id: string }): BudgetEpisodeInput {
  return {
    episode_code: `S01E${over.id.slice(-2)}`,
    status: 'IN_PRODUCTION',
    budget_ceiling: 150,
    budget_spent: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function log(over: Partial<BudgetLogInput>): BudgetLogInput {
  return {
    episode_id: 'e1',
    agent_id: 'EXEC-VGEN',
    api_provider: 'fal_ai',
    model_or_tier: 'seedance',
    operation: 'video_generation',
    cost_usd: 1,
    tokens_used: null,
    created_at: '2026-01-02T00:00:00Z',
    ...over,
  };
}

describe('aggregateBudget — nothing recorded may go missing', () => {
  it('uses the itemized ledger, not the reservation ledger, as the episode total', () => {
    // budget_spent deliberately excludes Polina, so it is NOT the total.
    const out = aggregateBudget(
      [ep({ id: 'e1', budget_spent: 10 })],
      [
        log({ cost_usd: 10 }),
        log({ agent_id: 'EXEC-CONC', api_provider: 'openai', cost_usd: 5 }),
      ],
    );
    const e = out.byEpisode[0]!;
    expect(e.itemized).toBe(15);
    expect(e.reserved).toBe(10);
    expect(e.total).toBe(15);
    expect(e.drift).toBe(5);
    expect(e.reservationOnly).toBe(false);
  });

  it('falls back to the reservation when an episode has no itemized rows, and flags it', () => {
    const out = aggregateBudget([ep({ id: 'e1', budget_spent: 42 })], []);
    const e = out.byEpisode[0]!;
    expect(e.total).toBe(42);
    expect(e.reservationOnly).toBe(true);
    expect(out.gaps.reservationOnlyEpisodes).toEqual([e.episode_code]);
    // Money known but not itemized must NOT read as $0.
    expect(out.totalSpent).toBe(42);
  });

  it('counts episode-less spend in the total and reports it as unattributed', () => {
    const out = aggregateBudget(
      [ep({ id: 'e1' })],
      [
        log({ cost_usd: 3 }),
        // Bible image gen — real money that belongs to no episode.
        log({ episode_id: null, agent_id: 'EXEC-EREF', operation: 'bible_image', cost_usd: 7 }),
      ],
    );
    expect(out.spentOnEpisodes).toBe(3);
    expect(out.unattributed.total).toBe(7);
    expect(out.unattributed.calls).toBe(1);
    // The headline must equal the sum of the parts — that is the whole invariant.
    expect(out.totalSpent).toBe(out.spentOnEpisodes + out.unattributed.total);
  });

  it('folds Polina out as her own bucket instead of hiding her in a provider', () => {
    const out = aggregateBudget(
      [ep({ id: 'e1' })],
      [
        log({ agent_id: 'EXEC-CONC', api_provider: 'openai', cost_usd: 4 }),
        log({ agent_id: 'EXEC-SW', api_provider: 'anthropic', cost_usd: 1 }),
      ],
    );
    const e = out.byEpisode[0]!;
    expect(e.breakdown).toEqual({ concierge: 4, anthropic: 1 });
    expect(e.conciergeUsd).toBe(4);
    expect(out.conciergeTotal).toBe(4);
    // ...and she is still inside the total.
    expect(e.total).toBe(5);
  });

  it('reports an overrun as a negative remaining rather than clamping to zero', () => {
    const out = aggregateBudget(
      [ep({ id: 'e1', budget_ceiling: 10 })],
      [log({ cost_usd: 25 })],
    );
    expect(out.remaining).toBe(-15);
  });

  it('excludes archived episodes from allocated but keeps their spend visible', () => {
    const out = aggregateBudget(
      [
        ep({ id: 'e1', budget_ceiling: 100 }),
        ep({ id: 'e2', status: 'ARCHIVED', budget_ceiling: 100 }),
      ],
      [log({ episode_id: 'e2', cost_usd: 30 })],
    );
    expect(out.totalAllocated).toBe(100);
    expect(out.allocatedIncludingArchived).toBe(200);
    expect(out.spentOnEpisodes).toBe(30);
    expect(out.spentOnActiveEpisodes).toBe(0);
    expect(out.byEpisode.find((e) => e.episode_id === 'e2')?.archived).toBe(true);
  });

  it('averages burn over the last shipped episodes in chronological order', () => {
    // 6 shipped episodes, created out of DB order on purpose: the window must be
    // the chronologically LAST five, not whatever order the rows arrived in.
    const episodes = [5, 1, 4, 2, 6, 3].map((n) =>
      ep({
        id: `e${n}`,
        episode_code: `S01E0${n}`,
        status: 'PUBLISHED',
        created_at: `2026-01-0${n}T00:00:00Z`,
        budget_ceiling: 100,
      }),
    );
    // Cost = 10 × episode number, so E01 (=10) is the one dropped by the window.
    const logs = [1, 2, 3, 4, 5, 6].map((n) =>
      log({ episode_id: `e${n}`, cost_usd: n * 10 }),
    );
    const out = aggregateBudget(episodes, logs);
    expect(out.byEpisode.map((e) => e.episode_code)).toEqual([
      'S01E01', 'S01E02', 'S01E03', 'S01E04', 'S01E05', 'S01E06',
    ]);
    expect(BURN_RATE_WINDOW).toBe(5);
    // mean(20,30,40,50,60) = 40
    expect(out.burnRate).toBe(40);
  });

  it('counts $0 rows as a known gap, never as evidence the work was free', () => {
    const out = aggregateBudget(
      [ep({ id: 'e1' })],
      [
        log({ api_provider: 'mock', operation: 'music_generation', cost_usd: 0 }),
        log({ cost_usd: 2 }),
      ],
    );
    expect(out.gaps.zeroCostCalls).toBe(1);
    expect(out.gaps.zeroCostByProvider[0]).toMatchObject({ key: 'mock', calls: 1 });
    expect(out.byEpisode[0]!.zeroCostCalls).toBe(1);
  });

  it('flags token-billed rows whose model has no real price entry', () => {
    const out = aggregateBudget(
      [ep({ id: 'e1' })],
      [
        // Priced — must NOT be flagged.
        log({ model_or_tier: 'claude-sonnet-4-6', tokens_used: 900, cost_usd: 0.01 }),
        // Unpriced LLM — recorded cost is the Sonnet fallback, so flag it.
        log({ model_or_tier: 'gemini-9.9-imaginary', tokens_used: 900, cost_usd: 0.02 }),
        // Media call: no tokens, provider-quoted price → not a pricing-table gap.
        log({ model_or_tier: 'seedance', tokens_used: null, cost_usd: 3 }),
      ],
    );
    expect(out.gaps.unpricedModels.map((f) => f.key)).toEqual(['gemini-9.9-imaginary']);
  });

  it('reports row counts so a future silent truncation is detectable', () => {
    const out = aggregateBudget([ep({ id: 'e1' }), ep({ id: 'e2' })], [log({}), log({})]);
    expect(out.counts).toEqual({ episodes: 2, logRows: 2 });
  });

  it('handles an empty studio without dividing by zero', () => {
    const out = aggregateBudget([], []);
    expect(out.totalSpent).toBe(0);
    expect(out.burnRate).toBe(0);
    expect(out.projectedRunway).toBeNull();
    expect(out.byEpisode).toEqual([]);
  });
});
