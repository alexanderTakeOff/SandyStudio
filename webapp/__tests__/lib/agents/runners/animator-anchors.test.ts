// TD-49 Phase 2 P2.1 — Anchor chain schema extractor/validator tests.
//
// Covers extractAnchorChain + checkAnchorPairCompatibility helpers that
// guard the new VANIM Plan body fields (start_anchor / end_anchor / roles /
// handoff_link_to / opening_camera_motion / closing_static_hold_seconds).
//
// Validation philosophy: structurally invalid Plans throw AnimatorError so
// callers (Critic / runner / approve-route) can REJECT explicitly. Legacy
// plans without these fields return all-null and fall through to the
// existing single-reference path.

import { describe, expect, test } from 'vitest';
import {
  extractAnchorChain,
  checkAnchorPairCompatibility,
  type VanimEndAnchor,
  type VanimStartAnchor,
} from '@/lib/agents/runners/animator';

const UUID_A = '11111111-2222-3333-4444-555555555555';
const UUID_B = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const UUID_C = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

describe('extractAnchorChain — anchor-chain parser (Phase 2 P2.1)', () => {
  test('returns all-null for legacy plan without anchor fields', () => {
    const parsed = extractAnchorChain({
      shot_id: 'SH01',
      provider: { id: 'seedance-fast' },
      end_image: { eref_asset_id: UUID_A, rationale: 'legacy' },
    });
    expect(parsed.start_anchor).toBeNull();
    expect(parsed.end_anchor).toBeNull();
    expect(parsed.opening_camera_motion).toBeNull();
    expect(parsed.closing_static_hold_seconds).toBeNull();
  });

  test('returns all-null for non-object body', () => {
    expect(extractAnchorChain(null).start_anchor).toBeNull();
    expect(extractAnchorChain('not-an-object').end_anchor).toBeNull();
    expect(extractAnchorChain(42).opening_camera_motion).toBeNull();
  });

  test('parses establishing start_anchor + final end_anchor for episode bookends', () => {
    const parsed = extractAnchorChain({
      start_anchor: {
        asset_id: UUID_A,
        role: 'establishing',
        handoff_link_to: null,
        rationale: 'first shot of episode',
      },
      end_anchor: {
        asset_id: UUID_B,
        role: 'final',
        handoff_link_to: null,
      },
    });
    expect(parsed.start_anchor).toEqual({
      asset_id: UUID_A,
      role: 'establishing',
      handoff_link_to: null,
      rationale: 'first shot of episode',
    });
    expect(parsed.end_anchor).toEqual({
      asset_id: UUID_B,
      role: 'final',
      handoff_link_to: null,
    });
  });

  test('parses shared start_anchor with reciprocal handoff_link_to', () => {
    const parsed = extractAnchorChain({
      start_anchor: {
        asset_id: UUID_A,
        role: 'shared',
        handoff_link_to: UUID_B,
      },
    });
    expect(parsed.start_anchor?.role).toBe('shared');
    expect(parsed.start_anchor?.handoff_link_to).toBe(UUID_B);
  });

  test('throws when start_anchor.role="shared" but handoff_link_to=null', () => {
    expect(() =>
      extractAnchorChain({
        start_anchor: { asset_id: UUID_A, role: 'shared', handoff_link_to: null },
      }),
    ).toThrow(/start_anchor.role="shared" requires handoff_link_to/);
  });

  test('throws when start_anchor.role="establishing" carries non-null handoff_link_to', () => {
    expect(() =>
      extractAnchorChain({
        start_anchor: {
          asset_id: UUID_A,
          role: 'establishing',
          handoff_link_to: UUID_B,
        },
      }),
    ).toThrow(/role="establishing" must have handoff_link_to=null/);
  });

  test('throws on unknown start_anchor.role', () => {
    expect(() =>
      extractAnchorChain({
        start_anchor: { asset_id: UUID_A, role: 'random_garbage', handoff_link_to: null },
      }),
    ).toThrow(/start_anchor.role invalid/);
  });

  test('throws on unknown end_anchor.role', () => {
    expect(() =>
      extractAnchorChain({
        end_anchor: { asset_id: UUID_A, role: 'mystery', handoff_link_to: null },
      }),
    ).toThrow(/end_anchor.role invalid/);
  });

  test('parses opening_camera_motion when populated', () => {
    const parsed = extractAnchorChain({
      opening_camera_motion: {
        kind: 'pan',
        direction: 'left',
        prose: 'whip pan left as Sandy turns head',
      },
    });
    expect(parsed.opening_camera_motion).toEqual({
      kind: 'pan',
      direction: 'left',
      prose: 'whip pan left as Sandy turns head',
    });
  });

  test('opening_camera_motion returns null when all three subfields are absent/invalid', () => {
    expect(
      extractAnchorChain({
        opening_camera_motion: { kind: null, direction: null, prose: null },
      }).opening_camera_motion,
    ).toBeNull();
    expect(
      extractAnchorChain({
        opening_camera_motion: { kind: 'unknown_kind', direction: null, prose: null },
      }).opening_camera_motion,
    ).toBeNull();
  });

  test('closing_static_hold_seconds extracted only when finite non-negative number', () => {
    expect(extractAnchorChain({ closing_static_hold_seconds: 0.5 }).closing_static_hold_seconds).toBe(0.5);
    expect(extractAnchorChain({ closing_static_hold_seconds: 0 }).closing_static_hold_seconds).toBe(0);
    expect(extractAnchorChain({ closing_static_hold_seconds: -0.5 }).closing_static_hold_seconds).toBeNull();
    expect(extractAnchorChain({ closing_static_hold_seconds: 'oops' }).closing_static_hold_seconds).toBeNull();
    expect(extractAnchorChain({ closing_static_hold_seconds: NaN }).closing_static_hold_seconds).toBeNull();
  });
});

describe('checkAnchorPairCompatibility — boundary role matrix (Phase 2 P2.1)', () => {
  function makeStart(role: VanimStartAnchor['role'], assetId = UUID_A, link: string | null = null): VanimStartAnchor {
    return { asset_id: assetId, role, handoff_link_to: link };
  }
  function makeEnd(role: VanimEndAnchor['role'], assetId = UUID_B, link: string | null = null): VanimEndAnchor {
    return { asset_id: assetId, role, handoff_link_to: link };
  }

  test('no anchors on both sides → null (legacy compatible)', () => {
    expect(checkAnchorPairCompatibility(null, null)).toBeNull();
  });

  test('match-cut shared↔shared with reciprocal links → compatible', () => {
    const prevEnd = makeEnd('shared', UUID_A, UUID_B); // prior.end.asset=A, points to next.start.B
    const nextStart = makeStart('shared', UUID_B, UUID_A); // next.start.asset=B, points to prior.end.A
    expect(checkAnchorPairCompatibility(prevEnd, nextStart)).toBeNull();
  });

  test('match-cut handoff_link_to mismatch on prior side → violation', () => {
    const prevEnd = makeEnd('shared', UUID_A, UUID_C);
    const nextStart = makeStart('shared', UUID_B, UUID_A);
    expect(checkAnchorPairCompatibility(prevEnd, nextStart)).toMatch(
      /prior end_anchor.handoff_link_to=.* does not point to next start_anchor.asset_id/,
    );
  });

  test('match-cut handoff_link_to mismatch on next side → violation', () => {
    const prevEnd = makeEnd('shared', UUID_A, UUID_B);
    const nextStart = makeStart('shared', UUID_B, UUID_C);
    expect(checkAnchorPairCompatibility(prevEnd, nextStart)).toMatch(
      /next start_anchor.handoff_link_to=.* does not point to prior end_anchor.asset_id/,
    );
  });

  test('shared end paired with cut_in start → violation', () => {
    const prevEnd = makeEnd('shared', UUID_A, UUID_B);
    const nextStart = makeStart('cut_in', UUID_B);
    expect(checkAnchorPairCompatibility(prevEnd, nextStart)).toMatch(/boundary mismatch.*end_anchor.role="shared"/);
  });

  test('cut_out → cut_in (action cut) → compatible', () => {
    expect(
      checkAnchorPairCompatibility(makeEnd('cut_out'), makeStart('cut_in')),
    ).toBeNull();
  });

  test('cut_out → shared mismatch → violation', () => {
    expect(
      checkAnchorPairCompatibility(makeEnd('cut_out'), makeStart('shared', UUID_B, UUID_A)),
    ).toMatch(/boundary mismatch/);
  });

  test('final → anything next → violation (terminal shot expected)', () => {
    expect(
      checkAnchorPairCompatibility(makeEnd('final'), makeStart('cut_in')),
    ).toMatch(/end_anchor.role="final" has no downstream peer/);
  });

  test('null prev with shared next → violation', () => {
    expect(checkAnchorPairCompatibility(null, makeStart('shared', UUID_B, UUID_A))).toMatch(
      /next shot start_anchor.role="shared" but prior shot has no end_anchor/,
    );
  });

  test('shared prev with null next → violation', () => {
    expect(checkAnchorPairCompatibility(makeEnd('shared', UUID_A, UUID_B), null)).toMatch(
      /prior shot end_anchor.role="shared" but next shot has no start_anchor/,
    );
  });
});
