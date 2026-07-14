// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/pa-batch-stall-watchdog.ts
//
// 2026-06-03 — fast, scope-aware watchdog for mid-batch stalls.
//
// Why this exists: Polina (EXEC-CONC) drives multi-shot batches REACTIVELY —
// each completion fires `pa/notify-needed`, she reacts, dispatches the next.
// She has no internal counter. If a completion event is lost (worker hiccup /
// fan-out drop, the TD-39 family) the chain has nothing to react to and she
// silently stops mid-batch (Director: "asked for 12 pictures, she stopped at 6").
//
// The existing safety nets (pa-escalation-timer, pa-orphaned-awaiting-sweep)
// only catch the "awaiting Director" state and the sweep runs HOURLY — far too
// slow, and a silent batch stall never sets the awaiting flag. So in practice
// the Director was the watchdog (the manual "kick").
//
// This is that kick, automated and TARGETED: an EREF fan-out that is marked
// FANOUT_RUNNING but has had NO job activity for IDLE_MIN minutes is stalled.
// We re-fire `pa/notify-needed` so Polina re-evaluates and continues — she
// still checks state and her standing-approval scope before acting, so a
// spurious nudge cannot make her over-spend. Bounded cost; per-episode cooldown
// prevents nudge spam.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveOpenThreadId,
  loadRecentTurns,
  closeStaleConciergeThreads,
} from '@/lib/concierge/threads';
import { isActionableEventType, isSelfCausedNotify } from '@/lib/api/event-actionable';

const IDLE_MIN = 6; // no job activity for this long while FANOUT_RUNNING = stalled
const COOLDOWN_MIN = 12; // don't re-nudge the same episode within this window
const SCAN_LIMIT = 20; // bound the per-tick read cost
// Idle-sweep active-session window: only episodes that ran something within
// this window count as active; older idleness is a parked episode.
const ACTIVE_WINDOW_H = 2;
// 2026-06-25 (loop-fix W1.b): close OPEN concierge threads idle longer than this
// so the watchdog/ambient can't keep nudging dead threads. Env-overridable.
const THREAD_TTL_MIN = Math.max(30, Number(process.env.CONCIERGE_THREAD_TTL_MIN) || 180);

/**
 * The "parked for hours" pre-filter (ACTIVE_WINDOW_H) applies only to plain
 * idle-sweep candidates. FANOUT_RUNNING and autonomous-run episodes are
 * explicitly-active sessions, so they skip it and rely purely on the
 * thread-aware new-actionable-state guard to decide whether to nudge.
 */
export function appliesParkedFilter(flags: {
  isFanoutRunning: boolean;
  isAutonomousRun: boolean;
}): boolean {
  return !flags.isFanoutRunning && !flags.isAutonomousRun;
}

export const paBatchStallWatchdog = inngest.createFunction(
  {
    id: 'pa-batch-stall-watchdog',
    name: 'PA batch-stall watchdog (5-min)',
    retries: 0,
  },
  { cron: '*/5 * * * *' },
  async ({ step, logger }) => {
    return step.run('sweep-stalled-batches', async () => {
      const sb = createSupabaseServiceRoleClient();
      const now = Date.now();
      // Thin-agent kill-switch (2026-07-03): opt-in autonomous-run nudging.
      // Off by default — only the flagged Mode-3 run episode is ever swept.
      const thinAgentEnabled = process.env.THIN_AGENT_ENABLED === 'true';

      // Reap stale OPEN threads first so we never nudge a dead conversation
      // (and so resolveOpenThreadId below picks a genuinely live thread).
      const reaped = await closeStaleConciergeThreads(sb, THREAD_TTL_MIN).catch(() => 0);

      // Episodes whose EREF fan-out is marked running (the explicit
      // "batch in progress" flag, mirrored into episode metadata).
      const { data: eps, error } = await sb
        .from('episodes')
        .select('id,metadata')
        .eq('metadata->>eref_pilot_state', 'FANOUT_RUNNING')
        .limit(SCAN_LIMIT);
      if (error) {
        logger.warn(`batch-watchdog: episode query failed: ${error.message}`);
        return { skipped: 'query_failed' as const, error: error.message };
      }

      // The FANOUT_RUNNING flag covers only the EREF fan-out phase — real stalls
      // (SH03 Designer deadlock; "announced but never executed") happen OUTSIDE
      // it. The Mode-3 autonomous-run sweep below (opt-in) is the second scope
      // that catches those; ordinary Director-driven modes stall visibly in the
      // Inbox and don't need a watchdog nudge.
      const byId = new Map<string, { id: string; metadata: Record<string, unknown> | null }>();
      for (const e of (eps ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>) {
        byId.set(e.id, e);
      }

      // Thin-agent autonomous run (2026-07-03): a Mode-3 episode explicitly
      // flagged metadata.autonomous_run drives the "thin agent + Polina" loop —
      // the thin agent keeps Polina moving through every gate while Тео watches
      // in the Director seat. Same idle-sweep as Mode 4, but opt-in per episode
      // and behind THIN_AGENT_ENABLED so ordinary Mode-3 work is never nudged.
      // Reuses every guard below; only the "parked" pre-filter is relaxed
      // (isAutonomousRun) so approval gates with no fresh job still get driven.
      if (thinAgentEnabled) {
        const { data: autoEps, error: aErr } = await sb
          .from('episodes')
          .select('id,metadata')
          .eq('governance_mode', 3)
          .eq('metadata->>autonomous_run', 'true')
          .limit(SCAN_LIMIT);
        if (aErr) {
          logger.warn(`batch-watchdog: autonomous-run query failed: ${aErr.message}`);
        }
        for (const e of (autoEps ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>) {
          if (!byId.has(e.id)) byId.set(e.id, e);
        }
      }
      const candidates = [...byId.values()];
      if (candidates.length === 0) {
        return { ok: true as const, scanned: 0, nudged: 0, reaped };
      }

      let nudged = 0;
      for (const ep of candidates) {
        const meta = ep.metadata ?? {};
        const isFanoutRunning = meta.eref_pilot_state === 'FANOUT_RUNNING';
        // Autonomous-run episodes are an explicitly-flagged active session, so
        // they skip the "parked for hours" pre-filter below and rely purely on
        // the thread-aware new-actionable-state guard to gate a nudge.
        const isAutonomousRun = meta.autonomous_run === true;

        // Cooldown — skip if we nudged this episode recently.
        const lastNudge = meta.batch_watchdog_nudged_at;
        if (typeof lastNudge === 'string') {
          const ageMs = now - new Date(lastNudge).getTime();
          if (ageMs < COOLDOWN_MIN * 60_000) continue;
        }

        // Idle check — latest job activity for the episode.
        const { data: lastJob, error: jobErr } = await sb
          .from('jobs')
          .select('started_at,completed_at')
          .eq('episode_id', ep.id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        // A failed query must NOT be read as "no activity → stalled" (that would
        // fire a spurious nudge). Skip this episode on error; next tick retries.
        if (jobErr) continue;
        const lastTs = lastJob
          ? Math.max(
              lastJob.completed_at ? new Date(lastJob.completed_at).getTime() : 0,
              lastJob.started_at ? new Date(lastJob.started_at).getTime() : 0,
            )
          : 0;
        // If something ran within IDLE_MIN, the batch is still moving — leave it.
        if (lastTs > 0 && now - lastTs < IDLE_MIN * 60_000) continue;
        // Autonomous-run candidates (no FANOUT_RUNNING flag): require recent
        // activity inside ACTIVE_WINDOW_H — an episode idle for days is
        // parked, not stalled; nudging it would be noise.
        if (appliesParkedFilter({ isFanoutRunning, isAutonomousRun })) {
          if (lastTs === 0 || now - lastTs > ACTIVE_WINDOW_H * 3_600_000) continue;
        }

        // ── Loop-fix W1.b (2026-06-25): thread-aware "no NEW state" guard ──────
        // The original watchdog re-fired forever: its stall test reads only
        // `jobs` timestamps with no thread awareness, so a flagged-but-DONE
        // episode satisfied "idle ≥6min" every cooldown and nudged Polina into
        // an empty Opus auto-react each time. Two guards stop the ping-pong:
        //   (1) if Polina already spoke recently in the thread, a nudge is echo;
        //   (2) only nudge when there is genuinely NEW actionable state (an
        //       actionable, non-self-caused activity_event newer than her last
        //       turn / last nudge). No new state → nothing to react to → skip.
        const threadId = await resolveOpenThreadId(sb, ep.id);
        if (!threadId) continue; // no live thread to nudge
        const lastTurn = (await loadRecentTurns(sb, threadId, 1))[0];
        const lastTurnTs = lastTurn?.created_at
          ? new Date(lastTurn.created_at).getTime()
          : 0;
        // (1) She spoke within IDLE_MIN — give her room, don't echo.
        if (
          lastTurn?.role === 'assistant' &&
          lastTurnTs > 0 &&
          now - lastTurnTs < IDLE_MIN * 60_000
        ) {
          continue;
        }
        // (2) Require new actionable state since the later of {last turn, last nudge}.
        const lastNudgeTs =
          typeof lastNudge === 'string' ? new Date(lastNudge).getTime() : 0;
        const sinceIso = new Date(Math.max(lastTurnTs, lastNudgeTs)).toISOString();
        const { data: freshEvents, error: feErr } = await sb
          .from('activity_events')
          .select('event_type,actor,created_at')
          .eq('episode_id', ep.id)
          .gt('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(20);
        if (feErr) continue; // query failed — don't fabricate a stall, retry next tick
        const hasNewActionable = (freshEvents ?? []).some(
          (e: { event_type: string; actor: string | null }) =>
            isActionableEventType(e.event_type) &&
            !isSelfCausedNotify(e.event_type, e.actor),
        );
        if (!hasNewActionable) continue; // nothing new to react to → no nudge

        // Stalled WITH new state → nudge Polina to re-evaluate and continue.
        await inngest.send({
          name: 'sandystudio/pa/notify-needed',
          data: {
            episodeId: ep.id,
            source: 'watchdog',
            triggerId: ep.id,
            eventType: 'batch_stall',
          },
        });

        // Stamp cooldown marker (best-effort, read-merge-write).
        await sb
          .from('episodes')
          .update({
            metadata: { ...meta, batch_watchdog_nudged_at: new Date(now).toISOString() } as never,
          })
          .eq('id', ep.id);
        nudged += 1;
        logger.info(`batch-watchdog: nudged stalled fan-out for episode ${ep.id}`);
      }

      return { ok: true as const, scanned: candidates.length, nudged, reaped };
    });
  },
);
