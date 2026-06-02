// Unit tests for checkVerbalApproval — focus on the Director's documented
// numbered-answer format (q<N>y / q<N>n, director-communication.md). Regression
// guard for the 2026-06-02 bug where "q19 Y" was not recognised as approval and
// the server-side gate blocked the PA's mutations.

import { describe, expect, test } from 'vitest';
import { checkVerbalApproval } from '@/lib/concierge/approval-check';
import type { ConciergeTurnRow } from '@/lib/concierge/types';

function directorTurn(content: string, i = 0): ConciergeTurnRow {
  return {
    id: `turn-${i}`,
    thread_id: 'thread-1',
    role: 'director',
    event_type: 'message',
    content,
    metadata: {},
    token_count: null,
    created_at: new Date(2026, 5, 2, 12, 0, i).toISOString(),
  };
}

describe('checkVerbalApproval — numbered-answer format', () => {
  test('"q19 Y" (space + capital) counts as approval', () => {
    const out = checkVerbalApproval([directorTurn('q19 Y')]);
    expect(out.approved).toBe(true);
  });

  test('"q19y" (no space) counts as approval', () => {
    const out = checkVerbalApproval([directorTurn('q19y')]);
    expect(out.approved).toBe(true);
  });

  test('"q4 — да, поехали; q19y" stays approval', () => {
    const out = checkVerbalApproval([directorTurn('q4 — да, поехали; q19y')]);
    expect(out.approved).toBe(true);
  });

  test('"q19n" counts as rejection', () => {
    const out = checkVerbalApproval([directorTurn('q19n')]);
    expect(out.approved).toBe(false);
    expect(out.reason).toMatch(/rejection|hesitation/i);
  });

  test('"q19 N" (space + capital) counts as rejection', () => {
    const out = checkVerbalApproval([directorTurn('q19 N')]);
    expect(out.approved).toBe(false);
  });

  test('multi-choice "q3b" is neutral, NOT auto-approval', () => {
    const out = checkVerbalApproval([directorTurn('q3b')]);
    // No yes/no marker → cannot be read as consent to mutate.
    expect(out.approved).toBe(false);
  });

  test('later q-no overrides earlier q-yes in the same turn', () => {
    const out = checkVerbalApproval([directorTurn('q1y but on reflection q2n')]);
    expect(out.approved).toBe(false);
  });

  test('"q19 yellow" does not match q-yes (boundary guard)', () => {
    const out = checkVerbalApproval([directorTurn('q19 yellow card')]);
    expect(out.approved).toBe(false);
  });

  test('plain "да" still works (no regression)', () => {
    expect(checkVerbalApproval([directorTurn('да')]).approved).toBe(true);
  });
});
