// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/agents/runners/animator-critic-duration-lock.test.ts
// V14 (2026-06-04): the deterministic duration-lock. The Critic LLM only
// range-checked duration, letting the Animator stretch the animatic's 2s to 5s
// "for comedic readability" and launder it as a fake Director hard-contract
// (SH03/SH04). This covers the LLM-independent gate that catches it.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import { checkDurationLock } from '@/lib/agents/runners/animator-critic';

const SHOT = 'SS-S15-E02-A2-SC03-SH03';

describe('checkDurationLock (V14 duration-lock)', () => {
  it('passes when plan duration equals the locked animatic duration', () => {
    expect(checkDurationLock({ duration_seconds: 2 }, 2, [], SHOT)).toBeNull();
  });

  it('flags a violation when the Animator overrides the locked duration (2s → 5s)', () => {
    const v = checkDurationLock({ duration_seconds: 5 }, 2, [], SHOT);
    expect(v).toContain('duration_seconds=5');
    expect(v).toContain('provider-clamped animatic timing=2');
    expect(v).toContain(SHOT);
  });

  it('is waived by an explicit Director duration override', () => {
    const overrides = [{ check: 'duration', rationale: 'Director wants a longer hold' }];
    expect(checkDurationLock({ duration_seconds: 5 }, 2, overrides, SHOT)).toBeNull();
  });

  it('skips (fail-open) when the locked duration is unknown (no approved animatic)', () => {
    expect(checkDurationLock({ duration_seconds: 5 }, null, [], SHOT)).toBeNull();
  });

  it('skips when the plan has no usable duration_seconds', () => {
    expect(checkDurationLock({}, 2, [], SHOT)).toBeNull();
    expect(checkDurationLock({ duration_seconds: 'oops' as unknown as number }, 2, [], SHOT)).toBeNull();
  });

  it('tolerates sub-second rounding (2.0 vs 2)', () => {
    expect(checkDurationLock({ duration_seconds: 2.0 }, 2, [], SHOT)).toBeNull();
  });

  // 2026-06-16 — render-duration model: the animatic stores the creative CUT
  // (may be sub-floor); the Plan's duration_seconds is the RENDER duration, which
  // must equal that cut clamped into the provider's [min,max]. A 2s cut on Seedance
  // (floor 4) ⇒ render 4s; the 4s clip is trimmed back to 2s downstream at stitch.
  const seedance = { provider: { id: 'seedance-standard' } };

  it('passes when the render duration equals the provider-clamped cut (cut 2s, Seedance floor 4 → render 4s)', () => {
    expect(
      checkDurationLock({ ...seedance, duration_seconds: 4 }, 2, [], SHOT),
    ).toBeNull();
  });

  it('flags a sub-floor render duration written into the Plan (2s on Seedance floor 4)', () => {
    const v = checkDurationLock({ ...seedance, duration_seconds: 2 }, 2, [], SHOT);
    expect(v).toContain('duration_seconds=2');
    expect(v).toContain('provider-clamped animatic timing=4');
    expect(v).toContain('animatic cut=2');
  });
});
