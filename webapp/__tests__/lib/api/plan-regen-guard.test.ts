// Runaway-recovery cap + in-flight guard for plan-driven re-fires.
// Root: E10 SH10 anchor regenerated 6× by Polina's uncapped "Mode 4
// auto-recovery" loop on an advisory visual-gate flag. assertPlanRegenWithinCap
// is the mechanical chokepoint that terminates the loop by construction.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { assertPlanRegenWithinCap } from '@/lib/api/plan-regen-guard';
import { ConflictError } from '@/lib/api/errors';

type Job = { id: string; status: string; started_at?: string };

// Minimal supabase double: the guard issues ONE jobs query (chained eq/in/eq,
// awaited) and logEvent issues an activity_events insert→select→maybeSingle.
function mockSupabase(jobs: Job[]) {
  const inserted: Array<Record<string, unknown>> = [];
  const jobsBuilder = {
    select: () => jobsBuilder,
    eq: () => jobsBuilder,
    in: () => jobsBuilder,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: jobs, error: null }),
  };
  const activityBuilder = {
    insert: (row: Record<string, unknown>) => {
      inserted.push(row);
      return activityBuilder;
    },
    select: () => activityBuilder,
    maybeSingle: async () => ({ data: { id: 'evt-1' }, error: null }),
  };
  const client = {
    from: (name: string) => (name === 'jobs' ? jobsBuilder : activityBuilder),
  } as never;
  return { client, inserted };
}

const BASE = {
  episodeId: 'ep-1',
  agentId: 'EXEC-EREF',
  planAssetId: 'plan-1',
  shotId: 'SH10',
} as const;

const FLAG = 'PLAN_REGEN_CAP';
let original: string | undefined;
beforeEach(() => {
  original = process.env[FLAG];
  delete process.env[FLAG];
});
afterEach(() => {
  if (original === undefined) delete process.env[FLAG];
  else process.env[FLAG] = original;
  vi.restoreAllMocks();
});

describe('assertPlanRegenWithinCap — in-flight guard (all principals)', () => {
  it('refuses while a RUNNING job holds the plan, even for the human Director', async () => {
    const { client } = mockSupabase([{ id: 'j1', status: 'RUNNING', started_at: 't' }]);
    await expect(
      assertPlanRegenWithinCap({ ...BASE, supabase: client, principal: 'director' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses while a QUEUED job holds the plan (autonomous)', async () => {
    const { client } = mockSupabase([{ id: 'j1', status: 'QUEUED' }]);
    await expect(
      assertPlanRegenWithinCap({ ...BASE, supabase: client, principal: 'exec_dir_ai' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('assertPlanRegenWithinCap — runaway cap (autonomous only)', () => {
  it('HALTs the autonomous re-fire once COMPLETED attempts reach the cap (default 3)', async () => {
    const completed = Array.from({ length: 3 }, (_, i) => ({ id: `j${i}`, status: 'COMPLETED' }));
    const { client, inserted } = mockSupabase(completed);
    await expect(
      assertPlanRegenWithinCap({ ...BASE, supabase: client, principal: 'exec_dir_ai' }),
    ).rejects.toThrow(/cap reached/i);
    // Emits an audit row (non-actionable → does not re-feed Polina's loop).
    expect(inserted.some((r) => r.event_type === 'regen_cap_halt')).toBe(true);
  });

  it('allows the autonomous re-fire while still under the cap (2 < 3)', async () => {
    const { client } = mockSupabase([
      { id: 'j0', status: 'COMPLETED' },
      { id: 'j1', status: 'COMPLETED' },
    ]);
    await expect(
      assertPlanRegenWithinCap({ ...BASE, supabase: client, principal: 'exec_dir_ai' }),
    ).resolves.toBeUndefined();
  });

  it('NEVER caps the human Director — she is the escalation target', async () => {
    const completed = Array.from({ length: 9 }, (_, i) => ({ id: `j${i}`, status: 'COMPLETED' }));
    const { client } = mockSupabase(completed);
    await expect(
      assertPlanRegenWithinCap({ ...BASE, supabase: client, principal: 'director' }),
    ).resolves.toBeUndefined();
  });

  it('respects a custom PLAN_REGEN_CAP env override', async () => {
    process.env[FLAG] = '1';
    const { client } = mockSupabase([{ id: 'j0', status: 'COMPLETED' }]);
    await expect(
      assertPlanRegenWithinCap({ ...BASE, supabase: client, principal: 'exec_dir_ai' }),
    ).rejects.toThrow(/cap reached/i);
  });
});

describe('assertPlanRegenWithinCap — read error fails CLOSED', () => {
  it('throws when the jobs query errors (never opens the loop)', async () => {
    const errClient = {
      from: () => {
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = () => b;
        b.in = () => b;
        b.then = (resolve: (v: unknown) => unknown) =>
          resolve({ data: null, error: { message: 'boom' } });
        return b;
      },
    } as never;
    await expect(
      assertPlanRegenWithinCap({ ...BASE, supabase: errClient, principal: 'exec_dir_ai' }),
    ).rejects.toThrow(/Could not verify/i);
  });
});
