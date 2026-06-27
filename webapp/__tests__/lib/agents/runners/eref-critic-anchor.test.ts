// TD-49 Phase 2 P2.3 — Designer Critic anchor_pair structural validator tests.
// Mirrors animator-critic-anchors.test.ts pattern. validateAnchorPairStructure
// is a pure function that takes a Plan body and returns violation strings —
// each test exercises one role/reciprocity rule.

import { describe, expect, test } from 'vitest';
import { validateAnchorPairStructure } from '@/lib/agents/runners/episode-reference-critic';

// Canonical shot-id format S-E-SH (refactor 2026-06-26) — handoff refs must
// match it; the legacy compound SS-…-A…-SC…-SH… is now rejected as malformed.
const FULL_SHOT_ID_A = 'S15-E02-SH01';
const FULL_SHOT_ID_B = 'S15-E02-SH02';
const FULL_SHOT_ID_C = 'S15-E02-SH03';

describe('validateAnchorPairStructure — within-Plan structural checks', () => {
  test('legacy plan without anchor_pair field → no violations (back-compat)', () => {
    const v = validateAnchorPairStructure({
      shot_id: FULL_SHOT_ID_A,
      provider: { id: 'gpt-image-2' },
      size: { width: 1536, height: 1024 },
    });
    expect(v).toEqual([]);
  });

  test('anchor_pair absent (legacy SPC-ref_plan) → no violations', () => {
    const v = validateAnchorPairStructure({
      shot_id: FULL_SHOT_ID_A,
    });
    expect(v).toEqual([]);
  });

  test('null body → no violations (defensive)', () => {
    expect(validateAnchorPairStructure(null)).toEqual([]);
  });

  test('valid full pair: establishing start + final end → no violations', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {
        start: {
          role: 'establishing',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK preamble + WIDE shot of bedroom, Sandy entering frame.',
          rationale: 'First shot of episode — establishing.',
        },
        end: {
          role: 'final',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK preamble + MEDIUM Sandy reaches the mirror.',
          rationale: 'Last shot — no successor.',
        },
      },
    });
    expect(v).toEqual([]);
  });

  test('valid match-cut pair: shared start + shared end → no violations', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {
        start: {
          role: 'shared',
          handoff_link_to_shot_id: FULL_SHOT_ID_A,
          prompt: 'LAYOUT LOCK + MEDIUM picking up from SH01 end pose.',
          rationale: 'Match cut from prior shot.',
        },
        end: {
          role: 'shared',
          handoff_link_to_shot_id: FULL_SHOT_ID_C,
          prompt: 'LAYOUT LOCK + WIDE Sandy mid-step toward mirror.',
          rationale: 'Match cut to next shot.',
        },
      },
    });
    expect(v).toEqual([]);
  });

  test('valid hard-cut pair: cut_out → cut_in → no violations', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {
        start: {
          role: 'cut_in',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + CLOSE Sandy mid-action.',
          rationale: 'Hard cut into action.',
        },
        end: {
          role: 'cut_out',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + CLOSE Sandy hand reaching mirror.',
          rationale: 'Hard cut out to next scene.',
        },
      },
    });
    expect(v).toEqual([]);
  });

  test('valid start-only pair (omit end) → no violations', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {
        start: {
          role: 'establishing',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + WIDE bedroom view.',
        },
      },
    });
    expect(v).toEqual([]);
  });

  test('both sides absent → violation (empty anchor_pair is meaningless)', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {},
    });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/both start and end are absent/);
  });

  test('shared role missing handoff_link_to_shot_id → violation', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {
        start: {
          role: 'shared',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/role="shared" REQUIRES handoff_link_to_shot_id/);
  });

  test('establishing role with non-null handoff_link_to_shot_id → violation', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {
        start: {
          role: 'establishing',
          handoff_link_to_shot_id: FULL_SHOT_ID_B,
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/role="establishing" REQUIRES handoff_link_to_shot_id=null/);
  });

  test('final role with non-null handoff_link_to_shot_id → violation', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {
        end: {
          role: 'final',
          handoff_link_to_shot_id: FULL_SHOT_ID_C,
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/role="final" REQUIRES handoff_link_to_shot_id=null/);
  });

  test('invalid role enum (start side) → violation', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {
        start: {
          role: 'invented_role',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/not in allowed set/);
  });

  test('end-side role from start enum (cross-pollution) → violation', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {
        end: {
          role: 'establishing',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/not in allowed set/);
  });

  test('shared role with malformed shot_id (not matching regex) → violation', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {
        start: {
          role: 'shared',
          handoff_link_to_shot_id: 'SH02',
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/does not match shot_id format/);
  });

  test('missing prompt field → violation', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {
        start: {
          role: 'establishing',
          handoff_link_to_shot_id: null,
        },
      },
    });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/prompt: required non-empty string/);
  });

  test('empty prompt string → violation', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {
        start: {
          role: 'establishing',
          handoff_link_to_shot_id: null,
          prompt: '   ',
        },
      },
    });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/prompt: required non-empty string/);
  });

  test('non-string role → violation', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {
        start: {
          role: 42,
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/required string/);
  });

  test('anchor_pair not an object → no violations (defensive)', () => {
    expect(validateAnchorPairStructure({ anchor_pair: 'invalid' })).toEqual([]);
    expect(validateAnchorPairStructure({ anchor_pair: 42 })).toEqual([]);
  });

  test('multiple violations across both sides → all reported', () => {
    const v = validateAnchorPairStructure({
      anchor_pair: {
        start: {
          role: 'shared',
          handoff_link_to_shot_id: null,
          prompt: 'LAYOUT LOCK + ...',
        },
        end: {
          role: 'final',
          handoff_link_to_shot_id: FULL_SHOT_ID_B,
          prompt: 'LAYOUT LOCK + ...',
        },
      },
    });
    expect(v.length).toBe(2);
    expect(v.some((s) => s.includes('start') && s.includes('shared'))).toBe(true);
    expect(v.some((s) => s.includes('end') && s.includes('final'))).toBe(true);
  });
});
