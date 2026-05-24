// ──────────────────────────────────────────────────────────────────────────────
// Tests for TD-38 — Reviewer Plan-blindness fix (q7a sprint follow-up).
// Verifies formatPlanIntentText renders the Designer Plan body as the
// reviewer's source of truth, replacing the legacy storyboard `expected_gag`.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import { formatPlanIntentText } from '@/lib/agents/runners/eref-check';
import type { ShotTestPlan } from '@/lib/api/shot-reference';

function makeTestPlan(overrides: Partial<ShotTestPlan> = {}): ShotTestPlan {
  return {
    characters: [
      {
        bible_slug: 'sandy_hourglass',
        role_in_shot: 'subject',
        expected_emotion: 'delighted hope',
        expected_action: 'one mitten finger raised',
        identity_anchor_asset_id: 'sandy-bible-locked-1',
      },
      {
        bible_slug: 'anvil',
        role_in_shot: 'co-star',
        expected_emotion: 'smug indifference',
        expected_action: 'extends one rubber-hose finger',
        identity_anchor_asset_id: 'anvil-bible-locked-1',
      },
    ],
    location_anchor_asset_id: 'loc-asset-1',
    style_anchor_asset_id: 'style-asset-1',
    expected_gag: 'OLD storyboard gag — should not appear in plan-intent output',
    shot_role: 'gag',
    ...overrides,
  };
}

describe('formatPlanIntentText — TD-38', () => {
  it('renders Plan prompt verbatim as the source of truth', () => {
    const planPrompt =
      'Tight close-up: Sandy LEFT, vanity CENTRE, Anvil RIGHT. Anvil finger on vanity corner.';
    const out = formatPlanIntentText({
      candidateImageB64: 'x',
      testPlan: makeTestPlan(),
      bibleRefs: [],
      episodeCode: 'SS-S15-E01',
      shotId: 'SS-S15-E01-A2-SC09-SH19',
      planIntent: { prompt: planPrompt },
    });
    expect(out).toContain(planPrompt);
    expect(out).toContain('Designer Plan specification');
    expect(out).toContain('SOURCE OF TRUTH');
  });

  it('does NOT render the legacy storyboard `expected_gag` line in plan-driven mode', () => {
    // This is the regression-lock: if formatPlanIntentText ever starts
    // leaking testPlan.expected_gag into the reviewer's spec, the
    // Reviewer Plan-blindness bug returns.
    const out = formatPlanIntentText({
      candidateImageB64: 'x',
      testPlan: makeTestPlan(),
      bibleRefs: [],
      episodeCode: 'SS-S15-E01',
      shotId: 'SS-S15-E01-A2-SC09-SH22',
      planIntent: { prompt: 'Sandy whole — no puddle, no compression.' },
    });
    expect(out).not.toContain('OLD storyboard gag');
    expect(out).not.toMatch(/^expected_gag:/m);
    expect(out).toContain('Sandy whole — no puddle');
  });

  it('renders negative constraints when present', () => {
    const out = formatPlanIntentText({
      candidateImageB64: 'x',
      testPlan: makeTestPlan(),
      bibleRefs: [],
      episodeCode: 'SS-S15-E01',
      shotId: 'SS-S15-E01-A2-SC09-SH19',
      planIntent: {
        prompt: 'Plan prompt body.',
        negativeList: [
          'no characters on the same side of the frame',
          'no establishing wide of the bedroom as primary composition',
        ],
      },
    });
    expect(out).toContain('Negative constraints');
    expect(out).toContain('no characters on the same side of the frame');
    expect(out).toContain('no establishing wide of the bedroom as primary composition');
  });

  it('skips the negative constraints section when list is empty or absent', () => {
    const out = formatPlanIntentText({
      candidateImageB64: 'x',
      testPlan: makeTestPlan(),
      bibleRefs: [],
      episodeCode: 'SS-S15-E01',
      shotId: 'SS-S15-E01-A2-SC09-SH19',
      planIntent: { prompt: 'Plan prompt body.' },
    });
    expect(out).not.toContain('Negative constraints');
  });

  it('preserves character roster from testPlan for identity anchoring', () => {
    const out = formatPlanIntentText({
      candidateImageB64: 'x',
      testPlan: makeTestPlan(),
      bibleRefs: [],
      episodeCode: 'SS-S15-E01',
      shotId: 'SS-S15-E01-A2-SC09-SH19',
      planIntent: { prompt: 'Plan body.' },
    });
    expect(out).toContain('sandy_hourglass');
    expect(out).toContain('anvil');
    expect(out).toContain('role: subject');
    expect(out).toContain('role: co-star');
    // But identity anchoring section must NOT leak action/emotion expectations
    // (those come from Plan body now, not testPlan).
    expect(out).not.toContain('expected_emotion:');
    expect(out).not.toContain('expected_action:');
  });

  it('handles empty character roster (pure environment shot)', () => {
    const out = formatPlanIntentText({
      candidateImageB64: 'x',
      testPlan: makeTestPlan({ characters: [] }),
      bibleRefs: [],
      episodeCode: 'SS-S15-E01',
      shotId: 'SS-S15-E01-A2-SC09-SH20',
      planIntent: { prompt: 'Cracked wall close-up, vanity edge at left.' },
    });
    expect(out).toContain('(none — pure environment shot)');
  });

  it('falls back to legacy formatter when planIntent is undefined (defensive)', () => {
    // This guards the «never called without planIntent» contract — if a
    // future caller forgets to gate, we fall back to legacy rendering
    // rather than throwing or rendering an empty spec.
    const out = formatPlanIntentText({
      candidateImageB64: 'x',
      testPlan: makeTestPlan({
        expected_gag: 'fallback gag from storyboard',
      }),
      bibleRefs: [],
      episodeCode: 'SS-S15-E01',
      shotId: 'SS-S15-E01-A2-SC09-SH19',
      // planIntent intentionally omitted
    });
    expect(out).toContain('expected_gag: fallback gag from storyboard');
    expect(out).not.toContain('Designer Plan specification');
  });

  it('includes shot_role + episode/shot identity headers (parity with legacy formatter)', () => {
    const out = formatPlanIntentText({
      candidateImageB64: 'x',
      testPlan: makeTestPlan({ shot_role: 'punchline' }),
      bibleRefs: [],
      episodeCode: 'SS-S15-E01',
      shotId: 'SS-S15-E01-A2-SC09-SH20',
      planIntent: { prompt: 'plan body' },
    });
    expect(out).toContain('SS-S15-E01-A2-SC09-SH20');
    expect(out).toContain('SS-S15-E01');
    expect(out).toContain('shot_role: punchline');
  });
});
