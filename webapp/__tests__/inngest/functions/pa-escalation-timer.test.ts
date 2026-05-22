// Unit tests for pa-escalation-timer's re-check logic. Step 2 of the
// 2026-05-22 Supabase recovery sprint. The Inngest harness orchestration
// (sleep, cancelOn) is integration-tested in dev; here we verify the pure
// decision function that selects between escalating, skipping, and bailing
// on DB error.

import { describe, expect, test } from 'vitest';
import {
  clampDeadlineSec,
  decideEscalation,
  DEADLINE_MAX_SEC,
  DEADLINE_MIN_SEC,
  type EscalationIntent,
} from '@/inngest/functions/pa-escalation-timer-core';

function stubClient(
  result:
    | { data: { id: string; role: string; created_at: string } | null; error: null }
    | { data: null; error: { message: string } },
) {
  return {
    async getLatestTurn() {
      return result;
    },
  };
}

describe('clampDeadlineSec', () => {
  test('clamps below floor to 30s', () => {
    expect(clampDeadlineSec(5)).toBe(DEADLINE_MIN_SEC);
    expect(clampDeadlineSec(0)).toBe(DEADLINE_MIN_SEC);
    expect(clampDeadlineSec(-100)).toBe(DEADLINE_MIN_SEC);
  });

  test('clamps above ceiling to 3600s', () => {
    expect(clampDeadlineSec(99999)).toBe(DEADLINE_MAX_SEC);
    expect(clampDeadlineSec(7200)).toBe(DEADLINE_MAX_SEC);
  });

  test('passes valid values through (rounded)', () => {
    expect(clampDeadlineSec(90)).toBe(90);
    expect(clampDeadlineSec(120)).toBe(120);
    expect(clampDeadlineSec(90.7)).toBe(91);
  });

  test('NaN / Infinity → default 90', () => {
    expect(clampDeadlineSec(Number.NaN)).toBe(90);
    expect(clampDeadlineSec(Number.POSITIVE_INFINITY)).toBe(90);
  });
});

describe('decideEscalation — TD-25 P4 escalation timer core logic', () => {
  test('escalates when latest turn IS the original awaiting anchor', async () => {
    const client = stubClient({
      data: { id: 'turn-A', role: 'assistant', created_at: '2026-05-22T10:00:00Z' },
      error: null,
    });
    const result: EscalationIntent = await decideEscalation('thread-1', 'turn-A', client);
    expect(result.intent).toBe('escalate');
  });

  test('skips with state_moved_on when a newer assistant turn supersedes', async () => {
    const client = stubClient({
      data: { id: 'turn-B', role: 'assistant', created_at: '2026-05-22T10:05:00Z' },
      error: null,
    });
    const result = await decideEscalation('thread-1', 'turn-A', client);
    expect(result.intent).toBe('state_moved_on');
    if (result.intent === 'state_moved_on') {
      expect(result.latestTurnId).toBe('turn-B');
      expect(result.latestRole).toBe('assistant');
    }
  });

  test('skips with state_moved_on when a director-role turn arrives after cancelOn window', async () => {
    // cancelOn should have killed the run already, but as a defensive
    // check we still skip if a director turn won the race.
    const client = stubClient({
      data: { id: 'turn-D', role: 'director', created_at: '2026-05-22T10:05:30Z' },
      error: null,
    });
    const result = await decideEscalation('thread-1', 'turn-A', client);
    expect(result.intent).toBe('state_moved_on');
    if (result.intent === 'state_moved_on') {
      expect(result.latestRole).toBe('director');
    }
  });

  test('handles re_check_failed cleanly when DB returns an error', async () => {
    const client = stubClient({ data: null, error: { message: 'db down' } });
    const result = await decideEscalation('thread-1', 'turn-A', client);
    expect(result.intent).toBe('re_check_failed');
    if (result.intent === 're_check_failed') {
      expect(result.reason).toBe('db down');
    }
  });

  test('handles no_turns_found when DB returns empty', async () => {
    const client = stubClient({ data: null, error: null });
    const result = await decideEscalation('thread-1', 'turn-A', client);
    expect(result.intent).toBe('no_turns_found');
  });

  test('never escalates when DB lookup errors — preserves "no Supabase reads on idle" invariant', async () => {
    // Defense check: any error path must NOT escalate. Only the 'escalate'
    // intent is allowed to fire pa/notify-needed.
    const errClient = stubClient({ data: null, error: { message: 'transient' } });
    const emptyClient = stubClient({ data: null, error: null });
    const movedClient = stubClient({
      data: { id: 'turn-X', role: 'assistant', created_at: '2026-05-22T11:00:00Z' },
      error: null,
    });
    const results = await Promise.all([
      decideEscalation('t1', 'turn-A', errClient),
      decideEscalation('t1', 'turn-A', emptyClient),
      decideEscalation('t1', 'turn-A', movedClient),
    ]);
    for (const r of results) {
      expect(r.intent).not.toBe('escalate');
    }
  });
});
