// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/pa-orphaned-awaiting-sweep.ts
//
// Step 2 of the Supabase recovery sprint (2026-05-22). Bounded-cost safety
// net for the event-driven `pa-escalation-timer`.
//
// Why this exists: pa-escalation-timer is event-driven and cleans up
// happily on cancelOn. But there are narrow windows where state can fall
// through:
//
//   - The webapp / Inngest dev server was down when `pa/awaiting-set`
//     fired → no timer was armed → that awaiting state has no escalation
//     scheduled.
//   - A manual DB edit set awaiting_director_input on a turn without
//     going through persistTurn() (rare, but possible during migrations
//     or ops scripts).
//   - A schema migration race during a deploy.
//
// In all these cases we want a single rescuer that runs RARELY and picks
// up only the truly orphaned turns. HOURLY cron (not minutely!) — 24
// Supabase reads per day instead of 1440. The query is bounded: only
// assistant turns from the last 24h whose awaiting flag is set and which
// are still the latest turn in their thread.
//
// Director's principle of "fixed-interval polling = bad on external paid
// services" still applies, but this is the bounded-cost insurance layer
// the cluster-boundary needs. The cost is fixed and tiny.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

/**
 * How long after an awaiting turn was created before we consider it
 * "orphaned" and ping. Larger than any reasonable deadline_sec so we
 * never race with an in-flight pa-escalation-timer.
 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000; // 1 hour
/** Hard cap on rows scanned per sweep — protects against runaway reads. */
const SWEEP_LIMIT = 50;

export const paOrphanedAwaitingSweep = inngest.createFunction(
  {
    id: 'pa-orphaned-awaiting-sweep',
    name: 'PA orphaned-awaiting sweep (hourly safety net)',
    retries: 0,
  },
  // HOURLY. NOT minutely. This is the explicit trade-off: cheap insurance,
  // bounded cost, real-event chain (the timer) does the heavy lifting.
  { cron: '0 * * * *' },
  async ({ step, logger }) => {
    const result = await step.run('sweep-orphans', async () => {
      const sb = createSupabaseServiceRoleClient();
      // Find assistant turns where:
      //   - metadata.awaiting_director_input is set
      //   - created_at < now - 1h (so we don't race the active timer)
      //   - this is the latest turn in its thread (no later turn exists)
      //
      // Supabase PostgREST doesn't support "latest per group" natively, so
      // we pull the candidates and filter in process. Window is small —
      // typically 0-3 rows.
      const sinceIso = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();
      const untilIso = new Date(Date.now() - ORPHAN_MIN_AGE_MS).toISOString();
      const { data, error } = await sb
        .from('concierge_turns')
        .select('id,thread_id,created_at,metadata,role')
        .eq('role', 'assistant')
        .gte('created_at', sinceIso)
        .lte('created_at', untilIso)
        .order('created_at', { ascending: false })
        .limit(SWEEP_LIMIT);
      if (error) {
        logger.warn(`pa-orphaned-awaiting-sweep: query failed: ${error.message}`);
        return { skipped: 'query_failed' as const, error: error.message };
      }
      const candidates =
        (data ?? []).filter((row) => {
          const meta = (row.metadata ?? {}) as Record<string, unknown>;
          return Boolean(meta.awaiting_director_input);
        }) ?? [];
      if (candidates.length === 0) {
        return { ok: true as const, scanned: 0, escalated: 0 };
      }
      // For each candidate, verify it's still the latest turn in its thread.
      let escalated = 0;
      for (const row of candidates) {
        const { data: latest } = await sb
          .from('concierge_turns')
          .select('id')
          .eq('thread_id', row.thread_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!latest || latest.id !== row.id) continue; // not latest, skip
        await inngest.send({
          name: 'sandystudio/pa/notify-needed',
          data: {
            threadId: row.thread_id,
            source: 'timer',
            triggerId: row.id,
            eventType: 'orphan_sweep',
          },
        });
        escalated += 1;
      }
      return { ok: true as const, scanned: candidates.length, escalated };
    });
    return result;
  },
);
