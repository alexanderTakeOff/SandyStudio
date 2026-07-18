// Keep-first / keep-best attempt selection (Director 2026-07-16). The EREF retry
// loop keeps the FIRST attempt clean enough (no CRITICAL, composite ≥ threshold) and
// on cap keeps the BEST-scoring attempt — never blindly the last, which prompt-drift
// often makes the worst. These pure helpers back that decision.
import { describe, it, expect } from 'vitest';
import {
  reviewComposite,
  attemptClearsKeepBar,
  pickBestAttempt,
  primaryAttemptVersion,
  KEEP_ATTEMPT_SCORE_THRESHOLD,
  type EREFReview,
  type EREFReviewIssue,
  type GenerationAttempt,
} from '@/lib/api/shot-reference';

function review(
  scores: Partial<{
    consistency: number;
    emotion: number;
    action: number;
    gag: number | null;
    style: number;
  }>,
  issues: Array<Pick<EREFReviewIssue, 'severity'>> = [],
): EREFReview {
  return {
    verdict: 'REGENERATE',
    consistency_score: scores.consistency ?? 100,
    emotion_alignment_score: scores.emotion ?? 100,
    action_clarity_score: scores.action ?? 100,
    gag_readability_score: scores.gag === undefined ? null : scores.gag,
    style_match_score: scores.style ?? 100,
    extraneous_objects: [],
    issues: issues.map((i) => ({
      area: 'character_identity',
      character_slug: null,
      severity: i.severity,
      description: 'x',
      fix_hint: 'y',
    })),
    suggested_prompt_v2: null,
    reviewer_model: 'test',
    reviewer_cost_usd: 0,
    at: '2026-07-16T00:00:00.000Z',
  };
}

const attempt = (
  version: number,
  composite_score: number,
  critical_count = 0,
): GenerationAttempt =>
  ({ version, composite_score, critical_count } as unknown as GenerationAttempt);

describe('reviewComposite', () => {
  it('averages the non-null 0-100 scores', () => {
    const r = review({ consistency: 80, emotion: 90, action: 100, gag: 70, style: 60 });
    expect(reviewComposite(r).composite).toBe((80 + 90 + 100 + 70 + 60) / 5);
  });

  it('excludes a null gag score (does not count it as 0)', () => {
    const r = review({ consistency: 90, emotion: 90, action: 90, gag: null, style: 90 });
    expect(reviewComposite(r).composite).toBe(90); // mean of the four present scores
  });

  it('counts CRITICAL-severity issues only', () => {
    const r = review({}, [{ severity: 'CRITICAL' }, { severity: 'MAJOR' }, { severity: 'CRITICAL' }]);
    expect(reviewComposite(r).criticalCount).toBe(2);
  });
});

describe('attemptClearsKeepBar', () => {
  it('keeps only when no CRITICAL AND composite ≥ threshold', () => {
    expect(attemptClearsKeepBar(KEEP_ATTEMPT_SCORE_THRESHOLD, 0)).toBe(true); // 85, clean
    expect(attemptClearsKeepBar(KEEP_ATTEMPT_SCORE_THRESHOLD - 1, 0)).toBe(false); // 84 → regen
    expect(attemptClearsKeepBar(100, 1)).toBe(false); // perfect score but a CRITICAL → regen
    expect(attemptClearsKeepBar(95, 0)).toBe(true);
  });
});

describe('pickBestAttempt', () => {
  it('picks the highest composite score', () => {
    const best = pickBestAttempt([attempt(1, 70), attempt(2, 92), attempt(3, 55)]);
    expect(best?.version).toBe(2);
  });

  it('resolves ties to the EARLIER attempt (prompt-drift makes later ones riskier)', () => {
    const best = pickBestAttempt([attempt(1, 88), attempt(2, 88), attempt(3, 80)]);
    expect(best?.version).toBe(1);
  });

  it('returns null for an empty list', () => {
    expect(pickBestAttempt([])).toBeNull();
  });

  it('does NOT default to the last attempt (the E29 SH03/SH05 bug)', () => {
    // last attempt (v3) is the worst — keep-best must not ship it.
    const best = pickBestAttempt([attempt(1, 90), attempt(2, 75), attempt(3, 60)]);
    expect(best?.version).toBe(1);
  });

  it('prefers a CLEAN lower-scoring attempt over a higher-scoring one with a CRITICAL (E30 SH13)', () => {
    // v1 outscores v2 but carries a CRITICAL; the clean v2 must win — a hard
    // defect is not worth a couple of composite points.
    const best = pickBestAttempt([attempt(1, 75.8, 1), attempt(2, 73.4, 0)]);
    expect(best?.version).toBe(2);
  });

  it('among equal critical-counts, the higher score wins', () => {
    const best = pickBestAttempt([attempt(1, 70, 2), attempt(2, 80, 2), attempt(3, 60, 2)]);
    expect(best?.version).toBe(2);
  });

  it('picks the fewest-CRITICAL attempt even when every attempt has one', () => {
    const best = pickBestAttempt([attempt(1, 90, 3), attempt(2, 60, 1), attempt(3, 70, 2)]);
    expect(best?.version).toBe(2);
  });
});

describe('primaryAttemptVersion — single source for the drawer badge + preview (2026-07-18)', () => {
  const history = [attempt(1, 90), attempt(2, 92), attempt(3, 60)]; // best = v2, last = v3

  it('a manual pick (selected_version) wins over everything', () => {
    expect(primaryAttemptVersion({ selected_version: 3, generation_history: history }, 2)).toBe(3);
  });

  it('with no manual pick, follows the shipped attempt (image_prompt.current_version), NOT the last', () => {
    // The keep-best regression: badge used to read `?? last` (v3) while the main
    // preview showed the shipped best (v2). They must agree on v2.
    expect(primaryAttemptVersion({ selected_version: null, generation_history: history }, 2)).toBe(2);
    expect(primaryAttemptVersion({ generation_history: history }, 2)).toBe(2);
  });

  it('falls back to the last attempt only when current_version is absent (legacy rows)', () => {
    expect(primaryAttemptVersion({ generation_history: history })).toBe(3);
  });

  it('returns null for an empty / absent history with no pointers', () => {
    expect(primaryAttemptVersion({ generation_history: [] })).toBeNull();
    expect(primaryAttemptVersion({})).toBeNull();
  });
});
