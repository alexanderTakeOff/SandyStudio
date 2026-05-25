// TD-49 Phase 2 P2.5 — Critic anchor-chain validator + 3-tier verdict tests.

import { describe, expect, test } from 'vitest';
import { validateAnchorChainStructure } from '@/lib/agents/runners/animator-critic';

const UUID_A = '11111111-2222-3333-4444-555555555555';
const UUID_B = '66666666-7777-8888-9999-aaaaaaaaaaaa';

describe('validateAnchorChainStructure — within-Plan structural checks', () => {
  test('legacy plan without anchor fields → no violations (back-compat)', () => {
    const v = validateAnchorChainStructure({
      shot_id: 'SH01',
      provider: { id: 'seedance-fast' },
      duration_seconds: 4,
      end_image: { eref_asset_id: UUID_A, rationale: 'legacy' },
    });
    expect(v).toEqual([]);
  });

  test('valid match-cut pair → no violations', () => {
    const v = validateAnchorChainStructure({
      duration_seconds: 5,
      start_anchor: {
        asset_id: UUID_A,
        role: 'shared',
        handoff_link_to: UUID_B,
      },
      end_anchor: {
        asset_id: UUID_B,
        role: 'shared',
        handoff_link_to: UUID_A,
      },
      opening_camera_motion: { kind: 'pan', direction: 'left', prose: 'whip' },
      closing_static_hold_seconds: 0.4,
    });
    expect(v).toEqual([]);
  });

  test('shared role missing reciprocal handoff_link_to → violation', () => {
    const v = validateAnchorChainStructure({
      start_anchor: {
        asset_id: UUID_A,
        role: 'shared',
        handoff_link_to: null,
      },
    });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/anchor-chain structural violation/);
    expect(v[0]).toMatch(/handoff_link_to/);
  });

  test('establishing role with non-null handoff_link_to → violation', () => {
    const v = validateAnchorChainStructure({
      start_anchor: {
        asset_id: UUID_A,
        role: 'establishing',
        handoff_link_to: UUID_B,
      },
    });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/must have handoff_link_to=null/);
  });

  test('unknown role enum value → violation', () => {
    const v = validateAnchorChainStructure({
      end_anchor: { asset_id: UUID_A, role: 'invalid_role', handoff_link_to: null },
    });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/role invalid/);
  });

  test('duration too short for closing_static_hold + opening_motion → violation', () => {
    const v = validateAnchorChainStructure({
      duration_seconds: 0.2,
      closing_static_hold_seconds: 0.5,
      opening_camera_motion: { kind: 'pan', direction: 'in', prose: 'zoom-in' },
    });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/duration_seconds=0.2 too short/);
  });

  test('duration sufficient → no violation', () => {
    const v = validateAnchorChainStructure({
      duration_seconds: 5,
      closing_static_hold_seconds: 0.5,
      opening_camera_motion: { kind: 'pan', direction: 'in', prose: 'zoom-in' },
    });
    expect(v).toEqual([]);
  });

  test('null planBody → no violations (defensive)', () => {
    expect(validateAnchorChainStructure(null)).toEqual([]);
  });
});

// ── 3-tier verdict parsing ────────────────────────────────────────────────

describe('AnimatorCriticVerdict — PASS_WITH_UNCERTAINTY tier (P2.5)', () => {
  // We can't exercise the full runAnimatorCritic flow without spinning up
  // Anthropic + supabase, but the verdict type and parseVerdict helper are
  // unit-testable through the exported type and a synthetic body.
  test('typing: PASS_WITH_UNCERTAINTY is part of the verdict union', () => {
    // Compile-time check — this would fail tsc if union didn't include it.
    const v: import('@/lib/agents/runners/animator-critic').AnimatorCriticVerdict =
      'PASS_WITH_UNCERTAINTY';
    expect(v).toBe('PASS_WITH_UNCERTAINTY');
  });
});
