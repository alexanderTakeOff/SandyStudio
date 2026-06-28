// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/provider-failure.ts
// S2 / F2-F3 — classify a provider failure as PERSISTENT-BILLING vs TRANSIENT.
//
// Why this matters (the $100 loop): a provider that is out of funds / over quota
// returns the SAME terminal error on every retry. The factory catch emits
// `agent_failed` → that wakes Polina's auto-react → she re-fires the agent → it
// hits the SAME billing wall → `agent_failed` → … a cross-wake spend spiral.
//
// The cure is NOT "count all FAILED toward caps" — a TRANSIENT fail (network
// blip, 5xx) must stay recoverable. The cure is to DISTINGUISH the persistent
// billing/quota wall and ESCALATE it to the human Director WITHOUT re-feeding the
// auto-react loop (the caller suppresses the wake for this class).
//
// Detection is by TEXT signature (provider-agnostic, survives error-wrapping the
// same way isFalBalanceLock does) so it works regardless of which provider SDK
// threw and how the factory wrapped it.
// ──────────────────────────────────────────────────────────────────────────────

import { isFalBalanceLock } from './providers/fal-seedance';

/**
 * Billing / quota wall signatures across providers. fal is covered by
 * isFalBalanceLock; these add OpenAI + Anthropic + generic phrasings. All are
 * TERMINAL — retrying or re-dispatching just burns more budget against a wall.
 */
const BILLING_LOCK_PATTERNS: ReadonlyArray<RegExp> = [
  // OpenAI: 429 insufficient_quota / hard billing limit.
  /billing_hard_limit_reached/i,
  /insufficient_quota/i,
  /exceeded your current quota/i,
  /billing.{0,20}(hard )?limit/i,
  // Anthropic: low credit balance (402 / message).
  /credit balance is too low/i,
  /your account.{0,30}(insufficient|no) (funds|credit)/i,
  // Generic payment-required phrasings.
  /payment required/i,
  /quota exceeded/i,
];

/**
 * True when the failure text is a PERSISTENT billing/quota wall (out of funds,
 * over quota, hard billing limit) — terminal across retries and re-dispatch.
 * Reuses isFalBalanceLock so the fal signatures stay single-sourced.
 */
export function isPersistentBillingFailure(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  if (isFalBalanceLock(message)) return true;
  return BILLING_LOCK_PATTERNS.some((re) => re.test(message));
}

export type ProviderFailureClass = 'persistent_billing' | 'transient';

/**
 * Classify a provider failure message. `persistent_billing` → escalate to the
 * human Director and do NOT re-feed the auto-react loop; `transient` → today's
 * normal failure path (recoverable, may re-fire within caps).
 */
export function classifyProviderFailure(
  message: string | null | undefined,
): ProviderFailureClass {
  return isPersistentBillingFailure(message) ? 'persistent_billing' : 'transient';
}
