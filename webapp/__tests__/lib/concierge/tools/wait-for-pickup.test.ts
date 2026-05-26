// Unit tests for TD-39 Layer 1 pickup acknowledgment helper.
// Covers the two practical outcomes: row visible immediately (success)
// and no row before deadline (pickup_timeout).

import { describe, expect, test } from 'vitest';
import {
  waitForJobPickup,
  ackOrFailOnPickup,
} from '@/lib/concierge/tools/wait-for-pickup';
import { ok, fail } from '@/lib/concierge/tools/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';

interface FakeRow {
  id: string;
}

/** Minimal stub of the PostgrestFilterBuilder chain used by waitForJobPickup. */
function makeSupabaseStub(rows: FakeRow[]): {
  client: SupabaseClient<Database>;
  selectCalls: () => number;
} {
  let selectCalls = 0;
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
    limit() {
      return builder;
    },
    then(resolve: (v: { data: FakeRow[]; error: null }) => unknown) {
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  const client = {
    from() {
      return {
        select() {
          selectCalls += 1;
          return builder;
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
