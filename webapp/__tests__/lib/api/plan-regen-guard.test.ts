// Runaway-recovery cap + in-flight guard for plan-driven re-fires.
// Root: E10 SH10 anchor regenerated 6× by Polina's uncapped "Mode 4
// auto-recovery" loop on an advisory visual-gate flag. assertPlanRegenWithinCap
// is the mechanical chokepoint that terminates the loop by construction.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  assertPlanRegenWithinCap,
  countShotAutonomousAttempts,
  hasUnclearedBillingLock,
} from '@/lib/api/plan-regen-guard';
import { shotRegenCap } from '@/lib/agents/chain-flags';
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

// ── Shot-level cap (E10 SH23 doom-loop fix 2026-06-15) ─────────────────────
// countShotAutonomousAttempts spans ALL plan versions per shot; shotRegenCap()
// defaults to 6. The factory pre-run hook compares the two.

/** Thenable builder returning { count, error } for the head:true count query. */
function mockCountClient(result: { count: number | null; error: unknown }) {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.in = () => b;
  b.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return { from: () => b } as never;
}

describe('shotRegenCap — default + env override', () => {
  const SFLAG = 'SHOT_REGEN_CAP';
  let sOriginal: string | undefined;
  beforeEach(() => {
    sOriginal = process.env[SFLAG];
    delete process.env[SFLAG];
  });
  afterEach(() => {
    if (sOriginal === undefined) delete process.env[SFLAG];
    else process.env[SFLAG] = sOriginal;
  });

  it('defaults to 6', () => {
    expect(shotRegenCap()).toBe(6);
  });

  it('respects a custom env override', () => {
    process.env[SFLAG] = '4';
    expect(shotRegenCap()).toBe(4);
  });

  it('ignores a non-positive / non-numeric override (falls back to 6)', () => {
    process.env[SFLAG] = '0';
    expect(shotRegenCap()).toBe(6);
    process.env[SFLAG] = 'nope';
    expect(shotRegenCap()).toBe(6);
  });
});

describe('countShotAutonomousAttempts', () => {
  it('returns the exact count across plan versions', async () => {
    const client = mockCountClient({ count: 5, error: null });
    const r = await countShotAutonomousAttempts(client, 'ep-1', 'SH23');
    expect(r).toEqual({ count: 5, readError: false });
  });

  it('returns count 0 (not undefined) when the head query reports null', async () => {
    const client = mockCountClient({ count: null, error: null });
    const r = await countShotAutonomousAttempts(client, 'ep-1', 'SH23');
    expect(r).toEqual({ count: 0, readError: false });
  });

  it('signals readError (fail-closed) when the query errors', async () => {
    const client = mockCountClient({ count: null, error: { message: 'boom' } });
    const r = await countShotAutonomousAttempts(client, 'ep-1', 'SH23');
    expect(r.readError).toBe(true);
  });
});

// ── Provider billing breaker ─────────────────────────────────────────────────
// E30 (2026-07-18): one exhausted fal balance produced 120 identical 403s across
// ~10 shots in 37 minutes, because both existing billing guards are per-run and
// nothing refused the NEXT dispatch. This helper is the breaker at the door.

/** Two-table double: the newest billing-lock event and the newest COMPLETED job. */
function mockBillingClient(opts: {
  lock?: { created_at: string; description?: string } | null;
  lastOk?: { created_at: string } | null;
  lockError?: { message: string } | null;
  jobsError?: { message: string } | null;
}) {
  const make = (data: unknown, error: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) b[m] = () => b;
    (b as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      resolve({ data, error });
    return b;
  };
  return {
    from: (name: string) =>
      name === 'jobs'
        ? make(opts.lastOk ? [opts.lastOk] : [], opts.jobsError ?? null)
        : make(opts.lock ? [opts.lock] : [], opts.lockError ?? null),
  } as never;
}

describe('hasUnclearedBillingLock', () => {
  it('is clear when the provider never reported a billing wall', async () => {
    const r = await hasUnclearedBillingLock(mockBillingClient({ lock: null }), 'ep-1');
    expect(r.locked).toBe(false);
    expect(r.readError).toBe(false);
  });

  it('locks while the wall is the most recent thing that happened', async () => {
    const r = await hasUnclearedBillingLock(
      mockBillingClient({
        lock: { created_at: '2026-07-18T08:13:00Z', description: 'Exhausted balance' },
        lastOk: { created_at: '2026-07-18T07:00:00Z' },
      }),
      'ep-1',
    );
    expect(r.locked).toBe(true);
    expect(r.message).toMatch(/Exhausted balance/);
    expect(r.since).toBe('2026-07-18T08:13:00Z');
  });

  it('self-clears once any job completes after the wall (no reset flag)', async () => {
    const r = await hasUnclearedBillingLock(
      mockBillingClient({
        lock: { created_at: '2026-07-18T08:13:00Z' },
        lastOk: { created_at: '2026-07-18T08:41:00Z' }, // Director topped up + re-triggered
      }),
      'ep-1',
    );
    expect(r.locked).toBe(false);
  });

  it('locks when a wall exists and NO job has ever completed', async () => {
    const r = await hasUnclearedBillingLock(
      mockBillingClient({ lock: { created_at: '2026-07-18T08:13:00Z' }, lastOk: null }),
      'ep-1',
    );
    expect(r.locked).toBe(true);
  });

  it('fails CLOSED on a read error — an unverifiable state must not open the money door', async () => {
    const a = await hasUnclearedBillingLock(
      mockBillingClient({ lockError: { message: 'boom' } }),
      'ep-1',
    );
    expect(a.readError).toBe(true);

    const b = await hasUnclearedBillingLock(
      mockBillingClient({
        lock: { created_at: '2026-07-18T08:13:00Z' },
        jobsError: { message: 'boom' },
      }),
      'ep-1',
    );
    expect(b.readError).toBe(true);
  });
});
