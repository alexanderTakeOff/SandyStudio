// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/hog-monthly-rollup.ts
// HoG memory — monthly digest (multi-channel Phase 4b).
//
// On the 1st, PER ACTIVE CHANNEL: read the PREVIOUS monthly rollup + the
// weekly_rollup rows appended since it — and NOTHING else (the rollup law:
// each period reads only the previous tier, context stays bounded).
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { aggregateMonthly, type MemoryRow } from '@/lib/hog-memory-rollup';

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export const hogMonthlyRollup = inngest.createFunction(
  {
    id: 'hog-monthly-rollup',
    name: 'HoG: monthly memory rollup',
    retries: 1,
    concurrency: { limit: 1 },
  },
  { cron: '52 6 1 * *' }, // 1st of the month, 06:52 UTC — after the weekly slot
  async ({ step, logger }) => {
    const channels = await step.run('load-channels', async () => {
      const sb = createSupabaseServiceRoleClient();
      const { data, error } = await sb
        .from('channels')
        .select('id, name, credential_key')
        .eq('status', 'ACTIVE');
      if (error) throw new Error(`channels read failed: ${error.message}`);
      return data ?? [];
    });

    const failed: Array<{ channel: string; error: string }> = [];

    for (const ch of channels) {
      try {
        const result = await step.run(`rollup-${ch.credential_key}`, async () => {
          const sb = createSupabaseServiceRoleClient();

          const { data: prevRows } = await sb
            .from('hog_memory')
            .select('created_at, period_start, period_end, payload')
            .eq('channel_id', ch.id)
            .eq('kind', 'monthly_rollup')
            .order('created_at', { ascending: false })
            .limit(1);
          const prev = prevRows?.[0] ?? null;
          const sinceIso = prev?.created_at ?? '1970-01-01T00:00:00Z';

          // Idempotency: skip a duplicate firing inside the same month window.
          if (prev && Date.now() - new Date(prev.created_at).getTime() < 27 * 86_400_000) {
            return { skipped: true as const };
          }

          const { data: weekliesData, error: wErr } = await sb
            .from('hog_memory')
            .select('kind, status, unlock_date, created_at, payload')
            .eq('channel_id', ch.id)
            .eq('kind', 'weekly_rollup')
            .gt('created_at', sinceIso)
            .order('created_at', { ascending: true });
          if (wErr) throw new Error(`hog_memory weeklies read failed: ${wErr.message}`);
          const weeklies = (weekliesData ?? []) as MemoryRow[];

          const end = ymd(new Date());
          const start = prev?.period_end ?? (weeklies[0] ? weeklies[0].created_at.slice(0, 10) : end);
          const payload = aggregateMonthly(
            (prev?.payload as Record<string, unknown> | null) ?? null,
            weeklies,
            { start, end },
          );

          const { error: insErr } = await sb.from('hog_memory').insert({
            channel_id: ch.id,
            kind: 'monthly_rollup',
            period_start: start,
            period_end: end,
            payload: payload as never,
          });
          if (insErr) throw new Error(`hog_memory monthly insert failed: ${insErr.message}`);
          return { skipped: false as const, weeks: payload.weeks };
        });

        logger.info(`hog-monthly-rollup[${ch.credential_key}]: ${JSON.stringify(result)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push({ channel: ch.credential_key, error: msg });
        logger.error(`hog-monthly-rollup[${ch.credential_key}] FAILED: ${msg}`);
      }
    }

    if (failed.length > 0) {
      throw new Error(
        `hog-monthly-rollup: ${failed.length}/${channels.length} channel(s) failed: ` +
          failed.map((f) => `${f.channel}: ${f.error}`).join(' | '),
      );
    }
    return { channels: channels.length };
  },
);
