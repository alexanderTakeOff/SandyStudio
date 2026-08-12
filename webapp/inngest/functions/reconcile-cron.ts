// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/reconcile-cron.ts
//
// Failure-spine Slice 4b (2026-07-16) — periodic reconciler heartbeat.
//
// The factory ticks the reconciler only AFTER an agent completes
// (factory.ts reconcile-trigger). But a SILENTLY dropped event (worker hiccup /
// fan-out drop — the TD-39 family) leaves a shot with no completion to react to:
// nothing fires, the reconciler never runs, and an armed autonomous episode
// parks forever with no escalation. A stall has no event of its own.
//
// This cron is that missing heartbeat: every 5 minutes it re-ticks the
// reconciler for every ARMED episode, so the state matrix is re-evaluated and
// any refire-or-halt (Slice 3) / auto-advance / stitch a dropped event would
// have triggered still happens.
//
// It does NOT call reconcileEpisode directly — it emits the same
// `sandystudio/reconcile/episode` event the factory does, so the existing
// subscriber (reconcile-episode.ts: debounce 5s + concurrency-1) owns
// convergence. A cron tick coinciding with a factory tick collapses in the
// debounce; an unarmed episode that slips through the SQL filter is still a
// no-op inside reconcileEpisode's own arm gate. Bounded per-tick cost.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { MANUAL_TERMINAL_STATUSES } from '@/lib/api/status-transitions';

const SCAN_LIMIT = 20; // bound the per-tick read cost (mirrors the watchdog)

export const reconcileCron = inngest.createFunction(
  {
    id: 'reconcile-cron',
    name: 'Reconcile heartbeat (5-min, armed episodes)',
    retries: 0,
  },
  { cron: '*/5 * * * *' },
  async ({ step, logger }) => {
    return step.run('tick-armed-episodes', async () => {
      const sb = createSupabaseServiceRoleClient();

      // Armed ⇔ metadata.reconciler_armed truthy AND governance_mode ∈ {2,3}
      // (mirrors isReconcilerArmed). The jsonb boolean `true` renders as the
      // string 'true' through the ->> text accessor. This DB filter is an
      // OPTIMIZATION only — reconcileEpisode re-checks isReconcilerArmed
      // internally, so a false positive here is a harmless no-op downstream.
      // Статус ТОЖЕ фильтр (2026-08-10). Взведённость никто не снимает при завершении
      // эпизода, поэтому COMPLETE/ARCHIVED оставались в тике навсегда — и однажды
      // выстрелили: S15-E31, завершённый в июле, получил сегодня полный круг
      // EREF-DESIGNER → EPREV → CREAD → EREF на $0.71, потому что у кадра SH21 не было
      // IMG-рефа и матрица увидела дырку. Готовое изделие не добивают. Список
      // терминальных берём у status-transitions — второго перечня статусов не заводим.
      const { data: eps, error } = await sb
        .from('episodes')
        .select('id')
        .eq('metadata->>reconciler_armed', 'true')
        .in('governance_mode', [2, 3])
        .not('status', 'in', `(${MANUAL_TERMINAL_STATUSES.join(',')})`)
        .limit(SCAN_LIMIT);
      if (error) {
        // A failed query must NOT be read as "no armed episodes". Skip this tick
        // and retry on the next — never fabricate work, never silently swallow.
        logger.warn(`reconcile-cron: episode query failed: ${error.message}`);
        return { skipped: 'query_failed' as const, error: error.message };
      }

      const ids = ((eps ?? []) as Array<{ id: string }>).map((e) => e.id);
      for (const episodeId of ids) {
        await inngest.send({
          name: 'sandystudio/reconcile/episode',
          data: { episodeId },
        });
      }
      return { ticked: ids.length };
    });
  },
);
