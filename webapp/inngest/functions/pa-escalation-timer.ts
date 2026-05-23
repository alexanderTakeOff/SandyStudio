// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/pa-escalation-timer.ts
//
// Step 2 of the Supabase recovery sprint (2026-05-22). Replaces the
// every-minute `exec-pa-watchdog` cron with an event-driven escalation
// timer that idles to zero work when nothing is pending.
//
// Director's principle: don't poll external paid services on a fixed
// interval. Only spend Supabase egress when a real event happened.
//
// Lifecycle:
//
//   1. Polina calls `markAwaitingDirector(...)` (or the deprecated regex
//      detector fires) → `persistTurn()` stamps the assistant turn's
//      metadata.awaiting_director_input → fires
//      `sandystudio/pa/awaiting-set` with {threadId, turnId, question,
//      deadlineSec, source}.
//
//   2. This function triggers. It sleeps for `deadlineSec` (clamped) and
//      then re-checks: is the original awaiting turn still the latest
//      assistant turn AND has no director-role turn arrived since?
//      If yes → fire ONE `pa/notify-needed` with source='timer'.
//      If no → exit silently.
//
//   3. The `cancelOn` rule cancels the sleeping function as soon as a
//      director-role turn arrives in the same thread. NO Supabase reads,
//      NO escalation, ZERO egress in the happy path where Director
//      replies quickly.
//
// This eliminates the recursive loop the watchdog enabled: each awaiting
// state arms one timer; that timer can escalate at most once; cancelOn
// kills it cleanly when Director answers. The hourly orphan sweep
// (separate function) is the bounded-cost insurance against missed
// signals (server crash window etc.).
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  clampDeadlineSec,
  decideEscalation,
} from './pa-escalation-timer-core';

interface LatestTurnRow {
  id: string;
  role: string;
  created_at: string;
}

export const paEscalationTimer = inngest.createFunction(
  {
    id: 'pa-escalation-timer',
    name: 'PA escalation timer (TD-25 P4, replaces watchdog cron)',
    retries: 0,
    // Cancel this run instantly when a director-role turn lands in the same
    // thread. CEL: trigger event is in `event`; the cancelling event is in
    // `async`. We need both threadId match AND role==director to cancel.
    cancelOn: [
      {
        event: 'sandystudio/concierge/turn-inserted',
        if: 'event.data.threadId == async.data.threadId && async.data.role == "director"',
      },
    ],
  },
  { event: 'sandystudio/pa/awaiting-set' },
  async ({ event, step, logger }) => {
    const { threadId, turnId, episodeId, question, deadlineSec, source } =
      event.data;

    const clamped = clampDeadlineSec(deadlineSec);

    // Sleep the deadline. If a director turn lands in the same thread,
    // cancelOn kills this run before we wake.
    await step.sleep('await-deadline', `${clamped}s`);

    // Re-check Director-state via Supabase. Cheap query: only the latest
    // turn role + timestamp for this thread. If a director-role turn has
    // somehow appeared since the cancelOn window (race), bail. If a newer
    // assistant turn has appeared, the original awaiting state is stale and
    // we should not escalate against it.
    const escalation = await step.run('re-check-and-escalate', async () => {
      const sb = createSupabaseServiceRoleClient();
      const intent = await decideEscalation(threadId, turnId, {
        async getLatestTurn(tid) {
          const { data, error } = await sb
            .from('concierge_turns')
            .select('id,role,created_at')
            .eq('thread_id', tid)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) return { data: null, error: { message: error.message } };
          return { data: (data as LatestTurnRow | null) ?? null, error: null };
        },
      });

      if (intent.intent === 're_check_failed') {
        logger.warn(
          `pa-escalation-timer: re-check failed for thread ${threadId}: ${intent.reason}`,
        );
        return { skipped: 're_check_failed' as const };
      }
      if (intent.intent === 'no_turns_found') {
        return { skipped: 'no_turns_found' as const };
      }
      if (intent.intent === 'state_moved_on') {
        return {
          skipped: 'state_moved_on' as const,
          latest_role: intent.latestRole,
          latest_turn_id: intent.latestTurnId,
        };
      }
      // Original awaiting still pinned. Fire ONE pa/notify-needed with
      // source='timer' so exec-pa-react / chat-internal can render an
      // appropriate ping-the-Director message.
      await inngest.send({
        name: 'sandystudio/pa/notify-needed',
        data: {
          threadId,
          episodeId: episodeId ?? null,
          source: 'timer',
          triggerId: turnId,
          eventType: 'escalation',
        },
      });
      return {
        escalated: true,
        question,
        deadline_sec: clamped,
        upstream_source: source,
      };
    });

    return escalation;
  },
);
