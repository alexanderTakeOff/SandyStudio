import { describe, it, expect } from 'vitest';

import {
  isPersistentBillingFailure,
  classifyProviderFailure,
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
