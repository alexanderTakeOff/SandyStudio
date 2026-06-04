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

/**
 * Shape returned by the `increment_budget_spent` Postgres RPC (migration 0037).
 * `allowed=false` means the increment would have exceeded the ceiling (or the
 * episode was not found) and `spent` was left UNCHANGED.
 */
export interface BudgetAvailability {
  allowed: boolean;
  spent: number;
  ceiling: number | null;
}

/**
 * Internal: call the atomic ceiling-guarded increment RPC (migration 0037).
 *
 * Why an RPC and not read-modify-write in TS: two concurrent EXEC-VGEN shots
 * (fan-out runs 3/episode) could both read the same budget_spent, both pass a
 * JS-side ceiling check, then both UPDATE — overspending the ceiling and/or
 * losing one increment. The RPC performs the check + increment in one UPDATE so
 * the row lock serialises callers.
 *
 * The generated Supabase types declare `Functions: { [_ in never]: never }`
 * because types.gen.ts has not been regenerated against 0037 yet. We narrow the
 * `unknown` row defensively instead of casting to a fabricated type — the
 * orchestrator regenerates types.gen.ts after `supabase db push`.
 */
async function callIncrementBudgetSpent(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  costUsd: number
): Promise<BudgetAvailability> {
  // The RPC name is not in the generated Functions map yet; bypass the empty
  // map without inventing a type, then narrow the result safely.
  const rpc = (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc;
  const { data, error } = await rpc('increment_budget_spent', {
    p_episode: episodeId,
    p_cost: costUsd,
  });
  if (error) {
    throw new Error(`increment_budget_spent RPC failed: ${error.message}`);
  }
  // The function `returns table(...)`, so PostgREST yields an array of rows.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    throw new Error(
      'increment_budget_spent RPC returned no row (episode lookup failed)'
    );
  }
  const r = row as Record<string, unknown>;
  const spent = typeof r.spent === 'number' ? r.spent : Number(r.spent ?? 0);
  const ceiling =
    r.ceiling === null || r.ceiling === undefined
      ? null
      : typeof r.ceiling === 'number'
        ? r.ceiling
        : Number(r.ceiling);
  const allowed = r.allowed === true;
  return { allowed, spent, ceiling };
}

/**
 * Pre-spend ceiling guard (UNIT 3 / I7).
 *
 * Call BEFORE a paid provider call to atomically reserve the estimated cost
 * against the episode ceiling. Returns `{allowed:false, ...}` if the reservation
 * would exceed the ceiling (budget_spent left unchanged) — the caller MUST then
 * refuse to spend and throw a typed `BudgetExceededError`.
 *
 * Because the increment is atomic, this is the only race-free way to gate spend:
 * the old "SELECT then UPDATE" pattern let concurrent shots both pass the check.
 *
 * NOTE: this RESERVES the estimated cost (increments budget_spent). The
 * authoritative actual cost is reconciled afterwards by
 * `recordCost(... reservedUsd: <this estimate>)`, which applies only the
 * (actual − reserved) delta so the ceiling is never double-charged.
 */
export async function assertBudgetAvailable(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  estCostUsd: number
): Promise<BudgetAvailability> {
  return callIncrementBudgetSpent(supabase, episodeId, estCostUsd);
}

export interface RecordCostInput {
  /**
   * Idempotency key — the Inngest job id for pipeline runs. NULL for direct
   * Director-triggered spends (regenerate-image / -video / Bible image gen)
   * which have no job row; the partial unique index ignores NULL job_ids, so
   * each manual reroll is its own audited cost row.
   */
  jobId: string | null;
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
  /**
   * Pre-spend ceiling enforcement. Default true (pipeline path: throw + fail the
   * job before the cascade continues). Direct Director rerolls pass false — the
   * money is already spent by the time we record, so blocking would only lose
   * the audit row; we always record and let the ceiling surface in the report.
   *
   * Ignored when `reservedUsd` is set: a reservation already passed the ceiling
   * gate atomically, so this call only reconciles the delta and never re-checks.
   */
  enforceCeiling?: boolean;
  /**
   * UNIT 3 / I7 reconciliation. When a pre-spend reservation already
   * incremented budget_spent by this estimated amount (via assertBudgetAvailable
   * before the paid call), pass it here. recordCost then increments budget_spent
   * by the DELTA (actual costUsd − reservedUsd) instead of the full cost, so the
   * ceiling is never double-charged. A negative delta (actual < estimate) refunds
   * the over-reservation. The budget_log audit row still records the actual cost.
   */
  reservedUsd?: number;
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
  const reservedUsd = input.reservedUsd;
  const isReconciliation = reservedUsd !== undefined;
  // A reservation already passed the ceiling gate atomically, so reconciliation
  // never re-checks the ceiling — it only settles the (actual − reserved) delta.
  const enforceCeiling = isReconciliation ? false : input.enforceCeiling ?? true;
  // The amount we still need to apply to budget_spent. Reconciliation applies the
  // delta vs the reservation (can be negative → refund the over-reservation);
  // the normal path applies the full cost.
  const incrementUsd =
    reservedUsd !== undefined ? costUsd - reservedUsd : costUsd;

  // ── Step 1: read current episode budget (skip if no episode bound) ─────────
  // Used only for the enforce-path pre-check below (so we can throw a typed
  // BudgetExceededError WITHOUT having written an audit row) and for the
  // ceilingHit return flag. The authoritative spent value comes from the
  // atomic RPC in Step 4, not from this read.
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

  // ── Step 2: hard ceiling pre-check (pipeline path only) ────────────────────
  // Throw BEFORE writing any audit row so a rejected pre-spend leaves no trace.
  // The atomic RPC in Step 4 is the authoritative race-free guard; this is an
  // early-exit so the common rejection case behaves exactly as before.
  if (enforceCeiling && currentSpent + costUsd > ceiling) {
    throw new BudgetExceededError({
      episodeId: episodeId ?? '<no-episode>',
      currentSpent,
      attemptedCost: costUsd,
      ceiling,
    });
  }

  // ── Step 3: idempotent insert into budget_log ──────────────────────────────
  // This is the idempotency gate: the partial unique index on job_id means a
  // retried step hits PG_UNIQUE_VIOLATION and we no-op WITHOUT re-incrementing
  // budget_spent. The increment (Step 4) only runs when this insert succeeds.
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

  // ── Step 4: atomically bump episodes.budget_spent ──────────────────────────
  // Replaces the previous read-modify-write (Step 1 read + this UPDATE) which
  // had a lost-update / overspend race between concurrent shots. The RPC does
  // check + increment in one statement; the row lock serialises callers.
  let newBudgetSpent = currentSpent + incrementUsd;
  if (episodeId !== null && incrementUsd !== 0) {
    const result = await callIncrementBudgetSpent(
      supabase,
      episodeId,
      incrementUsd,
    );
    if (!result.allowed) {
      if (enforceCeiling) {
        // Lost the race against a concurrent increment that consumed the
        // remaining ceiling between Step 2 and here. The audit row is already
        // written; surface the rejection loudly (Director sees the attempt).
        throw new BudgetExceededError({
          episodeId,
          currentSpent: result.spent,
          attemptedCost: incrementUsd,
          ceiling: result.ceiling ?? Number.POSITIVE_INFINITY,
        });
      }
      // enforceCeiling=false (direct Director reroll / reconciliation): the money
      // was already spent (or reserved) upstream, so blocking the ledger update
      // would only lose the audit trail. Force the increment unconditionally so
      // budget_spent stays truthful and any ceiling overage surfaces in reports.
      const { error: upErr } = await supabase
        .from('episodes')
        .update({ budget_spent: result.spent + incrementUsd })
        .eq('id', episodeId);
      if (upErr) {
        throw new Error(
          `recordCost: forced budget_spent update failed: ${upErr.message}`
        );
      }
      newBudgetSpent = result.spent + incrementUsd;
    } else {
      newBudgetSpent = result.spent;
    }
    ceiling = result.ceiling ?? Number.POSITIVE_INFINITY;
  }

  return {
    recorded: true,
    newBudgetSpent,
    ceilingHit: ceiling !== Number.POSITIVE_INFINITY && newBudgetSpent >= ceiling,
  };
}
