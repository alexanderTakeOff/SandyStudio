// ──────────────────────────────────────────────────────────────────────────────
// lib/budget.ts
// Per-episode budget bookkeeping. Idempotent on Inngest step retry.
//
// Idempotency contract (per phase-4-jiggly-wave.md §4.5):
//   - Each successful agent run records exactly ONE cost row in activity_events
//     keyed by job_id.
//   - Migration 0009 enforces this via a partial unique index on
//     (job_id, event_type='cost_recorded').
//   - If Inngest retries the `record-cost` step, the second insert hits the
//     unique constraint; we catch the violation and treat it as a no-op.
//   - episodes.budget_spent is also updated only on the FIRST successful insert,
//     because we only update it after the insert succeeds (no race; Inngest
//     retries are sequential per step).
//
// Hard ceiling check:
//   - Before recording, sum projected (current spent + new cost) and compare
//     to episodes.budget_ceiling.
//   - If it would exceed → throw BudgetExceededError. The Inngest function
//     catches this and marks the job FAILED.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './supabase/types.gen';
import type { AgentId, CostRecord } from './agents/types';

/** Postgres unique-violation error code. */
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

interface RecordCostInput {
  jobId: string;
  episodeId: string | null;
  agentId: AgentId;
  costUsd: number;
}

interface RecordCostResult {
  recorded: boolean; // true on first insert, false on idempotent retry
  newBudgetSpent: number;
  ceilingHit: boolean;
}

/**
 * Idempotently record a cost row and update episodes.budget_spent.
 *
 * Returns:
 *   - {recorded: true, ...} on successful first record
 *   - {recorded: false, ...} on retry (existing row found via unique constraint)
 *
 * Throws:
 *   - BudgetExceededError if the cost would exceed the episode ceiling
 *
 * NOTE: cost = 0 still records a row (mock mode). This gives us a complete
 * audit trail even when no real money was spent.
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

  // ── Step 3: idempotent insert into activity_events ─────────────────────────
  const record: CostRecord = {
    job_id: jobId,
    episode_id: episodeId,
    agent_id: agentId,
    cost_usd: costUsd,
    recorded_at: new Date().toISOString(),
  };
  const { error: insErr } = await supabase.from('activity_events').insert({
    event_type: 'cost_recorded',
    severity: 'info',
    title: `${agentId} cost: $${costUsd.toFixed(4)}`,
    description: null,
    actor: agentId,
    job_id: jobId,
    episode_id: episodeId,
    metadata: record as unknown as Record<string, unknown>,
  });

  if (insErr) {
    // Unique-violation = retry hitting the same job_id. That's the idempotent
    // path: cost was already recorded on a prior attempt, do nothing more.
    if (insErr.code === PG_UNIQUE_VIOLATION) {
      return {
        recorded: false,
        newBudgetSpent: currentSpent,
        ceilingHit: false,
      };
    }
    throw new Error(`recordCost: activity_events insert failed: ${insErr.message}`);
  }

  // ── Step 4: bump episode budget_spent ──────────────────────────────────────
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
