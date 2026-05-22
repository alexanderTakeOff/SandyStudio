// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-pa-watchdog.ts
// TD-25 P2 — Polina open-loop watchdog. 2026-05-21.
//
// Problem: Polina's auto-react chain (exec-pa-react) fires only on positive
// events (agent_completed, approval_granted, claude_message, etc). When she
// writes "жду X" and X never happens (e.g. she expected auto-retry that
// doesn't exist), she silently stalls. Director has to notice and prompt.
//
// This function is a watchdog cron that runs every minute. For each open
// concierge_thread it checks the last assistant turn:
//   - if metadata.awaiting_director_input is set (stamped by P1+P3 detector)
//   - AND no Director / non-system / agent activity has happened since
//   - AND it's been >= 90 seconds since that turn
//   - AND we haven't already escalated this exact turn within last 5 min
// → fire sandystudio/pa/notify-needed with source='watchdog' so exec-pa-react
//   wakes Polina up. She then re-reads her own prior turn (per OPEN_LOOP_AWARENESS
//   block) and either takes the next concrete step or re-asks Director more
//   explicitly.
//
// Re-escalation cap: we mark each escalation in `activity_events` with
// event_type='pa_watchdog_escalation' + asset_id=<turn_id>. The check looks
// for any such event within last 5 min for the same turn. If found, skip —
// avoids forever-loop spam.
//
// Errors are logged but never throw — watchdog is best-effort.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { logEvent } from '@/lib/api/events';

/** Minimum age of the awaiting turn before we escalate. Gives Director a
 *  reasonable window to read and reply naturally before the watchdog nags. */
const MIN_TURN_AGE_MS = 90_000; // 90 seconds

/** Cooldown — don't re-escalate the same turn within this window. */
const ESCALATION_COOLDOWN_MS = 5 * 60_000; // 5 minutes

interface ThreadRow {
  id: string;
  episode_id: string | null;
}

interface TurnRow {
  id: string;
  thread_id: string;
  role: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export const execPaWatchdog = inngest.createFunction(
  {
    id: 'exec-pa-watchdog',
    name: 'EXEC-CONC: Open-loop watchdog (TD-25 P2)',
    retries: 0,
  },
  // Every minute. Inngest cron minimum is 1 min — that's our resolution.
  { cron: '* * * * *' },
  async ({ step, logger }) => {
    // KILL-SWITCH (2026-05-22): Supabase project exceed_egress_quota
    // surfaced this morning. Suspected root cause: watchdog → exec-pa-react
    // → new assistant turn with awaiting_director_input=true → next minute
    // watchdog finds new turn (different id, cooldown by asset_id doesn't
    // protect) → escalates → loop. Disable until: (a) cooldown changed to
    // thread-level instead of turn-level, OR (b) Director re-enables via
    // WATCHDOG_ENABLED=true once egress quota recovers / is upgraded.
    if (process.env.WATCHDOG_ENABLED !== 'true') {
      logger.info('watchdog: disabled by env (WATCHDOG_ENABLED!=true)');
      return { skipped: 'disabled_by_env', escalations: 0 };
    }
    const sb = createSupabaseServiceRoleClient();

    // ── Step 1: load open threads ─────────────────────────────────────────
    const threads = await step.run('load-open-threads', async () => {
      const { data, error } = await sb
        .from('concierge_threads')
        .select('id,episode_id')
        .is('ended_at', null);
      if (error) {
        logger.warn(`watchdog: open threads load failed: ${error.message}`);
        return [] as ThreadRow[];
      }
      return (data ?? []) as ThreadRow[];
    });

    if (threads.length === 0) {
      return { skipped: 'no_open_threads', escalations: 0 };
    }

    // ── Step 2: per-thread evaluation ─────────────────────────────────────
    const escalations: Array<{ threadId: string; turnId: string }> = [];

    for (const t of threads) {
      const escalation = await step.run(`thread-${t.id}`, async () => {
        // Latest turn (any role).
        const { data: latest } = await sb
          .from('concierge_turns')
          .select('id,thread_id,role,created_at,metadata')
          .eq('thread_id', t.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!latest) return null;
        const turn = latest as TurnRow;

        // Must be an assistant turn — Polina herself, not Director / pipeline.
        if (turn.role !== 'assistant') return null;

        const awaiting =
          (turn.metadata ?? {}) as Record<string, unknown>;
        if (!awaiting.awaiting_director_input) return null;

        // Age check — give Director a beat to reply naturally.
        const ageMs = Date.now() - new Date(turn.created_at).getTime();
        if (ageMs < MIN_TURN_AGE_MS) return null;

        // Cooldown check — already nagged about this exact turn recently?
        const cooldownStart = new Date(Date.now() - ESCALATION_COOLDOWN_MS).toISOString();
        const { data: priorEsc } = await sb
          .from('activity_events')
          .select('id')
          .eq('event_type', 'pa_watchdog_escalation')
          .eq('asset_id', turn.id)
          .gte('created_at', cooldownStart)
          .limit(1);
        if (priorEsc && priorEsc.length > 0) return null;

        // Fire pa/notify-needed via exec-pa-react path. Mark with source
        // so the prompt can distinguish a watchdog ping from a real event.
        await inngest.send({
          name: 'sandystudio/pa/notify-needed',
          data: {
            threadId: turn.thread_id,
            episodeId: t.episode_id,
            triggerId: turn.id,
            source: 'watchdog' as const,
            eventType: 'open_loop',
          },
        });

        // Log escalation so the cooldown sees it next minute.
        // TD-29.5 (2026-05-21): route through logEvent for consistency —
        // pa_watchdog_escalation is non-actionable so no Inngest fan-out fires.
        await logEvent(sb, {
          event_type: 'pa_watchdog_escalation',
          severity: 'info',
          title: 'PA open-loop watchdog escalation',
          description: `Polina turn ${turn.id} has awaiting_director_input set; no resolution in ${Math.round(ageMs / 1000)}s. Pinging exec-pa-react to re-engage.`,
          actor: 'EXEC-PA-WATCHDOG',
          episode_id: t.episode_id,
          asset_id: turn.id,
          metadata: {
            turn_id: turn.id,
            age_ms: ageMs,
            awaiting_question:
              (
                (awaiting.awaiting_director_input as { question?: string } | undefined)
                  ?.question ?? null
              ),
          },
        });

        return { turnId: turn.id };
      });

      if (escalation) {
        escalations.push({ threadId: t.id, turnId: escalation.turnId });
      }
    }

    return {
      checked_threads: threads.length,
      escalations: escalations.length,
      escalation_targets: escalations,
    };
  },
);
