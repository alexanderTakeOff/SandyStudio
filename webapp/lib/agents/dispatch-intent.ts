// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/dispatch-intent.ts
// S2 leak-closing / P2 — race-free per-shot dispatch claim.
//
// Wraps the `claim_dispatch_intent` Postgres RPC (migration 0039). The RPC does
// an atomic INSERT … ON CONFLICT (episode_id, shot_id, agent_id) test-and-set:
//   - fresh insert OR re-claim of a terminal (done/failed) row → claimed=true
//   - conflict on an in-flight (claimed/running) row           → claimed=false
//                                                                 (duplicate blocked)
// Plus one client-side term the RPC cannot express: an identical dispatch landing
// within RECLAIM_ECHO_WINDOW_MS of a TERMINAL claim is an echo of the run that
// just finished, not a sequential regen — also blocked (E33 SH07, see below).
//
// This REPLACES factory.ts's racy "eref-inflight-dedup-check" (a TOCTOU
// read-then-check where two same-shot dispatches both read "nothing in flight"
// and both render → the E07 ×2 / E12 SH10 double-render + duplicate ~$1.21 bill).
//
// FAIL-OPEN: any RPC error / missing row → treat as claimed (proceed). Mirrors
// the live guard's "a rare duplicate beats dropping a legitimate generation".
// ──────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';

/**
 * Marker written into `jobs.error_message` when `jobs-stale-reaper` closes a row
 * whose execution died (queue reset / worker loss) and releases the claim it was
 * holding. Lives here, with the claim lifecycle, so both the reaper and the state
 * matrix can read it without `lib/` taking a dependency on `inngest/`.
 *
 * Load-bearing: the state matrix excludes marked rows from the generation-failure
 * count. A run that never executed is not evidence that the shot fails to render.
 */
export const REAPED_MARKER = '[QUEUE_RESET_ORPHAN]';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/types.gen';

/** Dispatch claim lifecycle, mirrors the table CHECK. */
export type DispatchStatus = 'claimed' | 'running' | 'done' | 'failed';

export interface DispatchClaim {
  /** true → caller holds the claim, proceed. false → an in-flight claim blocks
   *  this duplicate dispatch; caller MUST skip (no render, no fan-out). */
  claimed: boolean;
  /** Inngest run id of the holder when blocked (audit). */
  blockingRunId: string | null;
  /** Status of the holder when blocked. */
  blockingStatus: string | null;
}

export interface DispatchKey {
  episodeId: string;
  /** Canonical shot id (post shot-identity refactor). '' for episode-scoped. */
  shotId: string;
  agentId: string;
}

/**
 * Payload keys that vary per physical dispatch but do NOT change the logical work
 * being claimed. Stripped before hashing so the same logical dispatch hashes
 * stably (and so the dup-waste ledger groups real duplicates together).
 */
export const VOLATILE_DISPATCH_KEYS: ReadonlySet<string> = new Set([
  'principal',
  'confirmedBy',
  'directorConfirm',
  'revisionNote',
  'ts',
  'timestamp',
  'runId',
  'inngestRunId',
  'idempotencyKey',
]);

/** Recursively sort object keys so JSON.stringify is order-independent. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (VOLATILE_DISPATCH_KEYS.has(key)) continue;
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Stable SHA-256 of a dispatch's identifying payload (volatile keys stripped,
 * keys sorted). Audit / waste-ledger only — NOT part of the unique claim key.
 */
export function computeInputHash(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(canonicalize(payload));
  return createHash('sha256').update(canonical).digest('hex');
}

type RpcCapableClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * How soon after a TERMINAL claim an identical dispatch is read as an echo of the
 * one that just finished, rather than a deliberate sequential regen.
 *
 * The RPC deliberately allows a done/failed row to be re-claimed — that is how a
 * sequential regen works. But "sequential" was unbounded in time, so a duplicate
 * trigger arriving right behind the completion sailed through: E33 SH07 ref_plan
 * v03 started ONE SECOND after v02 completed, re-authored the same content in
 * different words, and invalidated a plan the Director had already accepted. Same
 * class as the double `approveAsset` of 2026-07-28. A human regen is never one
 * second behind the render it is judging — but it can be a fast one, so the
 * window stays short: an order of magnitude above the observed echo, far below
 * "someone looked at the frame and pressed the button".
 */
export const RECLAIM_ECHO_WINDOW_MS = 10_000;

/** Statuses a claim row can be re-claimed from (mirrors the RPC's ON CONFLICT). */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['done', 'failed']);

/**
 * The blocked-claim result when this dispatch is an echo of a run that just
 * finished with the SAME payload — else null (proceed to the atomic claim).
 * Fail-open: any read error / absent row / unparseable timestamp ⇒ null.
 */
async function readTerminalEcho(
  supabase: SupabaseClient<Database>,
  key: DispatchKey,
  inputHash: string,
): Promise<DispatchClaim | null> {
  try {
    const { data: prior } = await supabase
      .from('dispatch_intent')
      .select('status,input_hash,updated_at,inngest_run_id')
      .eq('episode_id', key.episodeId)
      .eq('shot_id', key.shotId)
      .eq('agent_id', key.agentId)
      .maybeSingle();
    if (!prior) return null;
    if (!TERMINAL_STATUSES.has(prior.status)) return null;
    if (prior.input_hash !== inputHash) return null;
    const closedAgo = Date.now() - Date.parse(prior.updated_at);
    if (!Number.isFinite(closedAgo) || closedAgo < 0) return null;
    if (closedAgo >= RECLAIM_ECHO_WINDOW_MS) return null;
    return {
      claimed: false,
      blockingRunId: prior.inngest_run_id,
      blockingStatus: prior.status,
    };
  } catch {
    return null;
  }
}

/**
 * Atomically claim a per-shot dispatch. See module header for semantics.
 *
 * Before the atomic claim we read the existing row once: a TERMINAL row that was
 * closed within `RECLAIM_ECHO_WINDOW_MS` by the SAME `input_hash` means this
 * dispatch is a duplicate echo, and we block it exactly as an in-flight claim
 * would (the caller's `regen_duplicate_skipped` path is unchanged). The read is a
 * TOCTOU only against another *concurrent* dispatch — and that case is what the
 * RPC below already serialises, so nothing is weakened. FAIL-OPEN like the rest
 * of this module: any error reading the row skips the echo check entirely.
 *
 * Call rpc AS A METHOD on the client (`sb.rpc(...)`) — supabase-js dereferences
 * `this.rest` internally, so an extracted bare reference loses the binding (the
 * lesson from lib/budget.ts). The cast only bypasses the not-yet-regenerated
 * Functions type map.
 */
export async function claimDispatchIntent(
  supabase: SupabaseClient<Database>,
  key: DispatchKey,
  inputHash: string,
  inngestRunId: string,
): Promise<DispatchClaim> {
  const echo = await readTerminalEcho(supabase, key, inputHash);
  if (echo) return echo;

  const sb = supabase as unknown as RpcCapableClient;
  const { data, error } = await sb.rpc('claim_dispatch_intent', {
    p_episode: key.episodeId,
    p_shot: key.shotId,
    p_agent: key.agentId,
    p_hash: inputHash,
    p_run: inngestRunId,
  });
  // Fail OPEN: a rare duplicate beats dropping a legitimate generation.
  if (error) return { claimed: true, blockingRunId: null, blockingStatus: null };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    return { claimed: true, blockingRunId: null, blockingStatus: null };
  }
  const r = row as Record<string, unknown>;
  return {
    claimed: r.claimed === true,
    blockingRunId: typeof r.blocking_run_id === 'string' ? r.blocking_run_id : null,
    blockingStatus: typeof r.blocking_status === 'string' ? r.blocking_status : null,
  };
}

/**
 * Mark a dispatch claim terminal (done/failed) so a later SEQUENTIAL regen of the
 * same shot can re-claim it. No-op (and never throws) if the row is absent — only
 * shot-scoped agents create claim rows, so unrelated agents pass through cleanly.
 */
export async function markDispatchIntent(
  supabase: SupabaseClient<Database>,
  key: DispatchKey,
  status: Extract<DispatchStatus, 'running' | 'done' | 'failed'>,
): Promise<void> {
  await supabase
    .from('dispatch_intent')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('episode_id', key.episodeId)
    .eq('shot_id', key.shotId)
    .eq('agent_id', key.agentId);
}
