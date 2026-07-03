// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/cost.ts
// 2026-06-25 — concierge LLM cost tracking + circuit-breaker.
//
// Root of the $100/day Anthropic drain was INVISIBLE because concierge (Polina)
// LLM calls were never written to budget_log (only studio agents were). This
// module records every concierge call's tokens+cost and provides a rolling-window
// circuit-breaker so autonomous spend can never silently exhaust credits again.
//
// Attribution: rows DO carry episode_id (so per-episode concierge spend is
// queryable "for the estimate", Director 2026-06-25) but we DO NOT touch
// episodes.budget_spent — concierge spend is studio-global and must not consume
// the per-episode ceiling or trip pipeline budget gates. job_id is null; the
// partial-unique index on job_id means each concierge row is its own audited
// entry with no collision.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';
import { computeCostUsd } from '@/lib/agents/providers/anthropic-text';
import { conciergeProvider } from './llm';

type Client = SupabaseClient<Database>;

export const CONCIERGE_AGENT_ID = 'EXEC-CONC';

export interface ConciergeUsage {
  promptTokens: number;
  completionTokens: number;
}

/**
 * Record one concierge LLM call's tokens + cost into budget_log. Best-effort:
 * never throws into the caller — a failed audit row must not break the reply.
 */
export async function recordConciergeCost(
  client: Client,
  args: {
    model: string;
    usage: ConciergeUsage;
    source: string; // 'auto_react' | 'chat' | …
    episodeId?: string | null;
  },
): Promise<void> {
  try {
    const inputTokens = args.usage.promptTokens || 0;
    const outputTokens = args.usage.completionTokens || 0;
    if (inputTokens === 0 && outputTokens === 0) return; // nothing to record
    const costUsd = computeCostUsd({ inputTokens, outputTokens }, args.model);
    await client.from('budget_log').insert({
      job_id: null,
      episode_id: args.episodeId ?? null,
      agent_id: CONCIERGE_AGENT_ID,
      api_provider: conciergeProvider(),
      model_or_tier: args.model,
      operation: `concierge_${args.source}`,
      cost_usd: costUsd,
      tokens_used: inputTokens + outputTokens,
      duration_ms: null,
    });
  } catch {
    // best-effort audit — never break the reply over a logging miss
  }
}

export interface ConciergeBudgetStatus {
  tripped: boolean;
  spent: number;
  cap: number;
  calls: number;
  maxCalls: number;
  /** Which limb tripped — for an honest skip reason. */
  reason: 'cost' | 'calls' | null;
}

/**
 * Providers whose per-call cost is negligible (a "free tier"). Director 07-03:
 * «нет ограничений на бесплатные вызовы» — these are EXEMPT from the volume
 * count-fence and governed solely by the $ cost-cap (which their spend never
 * reaches). Paid/unknown providers still count toward the fence, so a mispriced
 * provider can never slip past the volume backstop.
 */
const FREE_CONCIERGE_PROVIDERS = ['gemini', 'google'];
export function isFreeConciergeProvider(provider: string | null | undefined): boolean {
  if (!provider) return false;
  const p = provider.toLowerCase();
  return FREE_CONCIERGE_PROVIDERS.some((f) => p.includes(f));
}

/**
 * Rolling-window circuit-breaker for autonomous concierge spend. Trips on the
 * FIRST of two limbs over the last `windowHours`:
 *   • cost   — Σ cost_usd ≥ capUsd  (price-aware; correctly priced for known models)
 *   • calls  — PAID-provider row count ≥ maxCalls (volume backstop for paid/unknown
 *              providers, so a mispriced one can never slip past the cost limb).
 *              Free providers (see isFreeConciergeProvider) are exempt — the $ cap
 *              alone governs them (Director 07-03: no limit on free calls).
 * FAILS OPEN on a read error — the cap is a cost backstop, not a security
 * control, and must not wedge Polina over a transient query failure.
 */
export async function isConciergeBudgetTripped(
  client: Client,
  opts: { capUsd: number; windowHours: number; maxCalls: number },
): Promise<ConciergeBudgetStatus> {
  const sinceIso = new Date(
    Date.now() - opts.windowHours * 3_600_000,
  ).toISOString();
  const { data, error } = await client
    .from('budget_log')
    .select('cost_usd, api_provider')
    .eq('agent_id', CONCIERGE_AGENT_ID)
    .gte('created_at', sinceIso);
  if (error) {
    return { tripped: false, spent: 0, cap: opts.capUsd, calls: 0, maxCalls: opts.maxCalls, reason: null };
  }
  const rows = (data ?? []) as Array<{ cost_usd: number | null; api_provider: string | null }>;
  const spent = rows.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  // Count-fence counts only PAID/unknown-provider calls; free providers are exempt.
  const calls = rows.filter((r) => !isFreeConciergeProvider(r.api_provider)).length;
  const reason: 'cost' | 'calls' | null =
    calls >= opts.maxCalls ? 'calls' : spent >= opts.capUsd ? 'cost' : null;
  return { tripped: reason !== null, spent, cap: opts.capUsd, calls, maxCalls: opts.maxCalls, reason };
}

/** Cap config from env, with safe defaults (loop-fixed spend is far below). */
export function conciergeBudgetCapConfig(): {
  capUsd: number;
  windowHours: number;
  maxCalls: number;
} {
  const capUsd = Number(process.env.CONCIERGE_DAILY_CAP_USD) || 20;
  const windowHours = Number(process.env.CONCIERGE_CAP_WINDOW_H) || 24;
  const maxCalls = Number(process.env.CONCIERGE_AUTO_REACT_MAX_CALLS) || 40;
  return { capUsd, windowHours, maxCalls };
}

/**
 * Master kill-switch for Polina's autonomous auto-react loop. Default ON.
 * Set CONCIERGE_AUTO_REACT_ENABLED=false to fully disarm the loop while keeping
 * her interactive Director chat alive. Provider-independent — the hardest fence.
 */
export function conciergeAutoReactEnabled(): boolean {
  return (process.env.CONCIERGE_AUTO_REACT_ENABLED ?? 'true').toLowerCase() !== 'false';
}
