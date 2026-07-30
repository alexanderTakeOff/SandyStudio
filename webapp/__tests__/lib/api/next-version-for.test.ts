// D10 (2026-07-30) — one numbering rule for every writer of a versioned sub-doc.
//
// Two writers had drifted apart. `regenerate-image` numbered from the highest
// version ever recorded (learned the hard way on E30 SH44). `bible-author`
// hardcoded 1 AND replaced the history, so the revision path introduced that
// same evening destroyed what it revised: the first version of the S20 maw
// article was asked for an hour later and no longer existed anywhere.

import { describe, it, expect } from 'vitest';
import { nextVersionFor } from '@/lib/api/series-bible';

describe('nextVersionFor', () => {
  it('starts at 1 when there is nothing yet', () => {
    expect(nextVersionFor(undefined)).toBe(1);
    expect(nextVersionFor(null)).toBe(1);
    expect(nextVersionFor({ history: [] })).toBe(1);
  });

  it('follows the history', () => {
    expect(nextVersionFor({ current_version: 1, history: [{ version: 1 }] })).toBe(2);
    expect(
      nextVersionFor({ current_version: 3, history: [{ version: 1 }, { version: 2 }, { version: 3 }] }),
    ).toBe(4);
  });

  it('takes the HIGHEST version, not the current pointer — the E30 SH44 case', () => {
    // `current` points at an older entry after a restore. Numbering from it
    // would mint a second v2, and every reader resolves by `find`, so the UI
    // would keep showing the old image while the fresh one hid behind the
    // duplicate number.
    expect(nextVersionFor({ current_version: 1, history: [{ version: 1 }, { version: 2 }] })).toBe(3);
  });

  it('survives entries with no version at all', () => {
    expect(nextVersionFor({ history: [{}, { version: 2 }] })).toBe(3);
    expect(nextVersionFor({ current_version: null, history: [{ version: null }] })).toBe(1);
  });
});
