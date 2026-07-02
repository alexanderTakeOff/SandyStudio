// Unit tests for TD-39 Layer 1 pickup acknowledgment helper.
// Covers the two practical outcomes: row visible immediately (success)
// and no row before deadline (pickup_timeout).

import { describe, expect, test } from 'vitest';
import {
  waitForJobPickup,
  ackOrFailOnPickup,
  ackFanoutPickup,
} from '@/lib/concierge/tools/wait-for-pickup';
import { ok, fail } from '@/lib/concierge/tools/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';

interface FakeRow {
  id: string;
}

/**
 * Minimal stub of the PostgrestFilterBuilder chain. Two row sets: the per-job
 * pickup poll (uses `.in('status', …)`) resolves to `pickupRows`; the liveness
 * probe (uses `.or(…)`) resolves to `livenessRows`. Defaulting livenessRows to
 * pickupRows preserves the pre-liveness tests (empty→empty, [row]→[row]).
 */
function makeSupabaseStub(
  pickupRows: FakeRow[],
  livenessRows: FakeRow[] = pickupRows,
): {
  client: SupabaseClient<Database>;
  selectCalls: () => number;
} {
  let selectCalls = 0;
  function makeBuilder() {
    let isLiveness = false;
    const builder = {
      eq() {
        return builder;
      },
      gte() {
        return builder;
      },
      in() {
        return builder;
      },
      or() {
        isLiveness = true;
        return builder;
      },
      limit() {
        return builder;
      },
      then(resolve: (v: { data: FakeRow[]; error: null }) => unknown) {
        const data = isLiveness ? livenessRows : pickupRows;
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return builder;
  }
  const client = {
    from() {
      return {
        select() {
          selectCalls += 1;
          return makeBuilder();
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, selectCalls: () => selectCalls };
}

describe('waitForJobPickup', () => {
  test('returns pickedUp=true when a job row is visible immediately', async () => {
    const { client } = makeSupabaseStub([{ id: 'job-1234abcd' }]);
    const result = await waitForJobPickup({
      supabase: client,
      episodeId: 'ep-1',
      agentHint: 'EXEC-VGEN',
      sinceIso: new Date().toISOString(),
      timeoutMs: 1_000,
      intervalMs: 50,
    });
    expect(result.pickedUp).toBe(true);
    expect(result.jobId).toBe('job-1234abcd');
    expect(result.elapsedMs).toBeLessThan(1_000);
  });

  test('returns pickedUp=false after the deadline when no row appears', async () => {
    const { client, selectCalls } = makeSupabaseStub([]);
    const result = await waitForJobPickup({
      supabase: client,
      episodeId: 'ep-1',
      sinceIso: new Date().toISOString(),
      timeoutMs: 200,
      intervalMs: 50,
    });
    expect(result.pickedUp).toBe(false);
    expect(result.jobId).toBeUndefined();
    expect(result.elapsedMs).toBeGreaterThanOrEqual(200);
    // At least 2 polling attempts inside a 200ms window @ 50ms interval.
    expect(selectCalls()).toBeGreaterThanOrEqual(2);
  });
});

describe('ackOrFailOnPickup', () => {
  test('passes through failures unchanged (no DB call)', async () => {
    const { client, selectCalls } = makeSupabaseStub([]);
    const original = fail('boom', 'http_500');
    const out = await ackOrFailOnPickup(original, {
      supabase: client,
      episodeId: 'ep-1',
      sinceIso: new Date().toISOString(),
      label: 'triggerAgent(EXEC-X)',
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toBe('boom');
      expect(out.code).toBe('http_500');
    }
    expect(selectCalls()).toBe(0);
  });

  test('passes through ok results when no episodeId (cannot poll)', async () => {
    const { client, selectCalls } = makeSupabaseStub([]);
    const original = ok({ triggered: true }, 'createSeries OK');
    const out = await ackOrFailOnPickup(original, {
      supabase: client,
      episodeId: null,
      sinceIso: new Date().toISOString(),
      label: 'createSeries',
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.summary).toBe('createSeries OK');
    }
    expect(selectCalls()).toBe(0);
  });

  test('downgrades to pickup_timeout when ok dispatch but no executor row', async () => {
    const { client } = makeSupabaseStub([]);
    const original = ok({ triggered: true }, 'triggerAgent(EXEC-VGEN) OK');
    const out = await ackOrFailOnPickup(original, {
      supabase: client,
      episodeId: 'ep-1',
      agentHint: 'EXEC-VGEN',
      sinceIso: new Date().toISOString(),
      label: 'triggerAgent(EXEC-VGEN)',
      timeoutMs: 150,
      intervalMs: 50,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe('pickup_timeout');
      expect(out.error).toMatch(/no executor picked the event up/i);
    }
  });

  test('advisory ok (NOT pickup_timeout) when the job is queued but the worker is alive', async () => {
    // Per-job poll finds nothing, but a sibling job proves the worker is
    // draining a batch → normal queue latency, not a failure (E13 2026-07-02).
    const { client } = makeSupabaseStub([], [{ id: 'sibling-job-1' }]);
    const original = ok({ triggered: true }, 'regenerateShotPlan(SH15) OK');
    const out = await ackOrFailOnPickup(original, {
      supabase: client,
      episodeId: 'ep-1',
      agentHint: 'EXEC-VANIM',
      sinceIso: new Date().toISOString(),
      label: 'regenerateShotPlan(SH15)',
      timeoutMs: 150,
      intervalMs: 50,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.summary).toMatch(/queued|queue latency|run shortly/i);
      expect(out.summary).not.toMatch(/has NOT started/i);
    }
  });

  test('hard pickup_timeout only when the worker shows NO recent life', async () => {
    const { client } = makeSupabaseStub([], []); // no per-job row AND no liveness
    const original = ok({ triggered: true }, 'triggerAgent(EXEC-VANIM) OK');
    const out = await ackOrFailOnPickup(original, {
      supabase: client,
      episodeId: 'ep-1',
      agentHint: 'EXEC-VANIM',
      sinceIso: new Date().toISOString(),
      label: 'triggerAgent(EXEC-VANIM)',
      timeoutMs: 150,
      intervalMs: 50,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe('pickup_timeout');
      expect(out.error).toMatch(/no recent activity/i);
    }
  });

  test('appends pickup confirmation to summary on success', async () => {
    const { client } = makeSupabaseStub([{ id: 'job-abcd1234' }]);
    const original = ok({ triggered: true }, 'triggerAgent(EXEC-VGEN)');
    const out = await ackOrFailOnPickup(original, {
      supabase: client,
      episodeId: 'ep-1',
      agentHint: 'EXEC-VGEN',
      sinceIso: new Date().toISOString(),
      label: 'triggerAgent(EXEC-VGEN)',
      timeoutMs: 1_000,
      intervalMs: 50,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.summary).toMatch(/pickup confirmed/i);
      expect(out.summary).toMatch(/job-abcd/);
    }
  });
});

/** Build the approve route's `{ success, data: {...} }` envelope as a tool result. */
function approveResult(
  fired: Array<{ name: string; ids: string[] }>,
  episodeId: string | null,
): ReturnType<typeof ok> {
  return ok(
    { success: true, data: { decision: 'APPROVE', episode_id: episodeId, fired_events: fired } },
    'approveAsset(asset-1) succeeded.',
  );
}

describe('ackFanoutPickup', () => {
  test('no-op approval (zero fired_events) returns ok without polling', async () => {
    const { client, selectCalls } = makeSupabaseStub([]);
    const out = await ackFanoutPickup(approveResult([], 'ep-1'), {
      supabase: client,
      ctxEpisodeId: 'ep-1',
      sinceIso: new Date().toISOString(),
      label: 'approveAsset(asset-1)',
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.summary).toMatch(/no downstream agent launched/i);
    }
    // Crucially: a valid no-op must NOT trigger a pickup poll.
    expect(selectCalls()).toBe(0);
  });

  test('fan-out that picks up confirms via the route episode_id anchor', async () => {
    const { client } = makeSupabaseStub([{ id: 'job-fan01234' }]);
    const out = await ackFanoutPickup(
      approveResult([{ name: 'sandystudio/exec-sb/create-storyboard', ids: ['evt-1'] }], 'ep-9'),
      {
        supabase: client,
        ctxEpisodeId: 'ep-9',
        sinceIso: new Date().toISOString(),
        label: 'approveAsset(asset-1)',
        timeoutMs: 1_000,
        intervalMs: 50,
      },
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.summary).toMatch(/pickup confirmed/i);
    }
  });

  test('fan-out that never picks up downgrades to pickup_timeout', async () => {
    const { client } = makeSupabaseStub([]);
    const out = await ackFanoutPickup(
      approveResult([{ name: 'sandystudio/exec-sb/create-storyboard', ids: ['evt-1'] }], 'ep-9'),
      {
        supabase: client,
        ctxEpisodeId: 'ep-9',
        sinceIso: new Date().toISOString(),
        label: 'approveAsset(asset-1)',
        timeoutMs: 150,
        intervalMs: 50,
      },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe('pickup_timeout');
    }
  });

  test('passes through dispatch failures unchanged', async () => {
    const { client, selectCalls } = makeSupabaseStub([]);
    const out = await ackFanoutPickup(fail('approve failed', 'http_409'), {
      supabase: client,
      ctxEpisodeId: 'ep-1',
      sinceIso: new Date().toISOString(),
      label: 'approveAsset(asset-1)',
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe('http_409');
    }
    expect(selectCalls()).toBe(0);
  });
});
