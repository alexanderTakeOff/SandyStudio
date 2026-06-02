// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/wait-for-pickup.ts
//
// TD-39 Layer 1 — sync acknowledgment after a PA dispatch tool fires an
// Inngest event. The underlying REST endpoint returns 200 as soon as the
// event is queued, NOT when the function actually picks it up. In Mode 3
// and Mode 4 Polina would otherwise tell Director «отправлено» while the
// queue silently dropped the event (Inngest down, function not deployed,
// rate-limited, etc.) and no one would notice until much later.
//
// Pickup signal: the canonical proof is a `jobs` row appearing for the
// dispatched event. Factory.ts step 1 calls insertJobRow inside the
// Inngest function — so the row's existence means Inngest physically
// picked up the event and the function body started.
//
// Composite anchor (no migration required for L1):
//   episode_id  + (optional) agent_id + created_at >= T0
//
// `inngest_event_ids` returned by the endpoint are EVENT ids, not RUN ids.
// `jobs.inngest_run_id` stores the RUN id (per-function execution). The
// two don't match by string, so the only correlator available without a
// new column is (episode, agent, time). False-positive risk: a sibling
// dispatch for the same episode + agent within the same 10s window would
// be indistinguishable. In the PA conversation loop this is vanishingly
// rare (Polina dispatches sequentially, not in parallel). If the risk
// ever materialises, follow-up TD adds an `inngest_event_id` column +
// switches the anchor to that. Documented as L1.5.
//
// Failure mode: when no row appears within `timeoutMs`, the tool reports
// `pickup_timeout` to Polina so she naturally tells Director "отправил,
// но не подхватили — проверьте Inngest".
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';
import { fail, ok, type ToolResult } from './types';

export interface WaitForPickupArgs {
  supabase: SupabaseClient<Database>;
  episodeId: string;
  /** Optional narrowing — when the dispatching tool knows which agent it
   *  is firing (e.g. 'EXEC-VGEN'), passing this eliminates cross-agent
   *  false positives. */
  agentHint?: string;
  /** ISO timestamp captured immediately BEFORE the dispatch fetch. */
  sinceIso: string;
  /** Hard ceiling for how long Polina is willing to wait. */
  timeoutMs?: number;
  /** Poll interval — keep small enough to feel snappy in chat, large
   *  enough to keep DB load reasonable across many tools. */
  intervalMs?: number;
}

export interface PickupResult {
  pickedUp: boolean;
  jobId?: string;
  elapsedMs: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_INTERVAL_MS = 250;

export async function waitForJobPickup(args: WaitForPickupArgs): Promise<PickupResult> {
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = args.intervalMs ?? DEFAULT_INTERVAL_MS;
  const start = Date.now();
  const deadline = start + timeoutMs;

  while (Date.now() < deadline) {
    let q = args.supabase
      .from('jobs')
      .select('id')
      .eq('episode_id', args.episodeId)
      .gte('created_at', args.sinceIso)
      .in('status', ['RUNNING', 'COMPLETED', 'FAILED'])
      .limit(1);
    if (args.agentHint) {
      q = q.eq('agent_id', args.agentHint as never);
    }
    const { data, error } = await q;
    if (error) {
      // DB hiccup — bail with "pickup unknown" rather than retrying
      // forever and burning the chat turn budget. Caller decides how to
      // surface this.
      return { pickedUp: false, elapsedMs: Date.now() - start };
    }
    if (data && data.length > 0) {
      const first = data[0];
      return {
        pickedUp: true,
        jobId: typeof first?.id === 'string' ? first.id : undefined,
        elapsedMs: Date.now() - start,
      };
    }
    await sleep(intervalMs);
  }
  return { pickedUp: false, elapsedMs: Date.now() - start };
}

/**
 * Wrap a successful ToolResult with a pickup-ack check. If the underlying
 * dispatch succeeded but no executor picked up the event within `timeoutMs`,
 * downgrade the result to a `pickup_timeout` failure so Polina escalates.
 *
 * No-op when the dispatch itself already failed (returns the failure
 * unchanged), or when the caller did not supply `episodeId` (some tools
 * dispatch outside any episode context — e.g. createSeries).
 */
export async function ackOrFailOnPickup(
  result: ToolResult,
  args: {
    supabase: SupabaseClient<Database>;
    episodeId?: string | null;
    agentHint?: string;
    sinceIso: string;
    timeoutMs?: number;
    intervalMs?: number;
    /** Human-readable label for the pickup_timeout message. */
    label: string;
  },
): Promise<ToolResult> {
  if (!result.ok) return result;
  if (!args.episodeId) return result;
  const pickup = await waitForJobPickup({
    supabase: args.supabase,
    episodeId: args.episodeId,
    agentHint: args.agentHint,
    sinceIso: args.sinceIso,
    timeoutMs: args.timeoutMs,
    intervalMs: args.intervalMs,
  });
  if (!pickup.pickedUp) {
    return fail(
      `${args.label}: dispatched OK (HTTP 200) but no executor picked the event up within ${(args.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000}s. ` +
        `Tell Director the work has NOT started. Likely causes: Inngest dev server down, function not deployed, or event payload mismatch. ` +
        `Check Inngest dashboard (/api/inngest) and the recent jobs table for context.`,
      'pickup_timeout',
    );
  }
  // Successful pickup — bubble the original ok result with an ack-augmented
  // summary so Polina is explicit about confirmation.
  const baseSummary = result.summary ?? args.label;
  return ok(
    result.data,
    `${baseSummary} (pickup confirmed in ${pickup.elapsedMs}ms${pickup.jobId ? `, job ${pickup.jobId.slice(0, 8)}…` : ''})`,
  );
}

/**
 * TD-39 L1 — pickup-ack for the APPROVE / REQUEST_REVISION path.
 *
 * Unlike `triggerAgent`, an approval does not always launch a downstream
 * agent: approving a terminal asset, or one whose multi-asset gate isn't
 * complete yet, legitimately fires zero events. The approve route reports
 * exactly what it fired via `fired_events`, so we only run the pickup poll
 * when something was actually dispatched — otherwise we'd report a false
 * `pickup_timeout` on a perfectly valid no-op approval.
 *
 * The fan-out may target several agents (e.g. animatic fan-out). For L1 we
 * confirm that *at least one* downstream job row appeared for the episode —
 * proof the queue is live. Per-event correlation (catching a partial
 * fan-out loss) needs the `inngest_event_id` column and is deferred to L1.5.
 */
export async function ackFanoutPickup(
  result: ToolResult,
  args: {
    supabase: SupabaseClient<Database>;
    /** Episode focused in the conversation — fallback anchor. */
    ctxEpisodeId?: string | null;
    sinceIso: string;
    timeoutMs?: number;
    intervalMs?: number;
    label: string;
  },
): Promise<ToolResult> {
  if (!result.ok) return result;

  const payload = extractApprovePayload(result.data);
  const firedCount = payload.firedEvents.length;

  // No downstream agent to launch → nothing to confirm. Make the no-op
  // explicit so Polina doesn't imply work started when none was meant to.
  if (firedCount === 0) {
    const base = result.summary ?? args.label;
    return ok(result.data, `${base} (no downstream agent launched — nothing to confirm)`);
  }

  // Prefer the episode the route actually acted on; fall back to context.
  const episodeId = payload.episodeId ?? args.ctxEpisodeId ?? null;

  return ackOrFailOnPickup(result, {
    supabase: args.supabase,
    episodeId,
    sinceIso: args.sinceIso,
    timeoutMs: args.timeoutMs,
    intervalMs: args.intervalMs,
    label: `${args.label} → ${firedCount} downstream event${firedCount > 1 ? 's' : ''}`,
  });
}

/** Pull `episode_id` + `fired_events` out of the approve route's
 *  `{ success, data: { ... } }` envelope, defensively. */
function extractApprovePayload(data: unknown): {
  episodeId: string | null;
  firedEvents: unknown[];
} {
  const envelope = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const inner =
    envelope.data && typeof envelope.data === 'object'
      ? (envelope.data as Record<string, unknown>)
      : envelope;
  const episodeId = typeof inner.episode_id === 'string' ? inner.episode_id : null;
  const firedEvents = Array.isArray(inner.fired_events) ? inner.fired_events : [];
  return { episodeId, firedEvents };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
