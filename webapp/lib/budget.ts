// ──────────────────────────────────────────────────────────────────────────────
// lib/budget.ts
// Per-episode budget bookkeeping. Idempotent on Inngest step retry.
//
// Storage layout:
//   - budget_log: per-call cost rows (api_provider, model_or_tier, tokens_used,
//     duration_ms, cost_usd) — created by migration 0002.
//   - episodes.budget_spent: running aggregate kept in sync with budget_log.
//
// Idempotency contract (per phase-4-jiggly-wave.md §4.5):
//   - Each successful agent run records exactly ONE cost row keyed by job_id.
//   - Migration 0009 enforces this via a partial unique index on
//     budget_log(job_id).
//   - If Inngest retries the `record-cost` step, the second insert hits the
//     unique constraint; we catch the violation and treat it as a no-op.
//   - episodes.budget_spent is bumped only after a successful first insert.
//
// Hard ceiling check:
//   - Before recording, sum projected (current spent + new cost) and compare
//     to episodes.budget_ceiling.
//   - If it would exceed → throw BudgetExceededError. The Inngest function
//     catches this and marks the job FAILED.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './supabase/types.gen';
import type { AgentId } from './agents/types';

const PG_UNIQUE_VIOLATION = '23505';

export class BudgetExceededError extends Error {
  readonly episodeId: string;
  readonly currentSpent: number;
  readonly attemptedCost: number;
  readonly ceiling: number;

  constructor(args: {
    episodeId: string;
    currentSpent: number;
    attemptedCost: number;
    ceiling: number;
  }) {
    super(
      `Budget exceeded for episode ${args.episodeId}: ` +
        `spent $${args.currentSpent.toFixed(4)} + ` +
        `new $${args.attemptedCost.toFixed(4)} > ceiling $${args.ceiling.toFixed(2)}`
    );
    this.name = 'BudgetExceededError';
    this.episodeId = args.episodeId;
    this.currentSpent = args.currentSpent;
    this.attemptedCost = args.attemptedCost;
    this.ceiling = args.ceiling;
  }
}

export interface RecordCostInput {
  jobId: string;
  episodeId: string | null;
  agentId: AgentId;
  costUsd: number;
  /** "anthropic" | "fal_ai" | "youtube" | "mock" — for budget_log analysis. */
  apiProvider: string;
  /** "claude-sonnet-4-6" | "flux-pro" | "mock" — concrete model/tier. */
  modelOrTier: string;
  /** "script_generation" | "video_generation" | "thumbnail_generation" | ... */
  operation: string;
  tokensUsed?: number;
  durationMs?: number;
}

export interface RecordCostResult {
  recorded: boolean; // true on first insert, false on idempotent retry
  newBudgetSpent: number;
  ceilingHit: boolean;
}

/**
 * Idempotently record a cost row in budget_log and bump episodes.budget_spent.
 *
 * Returns:
 *   - {recorded: true, ...} on successful first record
 *   - {recorded: false, ...} on retry (existing row found via unique index)
 *
 * Throws:
 *   - BudgetExceededError if the cost would push spent > ceiling
 *
 * NOTE: cost = 0 still records a row (mock mode). This gives us a complete
 * audit trail even when no real money was spent — same code path, real costs
 * in Sprint 10 just produce non-zero rows.
 */
export async function recordCost(
  supabase: SupabaseClient<Database>,
  input: RecordCostInput
): Promise<RecordCostResult> {
  const { jobId, episodeId, agentId, costUsd } = input;

  // ── Step 1: read current episode budget (skip if no episode bound) ─────────
  let currentSpent = 0;
  let ceiling = Number.POSITIVE_INFINITY;
  if (episodeId !== null) {
    const { data: episode, error: epErr } = await supabase
      .from('episodes')
      .select('budget_spent, budget_ceiling')
      .eq('id', episodeId)
      .single();
    if (epErr) {
      throw new Error(`recordCost: episode lookup failed: ${epErr.message}`);
    }
    currentSpent = episode.budget_spent ?? 0;
    ceiling = episode.budget_ceiling ?? Number.POSITIVE_INFINITY;
  }

  // ── Step 2: hard ceiling check ─────────────────────────────────────────────
  if (currentSpent + costUsd > ceiling) {
    throw new BudgetExceededError({
      episodeId: episodeId ?? '<no-episode>',
      currentSpent,
      attemptedCost: costUsd,
      ceiling,
    });
  }

  // ── Step 3: idempotent insert into budget_log ──────────────────────────────
  const { error: insErr } = await supabase.from('budget_log').insert({
    job_id: jobId,
    episode_id: episodeId,
    agent_id: agentId,
    api_provider: input.apiProvider,
    model_or_tier: input.modelOrTier,
    operation: input.operation,
    cost_usd: costUsd,
    tokens_used: input.tokensUsed ?? null,
    duration_ms: input.durationMs ?? null,
  });

  if (insErr) {
    if (insErr.code === PG_UNIQUE_VIOLATION) {
      return {
        recorded: false,
        newBudgetSpent: currentSpent,
        ceilingHit: false,
      };
    }
    throw new Error(`recordCost: budget_log insert failed: ${insErr.message}`);
  }

  // ── Step 4: bump episodes.budget_spent ─────────────────────────────────────
  const newBudgetSpent = currentSpent + costUsd;
  if (episodeId !== null && costUsd > 0) {
    const { error: upErr } = await supabase
      .from('episodes')
      .update({ budget_spent: newBudgetSpent })
      .eq('id', episodeId);
    if (upErr) {
      throw new Error(`recordCost: episodes.budget_spent update failed: ${upErr.message}`);
    }
  }

  return {
    recorded: true,
    newBudgetSpent,
    ceilingHit: ceiling !== Number.POSITIVE_INFINITY && newBudgetSpent >= ceiling,
  };
}
