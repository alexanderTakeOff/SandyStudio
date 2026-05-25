// TD-49 Phase 2 P2.3 — EREF Artist anchor_pair parser tests.
// parseAnchorPair extracts the Designer's anchor_pair block out of the Plan
// JSON body. Permissive parser — structural validity is the Critic's job
// (eref-critic-anchor.test.ts). This file just verifies the parser doesn't
// over-reject or silently drop data.

import { describe, expect, test } from 'vitest';
import { parseAnchorPair } from '@/lib/agents/runners/episode-references';

const SHOT_A = 'SS-S15-E02-A1-SC01-SH01';
const SHOT_B = 'SS-S15-E02-A1-SC01-SH02';

describe('parseAnchorPair — Plan body → Artist input', () => {
  test('absent anchor_pair field → null', () => {
    expect(parseAnchorPair({ shot_id: SHOT_A })).toBeNull();
  });

  test('anchor_pair as non-object → null (defensive)', () => {
    expect(parseAnchorPair({ anchor_pair: 'oops' })).toBeNull();
    expect(parseAnchorPair({ anchor_pair: 42 })).toBeNull();
    expect(parseAnchorPair({ anchor_pair: null })).toBeNull();
  });

  test('anchor_pair empty object (no sides) → null', () => {
    expect(parseAnchorPair({ anchor_pair: {} })).toBeNull();
  });

  test('full valid pair → both sides parsed', () => {
    const result = parseAnchorPair({
      anchor_pair: {
        start: {
          role: 'establishing',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + WIDE bedroom.',
          rationale: 'First shot.',
        },
        end: {
          role: 'shared',
          handoff_link_to_shot_id: SHOT_B,
          prompt: 'LAYOUT LOCK + MEDIUM Sandy reaches mirror.',
          rationale: 'Match cut to SH02.',
        },
      },
    });
    expect(result).not.toBeNull();
    expect(result!.start).toEqual({
      role: 'establishing',
      handoff_link_to_shot_id: null,
      prompt: 'LAYOUT LOCK + WIDE bedroom.',
      rationale: 'First shot.',
    });
    expect(result!.end).toEqual({
      role: 'shared',
      handoff_link_to_shot_id: SHOT_B,
      prompt: 'LAYOUT LOCK + MEDIUM Sandy reaches mirror.',
      rationale: 'Match cut to SH02.',
    });
  });

  test('start-only pair → start populated, end null', () => {
    const result = parseAnchorPair({
      anchor_pair: {
        start: {
          role: 'establishing',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(result).not.toBeNull();
    expect(result!.start?.role).toBe('establishing');
    expect(result!.end).toBeNull();
  });

  test('end-only pair → end populated, start null', () => {
    const result = parseAnchorPair({
      anchor_pair: {
        end: {
          role: 'final',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(result).not.toBeNull();
    expect(result!.start).toBeNull();
    expect(result!.end?.role).toBe('final');
  });

  test('side missing prompt → dropped', () => {
    const result = parseAnchorPair({
      anchor_pair: {
        start: { role: 'establishing', handoff_link_to_shot_id: null },
        end: {
          role: 'final',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(result).not.toBeNull();
    expect(result!.start).toBeNull();
    expect(result!.end?.role).toBe('final');
  });

  test('side with invalid role enum → dropped (not throwing)', () => {
    const result = parseAnchorPair({
      anchor_pair: {
        start: {
          role: 'bogus_role',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + ...',
        },
        end: {
          role: 'final',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(result).not.toBeNull();
    expect(result!.start).toBeNull();
    expect(result!.end?.role).toBe('final');
  });

  test('end side with start-only role → dropped (cross-pollution rejected)', () => {
    const result = parseAnchorPair({
      anchor_pair: {
        end: {
          role: 'cut_in',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(result).toBeNull(); // end-only invalid → entire pair drops
  });

  test('all sides invalid → null result', () => {
    const result = parseAnchorPair({
      anchor_pair: {
        start: { role: 'bogus' },
        end: { role: 'also_bogus' },
      },
    });
    expect(result).toBeNull();
  });

  test('rationale optional — absence is fine', () => {
    const result = parseAnchorPair({
      anchor_pair: {
        start: {
          role: 'establishing',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(result?.start?.rationale).toBeNull();
  });

  test('handoff_link_to_shot_id whitespace-only → coerced to null', () => {
    const result = parseAnchorPair({
      anchor_pair: {
        start: {
          role: 'shared',
          handoff_link_to_shot_id: '   ',
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    // Parser tolerates this (returns null); Critic's structural validator
    // catches the actual reciprocity violation.
    expect(result?.start?.handoff_link_to_shot_id).toBeNull();
  });

  test('handoff_link_to_shot_id with extra whitespace → trimmed', () => {
    const result = parseAnchorPair({
      anchor_pair: {
        start: {
          role: 'shared',
          handoff_link_to_shot_id: `  ${SHOT_B}  `,
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(result?.start?.handoff_link_to_shot_id).toBe(SHOT_B);
  });
});
