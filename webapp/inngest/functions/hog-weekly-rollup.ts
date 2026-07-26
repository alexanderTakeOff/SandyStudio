// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/hog-weekly-rollup.ts
// HoG memory — weekly digest (multi-channel Phase 4b).
//
// Once a week, PER ACTIVE CHANNEL: read the PREVIOUS weekly rollup + the
// hog_memory rows appended since it (daily_advice / hypothesis / experiment /
// decision — never the full history), fold them with the pure aggregator, and
// append one weekly_rollup row + one median_recalc row. Every hypothesis that
// turned CONFIRMED this week becomes a `rule_proposal` in the Director Inbox —
// the existing lesson channel (critic-discriminator pattern); after approval
// the Skill Editor writes the skill and the selector feeds it to agents.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { logEvent } from '@/lib/api/events';
import type { ServerSupabaseClient } from '@/lib/api/auth';
import { aggregateWeekly, type MemoryRow } from '@/lib/agents/hog-memory-rollup';

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export const hogWeeklyRollup = inngest.createFunction(
  {
    id: 'hog-weekly-rollup',
    name: 'HoG: weekly memory rollup',
    retries: 1,
    concurrency: { limit: 1 },
  },
  { cron: '37 6 * * 1' }, // Monday 06:37 UTC — after the 06:17 report poll
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
    let written = 0;

    for (const ch of channels) {
      try {
        const result = await step.run(`rollup-${ch.credential_key}`, async () => {
          const sb = createSupabaseServiceRoleClient();

          // 1. The previous weekly rollup — the ONLY history we read.
          const { data: prevRows } = await sb
            .from('hog_memory')
            .select('created_at, period_start, period_end, payload')
            .eq('channel_id', ch.id)
            .eq('kind', 'weekly_rollup')
            .order('created_at', { ascending: false })
            .limit(1);
          const prev = prevRows?.[0] ?? null;
          const sinceIso = prev?.created_at ?? '1970-01-01T00:00:00Z';

          // Idempotency: if the previous rollup is younger than 6 days, this is
          // a duplicate firing (retry/manual) — skip rather than double-write.
          if (prev && Date.now() - new Date(prev.created_at).getTime() < 6 * 86_400_000) {
            return { skipped: true as const };
          }

          // 2. Rows appended since it.
          const { data: rowsData, error: rowsErr } = await sb
            .from('hog_memory')
            .select('kind, status, unlock_date, created_at, payload')
            .eq('channel_id', ch.id)
            .in('kind', ['daily_advice', 'hypothesis', 'experiment', 'decision'])
            .gt('created_at', sinceIso)
            .order('created_at', { ascending: true });
          if (rowsErr) throw new Error(`hog_memory read failed: ${rowsErr.message}`);
          const rows = (rowsData ?? []) as MemoryRow[];

          const end = ymd(new Date());
          const start = prev?.period_end ?? (rows[0] ? rows[0].created_at.slice(0, 10) : end);
          const payload = aggregateWeekly(
            (prev?.payload as Record<string, unknown> | null) ?? null,
            rows,
            { start, end },
          );

          // 3. Append the rollup + this week's medians (median_recalc).
          const { error: insErr } = await sb.from('hog_memory').insert([
            {
              channel_id: ch.id,
              kind: 'weekly_rollup',
              period_start: start,
              period_end: end,
              payload: payload as never,
            },
            {
              channel_id: ch.id,
              kind: 'median_recalc',
              period_start: start,
              period_end: end,
              payload: payload.medians as never,
            },
          ]);
          if (insErr) throw new Error(`hog_memory rollup insert failed: ${insErr.message}`);

          // 4. Confirmed lessons → Director Inbox (rule_proposal), idempotent by
          //    signature — the discriminator's exact pattern, channel-scoped.
          const { data: existing } = await sb
            .from('activity_events')
            .select('metadata')
            .eq('event_type', 'rule_proposal');
          const seen = new Set(
            (existing ?? [])
              .map((e) => (e.metadata as { hog_signature?: unknown } | null)?.hog_signature)
              .filter((s): s is string => typeof s === 'string'),
          );
          for (const h of payload.confirmed_this_week) {
            const signature = `hog:${ch.id}:${h.slug}`;
            if (seen.has(signature)) continue;
            await logEvent(sb as unknown as ServerSupabaseClient, {
              event_type: 'rule_proposal',
              severity: 'info',
              title: `HoG confirmed lesson — ${ch.name}: ${h.slug}`,
              description:
                `${h.text}\n\nПодтверждено недельной свёрткой HoG (${start}…${end}). ` +
                'Approve → Skill Editor закрепит урок скиллом.',
              episode_id: null,
              actor: null,
              metadata: {
                source: 'hog_weekly_rollup',
                hog_signature: signature,
                channel_id: ch.id,
                hypothesis_slug: h.slug,
                auto_react: false,
              },
            });
          }

          return { skipped: false as const, rows: rows.length, confirmed: payload.confirmed_this_week.length };
        });

        if (!('skipped' in result) || !result.skipped) written++;
        logger.info(`hog-weekly-rollup[${ch.credential_key}]: ${JSON.stringify(result)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push({ channel: ch.credential_key, error: msg });
        logger.error(`hog-weekly-rollup[${ch.credential_key}] FAILED: ${msg}`);
      }
    }

    if (failed.length > 0) {
      throw new Error(
        `hog-weekly-rollup: ${failed.length}/${channels.length} channel(s) failed: ` +
          failed.map((f) => `${f.channel}: ${f.error}`).join(' | '),
      );
    }
    return { channels: channels.length, written };
  },
);
