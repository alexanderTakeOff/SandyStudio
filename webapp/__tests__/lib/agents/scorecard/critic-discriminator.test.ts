// ──────────────────────────────────────────────────────────────────────────────
// Critic discriminator — calibration-zone policy tests.
// The Director's trap (2026-07-14): self-improvement must NOT become a 7th human
// touch. Reversible calibrations (rubric wording / prompt / tier) → auto_safe;
// irreversible producer/creative training → escalate; healthy loops → none.
// These tests lock that mapping so a future refactor can't silently start
// escalating safe changes (adds touches) or auto-applying risky ones.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import {
  proposeCalibration,
  type PerCriticVerdict,
  type CriticVerdictClass,
} from '@/lib/agents/scorecard/critic-discriminator';

function verdict(
  klass: CriticVerdictClass,
  over: Partial<PerCriticVerdict> = {},
): PerCriticVerdict {
  return {
    critic: 'EXEC-CREAD',
    reviewKinds: ['storyboard'],
    totalRuns: 4,
    reviseCount: klass === 'healthy' ? 0 : 2,
    verdict: klass,
    repeatedPoints: [],
    flaggedPoints: [],
    evidence: 'test',
    ...over,
  };
}

describe('proposeCalibration — zone policy', () => {
  it('healthy critic proposes nothing (no touch)', () => {
    expect(proposeCalibration(verdict('healthy')).zone).toBe('none');
  });

  it('producer_weak_fixable is a working loop — no calibration', () => {
    expect(proposeCalibration(verdict('producer_weak_fixable')).zone).toBe('none');
  });

  it('critic_too_hard is REVERSIBLE → auto_safe (applied without Director)', () => {
    const p = proposeCalibration(verdict('critic_too_hard', { flaggedPoints: ['R03'] }));
    expect(p.zone).toBe('auto_safe');
    expect(p.action).toMatch(/soften/i);
  });

  it('critic_inconsistent is REVERSIBLE → auto_safe (stabilise prompt)', () => {
    expect(proposeCalibration(verdict('critic_inconsistent')).zone).toBe('auto_safe');
  });

  it('producer_gap is a CREATIVE/training change → escalate to Director', () => {
    const p = proposeCalibration(verdict('producer_gap', { repeatedPoints: ['R02', 'R06'] }));
    expect(p.zone).toBe('escalate');
    expect(p.action).toContain('R02');
    expect(p.action).toContain('R06');
  });

  it('every produced proposal names its critic', () => {
    for (const k of [
      'healthy',
      'producer_weak_fixable',
      'critic_too_hard',
      'critic_inconsistent',
      'producer_gap',
    ] as CriticVerdictClass[]) {
      expect(proposeCalibration(verdict(k)).critic).toBe('EXEC-CREAD');
    }
  });
});
