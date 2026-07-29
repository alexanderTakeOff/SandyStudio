import { describe, expect, test } from 'vitest';
import { occupiesRegenSlot } from '@/lib/agents/chain-flags';

/**
 * E33 SH02, 2026-07-29. The Director rejected a video; the Animator re-authored the
 * plan; the Director approved it — and every automatic render was then suppressed at
 * $0, because the shot-dedup counter tallied VID-shot rows without looking at status,
 * so the REJECTED file kept holding the one slot meant to produce its replacement.
 * The only way out was a second manual click.
 *
 * The guard itself is right (never spend twice without a human decision in between);
 * the counting rule conflated "never reviewed" with "reviewed and rejected".
 */
describe('occupiesRegenSlot — which renders still hold the regen quota', () => {
  test('a render the Director rejected releases the slot', () => {
    // Arrange / Act / Assert — this is the E33 SH02 case itself.
    expect(occupiesRegenSlot('REVISION')).toBe(false);
    expect(occupiesRegenSlot('REJECTED')).toBe(false);
  });

  test('a superseded sibling releases the slot — the winner holds it, not both', () => {
    expect(occupiesRegenSlot('INVALIDATED')).toBe(false);
  });

  test('Mode 4 test output never holds a slot', () => {
    expect(occupiesRegenSlot('TEST')).toBe(false);
  });

  test('anything awaiting a human verdict still holds the slot', () => {
    // This is what preserves the guard: at most one un-reviewed render outstanding.
    expect(occupiesRegenSlot('DRAFT')).toBe(true);
    expect(occupiesRegenSlot('REVIEW')).toBe(true);
    expect(occupiesRegenSlot('NEEDS_HUMAN_TWEAK')).toBe(true);
  });

  test('a delivered render still holds the slot', () => {
    expect(occupiesRegenSlot('APPROVED')).toBe(true);
    expect(occupiesRegenSlot('LOCKED')).toBe(true);
  });

  test('an unknown or missing status fails CLOSED — it still holds the slot', () => {
    // Fail-closed on purpose: an unrecognised status must never silently unlock
    // spending. A wrong block costs one click; a wrong render costs money.
    expect(occupiesRegenSlot(null)).toBe(true);
    expect(occupiesRegenSlot(undefined)).toBe(true);
    expect(occupiesRegenSlot('SOMETHING_NEW')).toBe(true);
  });

  test('status matching is case-insensitive', () => {
    expect(occupiesRegenSlot('revision')).toBe(false);
    expect(occupiesRegenSlot('Rejected')).toBe(false);
  });

  test('the E33 SH02 sequence: reject frees exactly one slot, cap 1', () => {
    // Before: one rejected render — counted 1, cap 1, machine blocked.
    // After: the same row releases, so the replacement may render once, and the
    // moment it lands in REVIEW the slot is occupied again.
    const rows = [{ status: 'REVISION' }];
    expect(rows.filter((r) => occupiesRegenSlot(r.status)).length).toBe(0);

    const afterRender = [{ status: 'REVISION' }, { status: 'REVIEW' }];
    expect(afterRender.filter((r) => occupiesRegenSlot(r.status)).length).toBe(1);
  });
});
