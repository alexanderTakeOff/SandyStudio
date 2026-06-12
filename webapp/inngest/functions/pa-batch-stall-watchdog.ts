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

const IDLE_MIN = 6; // no job activity for this long while FANOUT_RUNNING = stalled
const COOLDOWN_MIN = 12; // don't re-nudge the same episode within this window
const SCAN_LIMIT = 20; // bound the per-tick read cost
// F4 (2026-06-12): Mode-4 idle sweep — only episodes that ran something within
// this window count as "active session"; older idleness is a parked episode.
const ACTIVE_WINDOW_H = 2;

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

      // F4 (2026-06-12, E07 smoke): the FANOUT_RUNNING flag covers only the
      // EREF fan-out phase — both real stalls of the smoke (SH03 Designer
      // deadlock, 20 min; "announced but never executed", 60 min) happened
      // OUTSIDE it and the watchdog stayed silent. Second sweep scope:
      // Mode-4 (AUTOTEST) episodes are autonomous by definition — the chain
      // must keep moving until the episode is done. One that ran something
      // within the last ACTIVE_WINDOW_H hours but has been idle ≥ IDLE_MIN
      // is stalled, whatever the phase. Polina re-evaluates state before
      // acting, so a nudge after legitimate completion is harmless (and the
      // cooldown caps spam).
      const { data: mode4Eps, error: m4Err } = await sb
        .from('episodes')
        .select('id,metadata')
        .eq('governance_mode', 4)
        .limit(SCAN_LIMIT);
      if (m4Err) {
        logger.warn(`batch-watchdog: mode-4 query failed: ${m4Err.message}`);
      }
      const byId = new Map<string, { id: string; metadata: Record<string, unknown> | null }>();
      for (const e of (eps ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>) {
        byId.set(e.id, e);
      }
      for (const e of (mode4Eps ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>) {
        if (!byId.has(e.id)) byId.set(e.id, e);
      }
      const candidates = [...byId.values()];
      if (candidates.length === 0) {
        return { ok: true as const, scanned: 0, nudged: 0 };
      }

      let nudged = 0;
      for (const ep of candidates) {
        const meta = ep.metadata ?? {};
        const isFanoutRunning = meta.eref_pilot_state === 'FANOUT_RUNNING';

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
        // Mode-4-only candidates (no FANOUT_RUNNING flag): require recent
        // activity inside ACTIVE_WINDOW_H — an episode idle for days is
        // parked, not stalled; nudging it would be noise.
        if (!isFanoutRunning) {
          if (lastTs === 0 || now - lastTs > ACTIVE_WINDOW_H * 3_600_000) continue;
        }

        // Stalled → nudge Polina to re-evaluate and continue. exec-pa-react
        // resolves the thread, debounces, and she re-checks scope before acting.
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

      return { ok: true as const, scanned: candidates.length, nudged };
    });
  },
);
