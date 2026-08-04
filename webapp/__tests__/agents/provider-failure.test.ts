import { describe, it, expect } from 'vitest';

import {
  isPersistentBillingFailure,
  classifyProviderFailure,
  isPlanAnchorStaleFailure,
  isTerminalAgentFailure,
} from '@/lib/agents/provider-failure';

describe('provider-failure — isPersistentBillingFailure', () => {
  it('detects fal balance lock (reused from isFalBalanceLock)', () => {
    expect(
      isPersistentBillingFailure(
        'User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.',
      ),
    ).toBe(true);
  });

  it('detects OpenAI billing_hard_limit_reached', () => {
    expect(
      isPersistentBillingFailure('429 billing_hard_limit_reached: Billing hard limit has been reached'),
    ).toBe(true);
  });

  it('detects OpenAI insufficient_quota', () => {
    expect(
      isPersistentBillingFailure(
        'You exceeded your current quota, please check your plan and billing details. code: insufficient_quota',
      ),
    ).toBe(true);
  });

  it('detects Anthropic low credit balance', () => {
    expect(
      isPersistentBillingFailure('Your credit balance is too low to access the Anthropic API.'),
    ).toBe(true);
  });

  it('survives error-wrapping (signature buried in a wrapped message)', () => {
    expect(
      isPersistentBillingFailure(
        'MultiVideoGenError: provider seedance failed — fal submit failed (403) — {"detail":"User is locked. Reason: Exhausted balance."}',
      ),
    ).toBe(true);
  });

  it('does NOT flag a transient network / 5xx failure', () => {
    expect(isPersistentBillingFailure('fal status poll failed (503) — upstream timeout')).toBe(false);
    expect(isPersistentBillingFailure('ECONNRESET socket hang up')).toBe(false);
    expect(isPersistentBillingFailure('fal request polling timed out after 720s')).toBe(false);
  });

  it('handles null / empty', () => {
    expect(isPersistentBillingFailure(null)).toBe(false);
    expect(isPersistentBillingFailure('')).toBe(false);
    expect(isPersistentBillingFailure(undefined)).toBe(false);
  });
});

describe('provider-failure — classifyProviderFailure', () => {
  it('classifies billing as persistent_billing', () => {
    expect(classifyProviderFailure('insufficient_quota')).toBe('persistent_billing');
  });

  it('classifies everything else as transient', () => {
    expect(classifyProviderFailure('Gate failed for EXEC-SB')).toBe('transient');
    expect(classifyProviderFailure('schema mismatch')).toBe('transient');
  });
});

describe('provider-failure — isPlanAnchorStaleFailure', () => {
  it('detects the guard message as the runner throws it (S20-E01 shape)', () => {
    const msg =
      'EXEC-EREF: PLAN_ANCHOR_STALE: Plan 9039b9dd-51a2-4c2a-8ffb-2a74b074b6cd (shot S20-E01-SH06) ' +
      'references continuity anchors that are no longer current:\n' +
      '  - spatial_same_location: plan anchor 0317947e (anchor_no_longer_approved)';
    expect(isPlanAnchorStaleFailure(msg)).toBe(true);
  });

  it('does NOT flag an unrelated failure', () => {
    expect(isPlanAnchorStaleFailure('fal status poll failed (503)')).toBe(false);
    expect(isPlanAnchorStaleFailure(null)).toBe(false);
    expect(isPlanAnchorStaleFailure('')).toBe(false);
  });
});

describe('provider-failure — isTerminalAgentFailure', () => {
  it('covers BOTH walls: billing and stale anchor', () => {
    expect(isTerminalAgentFailure('insufficient_quota')).toBe(true);
    expect(isTerminalAgentFailure('EXEC-EREF: PLAN_ANCHOR_STALE: Plan … (shot SH06)')).toBe(true);
  });

  it('leaves a recoverable failure retryable', () => {
    expect(isTerminalAgentFailure('ECONNRESET socket hang up')).toBe(false);
    expect(isTerminalAgentFailure('fal request polling timed out after 720s')).toBe(false);
  });
});
