// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/jobs-stale-reaper.ts
//
// Hourly safety net for jobs whose EXECUTION died but whose row never closed.
//
// Why this exists (E30, measured 2026-07-21). 57 of 485 EXEC-VGEN job rows sat
// FAILED with no `error_message` and no `completed_at` — a state `markJobFailed`
// cannot produce. They were killed by hand, with an untracked
// `scripts/clear-zombie-jobs.ts`, after an Inngest queue reset took their
// executions down with it. That is a three-part failure:
//
//   1. A queue reset silently orphans every in-flight run. The rows stay
//      RUNNING/QUEUED forever — nothing in the system notices.
//   2. Those rows HOLD the atomic dispatch claim (`claim_dispatch_intent`), so
//      every later dispatch for the same shot is refused as "already in flight".
//      The episode stalls on ghosts.
//   3. The only cure was the Director running a script — an UNPLANNED manual
//      touch, which is exactly the quantity the current planet drives to zero,
//      and it left the ledger dishonest (FAILED with no reason).
//
// The provider layer is NOT the culprit and needs no change: every fetch in the
// seedance path is wrapped in `fetchWithTimeout` and the poll loop carries an
// overall deadline. The execution does not hang — it dies with the queue.
//
// Cost shape follows `pa-orphaned-awaiting-sweep`: hourly, bounded row scan,
// no per-job model call. Deliberately NOT minutely — an orphan costs nothing
// while it waits except a blocked claim, and an hour is far inside the human
// loop it replaces.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { logEvent } from '@/lib/api/events';
import { markDispatchIntent, REAPED_MARKER } from '@/lib/agents/dispatch-intent';

/**
 * How old an unfinished job must be before it is presumed dead. The longest
 * legitimate wait in the fleet is the Seedance poll deadline (12 min), and an
 * Inngest run may retry, so a live job can plausibly span ~40 min. 90 minutes
 * sits well beyond that: anything older is not slow, it is gone.
 */
const STALE_MIN_AGE_MS = 90 * 60 * 1000;

/** Hard cap on rows touched per sweep — protects against a runaway write burst. */
const SWEEP_LIMIT = 200;

interface StaleJobRow {
  id: string;
  episode_id: string | null;
  agent_id: string | null;
  status: string | null;
  created_at: string;
  input_snapshot: unknown;
}

export const jobsStaleReaper = inngest.createFunction(
  {
    id: 'jobs-stale-reaper',
    name: 'Jobs stale reaper (hourly — closes queue-reset orphans)',
    retries: 0,
  },
  // Hourly, offset from the :00 sweep so the two never contend.
  { cron: '17 * * * *' },
  async ({ step, logger }) => {
    return step.run('reap-stale-jobs', async () => {
      const sb = createSupabaseServiceRoleClient();
      const cutoff = new Date(Date.now() - STALE_MIN_AGE_MS).toISOString();

      const { data, error } = await sb
        .from('jobs')
        .select('id,episode_id,agent_id,status,created_at,input_snapshot')
        .in('status', ['RUNNING', 'QUEUED'])
        .lt('created_at', cutoff)
        .order('created_at', { ascending: true })
        .limit(SWEEP_LIMIT);

      if (error) {
        logger.warn(`jobs-stale-reaper: query failed: ${error.message}`);
        return { skipped: 'query_failed' as const, error: error.message };
      }

      const stale = (data ?? []) as StaleJobRow[];
      if (stale.length === 0) return { ok: true as const, reaped: 0 };

      const reason =
        `${REAPED_MARKER} execution did not close within ` +
        `${STALE_MIN_AGE_MS / 60000} min — presumed dead (queue reset or worker loss). ` +
        `Reaped so the dispatch claim is released.`;

      let reaped = 0;
      const byEpisode = new Map<string, number>();

      for (const job of stale) {
        // Close the row the same shape `markJobFailed` does, so a reaped row is
        // never mistaken for one that was left dangling.
        const { error: updErr } = await sb
          .from('jobs')
          .update({
            status: 'FAILED',
            completed_at: new Date().toISOString(),
            error_message: reason,
          })
          .eq('id', job.id);
        if (updErr) {
          logger.warn(`jobs-stale-reaper: could not close job ${job.id}: ${updErr.message}`);
          continue;
        }
        reaped += 1;
        if (job.episode_id) {
          byEpisode.set(job.episode_id, (byEpisode.get(job.episode_id) ?? 0) + 1);
        }

        // Release the atomic dispatch claim this ghost was holding — THE point of
        // the sweep. Without it the shot stays undispatchable forever. Keyed the
        // same way the factory claims it; the episode sentinel covers EXEC-PUB.
        const snap = (job.input_snapshot ?? null) as { shotId?: unknown } | null;
        const shotId =
          snap && typeof snap.shotId === 'string'
            ? snap.shotId
            : job.agent_id === 'EXEC-PUB'
              ? 'EPISODE'
              : null;
        if (job.episode_id && job.agent_id && shotId) {
          await markDispatchIntent(
            sb,
            { episodeId: job.episode_id, shotId, agentId: job.agent_id },
            'failed',
          );
        }
      }

      // ONE summary row per episode, not one per ghost — the feed should show
      // that a sweep happened, not 57 identical lines. A distinct event_type keeps
      // this out of the agent_failed population the failure counter reads.
      for (const [episodeId, count] of byEpisode) {
        await logEvent(sb, {
          event_type: 'jobs_reaped',
          severity: 'warning',
          title: `Reaped ${count} orphaned job${count === 1 ? '' : 's'}`,
          description:
            `${count} job row${count === 1 ? '' : 's'} had been unfinished for over ` +
            `${STALE_MIN_AGE_MS / 60000} min — their executions are gone (queue reset or ` +
            `worker loss). Closed them and released their dispatch claims, so the affected ` +
            `shots can be dispatched again.`,
          actor: 'exec-dir-ai',
          episode_id: episodeId,
          metadata: { reason: 'QUEUE_RESET_ORPHAN', reaped: count },
        });
      }

      logger.info(`jobs-stale-reaper: reaped ${reaped} of ${stale.length} candidates`);
      return { ok: true as const, reaped, scanned: stale.length };
    });
  },
);
