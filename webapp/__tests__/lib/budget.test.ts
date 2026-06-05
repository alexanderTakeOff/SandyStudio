import { describe, it, expect, beforeEach } from 'vitest';

import {
  recordCost,
  BudgetExceededError,
  releaseBudgetReservation,
  getBudgetSummary,
} from '@/lib/budget';
import { makeMockSupabase } from '../helpers/mock-supabase';

describe('recordCost — idempotency + ceiling enforcement', () => {
  let supabase: ReturnType<typeof makeMockSupabase>;

  beforeEach(() => {
    supabase = makeMockSupabase({
      episodes: [
        { id: 'ep-1', episode_code: 'SS-S01-E01', budget_ceiling: 10, budget_spent: 0, governance_mode: 4 },
      ],
    });
  });

  it('records cost and bumps episode budget_spent on first call', async () => {
    const result = await recordCost(supabase.client, {
      jobId: 'job-1',
      episodeId: 'ep-1',
      agentId: 'EXEC-SW',
      costUsd: 1.5,
      apiProvider: 'anthropic',
      modelOrTier: 'claude-sonnet-4-6',
      operation: 'script_generation',
    });
    expect(result.recorded).toBe(true);
    expect(result.newBudgetSpent).toBe(1.5);
    expect(supabase.tables.budget_log).toHaveLength(1);
    expect(supabase.tables.episodes[0].budget_spent).toBe(1.5);
  });

  it('mock-mode $0 cost still records a row (audit trail)', async () => {
    const result = await recordCost(supabase.client, {
      jobId: 'job-mock',
      episodeId: 'ep-1',
      agentId: 'EXEC-VGEN',
      costUsd: 0,
      apiProvider: 'mock',
      modelOrTier: 'mock',
      operation: 'video_generation',
    });
    expect(result.recorded).toBe(true);
    expect(supabase.tables.budget_log).toHaveLength(1);
    // budget_spent NOT bumped for $0 (no observable change)
    expect(supabase.tables.episodes[0].budget_spent).toBe(0);
  });

  it('idempotent on retry — second call with same job_id is a no-op', async () => {
    const args = {
      jobId: 'job-retry',
      episodeId: 'ep-1',
      agentId: 'EXEC-SW' as const,
      costUsd: 2.0,
      apiProvider: 'anthropic',
      modelOrTier: 'claude-sonnet-4-6',
      operation: 'script_generation',
    };
    const first = await recordCost(supabase.client, args);
    const second = await recordCost(supabase.client, args);

    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);
    expect(supabase.tables.budget_log).toHaveLength(1);
    expect(supabase.tables.episodes[0].budget_spent).toBe(2.0); // no double-charge
  });

  it('throws BudgetExceededError when ceiling would be exceeded', async () => {
    await recordCost(supabase.client, {
      jobId: 'job-a',
      episodeId: 'ep-1',
      agentId: 'EXEC-SW',
      costUsd: 9,
      apiProvider: 'anthropic',
      modelOrTier: 'claude-sonnet-4-6',
      operation: 'script_generation',
    });
    await expect(
      recordCost(supabase.client, {
        jobId: 'job-b',
        episodeId: 'ep-1',
        agentId: 'EXEC-VGEN',
        costUsd: 5,
        apiProvider: 'fal_ai',
        modelOrTier: 'kling-3',
        operation: 'video_generation',
      }),
    ).rejects.toThrow(BudgetExceededError);
    // budget_log unchanged after the failed call
    expect(supabase.tables.budget_log).toHaveLength(1);
  });

  it('null episodeId works without ceiling enforcement', async () => {
    const result = await recordCost(supabase.client, {
      jobId: 'job-orphan',
      episodeId: null,
      agentId: 'EXEC-CONC',
      costUsd: 0.001,
      apiProvider: 'openai',
      modelOrTier: 'gpt-5.4-mini',
      operation: 'concierge_chat',
    });
    expect(result.recorded).toBe(true);
  });
});

describe('releaseBudgetReservation — refund a failed pre-spend reservation (q12)', () => {
  it('decrements budget_spent by the reserved amount', async () => {
    const supabase = makeMockSupabase({
      episodes: [
        { id: 'ep-1', episode_code: 'SS-S01-E01', budget_ceiling: 100, budget_spent: 5, governance_mode: 4 },
      ],
    });
    await releaseBudgetReservation(supabase.client, 'ep-1', 3);
    expect(supabase.tables.episodes[0].budget_spent).toBe(2);
  });

  it('is a no-op for zero / negative reserved amounts', async () => {
    const supabase = makeMockSupabase({
      episodes: [
        { id: 'ep-1', episode_code: 'SS-S01-E01', budget_ceiling: 100, budget_spent: 5, governance_mode: 4 },
      ],
    });
    await releaseBudgetReservation(supabase.client, 'ep-1', 0);
    await releaseBudgetReservation(supabase.client, 'ep-1', -4);
    expect(supabase.tables.episodes[0].budget_spent).toBe(5);
  });
});

describe('getBudgetSummary — accountant view over budget_log (q12)', () => {
  it('aggregates spend by provider+operation and reports spent/ceiling', async () => {
    const supabase = makeMockSupabase({
      episodes: [
        { id: 'ep-1', episode_code: 'SS-S01-E01', budget_ceiling: 50, budget_spent: 0, governance_mode: 4 },
      ],
    });
    await recordCost(supabase.client, { jobId: 'j1', episodeId: 'ep-1', agentId: 'EXEC-VGEN', costUsd: 3, apiProvider: 'fal_ai', modelOrTier: 'seedance', operation: 'video_generation' });
    await recordCost(supabase.client, { jobId: 'j2', episodeId: 'ep-1', agentId: 'EXEC-VGEN', costUsd: 2, apiProvider: 'fal_ai', modelOrTier: 'seedance', operation: 'video_generation' });
    await recordCost(supabase.client, { jobId: 'j3', episodeId: 'ep-1', agentId: 'EXEC-EREF', costUsd: 0.08, apiProvider: 'openai', modelOrTier: 'gpt-image-2', operation: 'image_generation' });

    const sum = await getBudgetSummary(supabase.client, 'ep-1');
    expect(sum.spent).toBeCloseTo(5.08);
    expect(sum.ceiling).toBe(50);
    // sorted by cost desc → the two fal video calls collapse to one $5 / 2-call row, first.
    expect(sum.byProviderOperation[0]).toMatchObject({
      apiProvider: 'fal_ai',
      operation: 'video_generation',
      costUsd: 5,
      calls: 2,
    });
    const img = sum.byProviderOperation.find((r) => r.operation === 'image_generation');
    expect(img).toMatchObject({ apiProvider: 'openai', calls: 1 });
  });
});
