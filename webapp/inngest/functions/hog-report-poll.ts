// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/hog-report-poll.ts
// HoG observer #2 — the bulk-report poller (the impression/CTR route).
//
// Once a day, PER ACTIVE CHANNEL: make sure that channel's Reporting API jobs
// exist (idempotent), list every report available, and archive the ones we
// haven't stored yet into channel_reports — stamped with channel_id. Deduped by
// (channel_id, report_type, report_id) so re-polling is a no-op.
//
// This is the ONLY automated path to impressions + CTR — the Analytics API serves
// no such metric. Reports appear ~daily and backfill ~30 days from job creation,
// so the first useful file lands roughly a day after the jobs are first created.
//
// Same law as the snapshot heartbeat, per channel: a failed poll archives
// nothing for THAT channel and surfaces the error at the end — after the other
// channels' reports have been archived.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  ensureReportingJobs,
  listNewReports,
  downloadReport,
} from '@/lib/agents/providers/youtube-reporting';
import { resolveChannelRefreshToken } from '@/lib/agents/providers/google-auth';
import { assertChannelIdentity, type ChannelPassport } from '@/lib/agents/providers/channel-resolver';

export const hogReportPoll = inngest.createFunction(
  {
    id: 'hog-report-poll',
    name: 'HoG: bulk report poll (daily)',
    retries: 1,
    concurrency: { limit: 1 },
  },
  { cron: '17 6 * * *' }, // 06:17 UTC daily — off the top of the hour to dodge cron pileups
  async ({ step, logger }) => {
    // 0. The iteration set: every ACTIVE channel passport.
    const channels = await step.run('load-channels', async () => {
      const sb = createSupabaseServiceRoleClient();
      const { data, error } = await sb
        .from('channels')
        .select('id, name, youtube_channel_id, credential_key, ntfy_topic, status')
        .eq('status', 'ACTIVE');
      if (error) throw new Error(`channels read failed: ${error.message}`);
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        youtubeChannelId: row.youtube_channel_id,
        credentialKey: row.credential_key,
        ntfyTopic: row.ntfy_topic,
        status: row.status,
      })) as ChannelPassport[];
    });

    let totalArchived = 0;
    let totalAvailable = 0;
    const failed: Array<{ channel: string; error: string }> = [];

    for (const ch of channels) {
      try {
        // 1. Ensure this channel's jobs, then list what's available.
        const refs = await step.run(`ensure-and-list-${ch.credentialKey}`, async () => {
          const refreshToken = resolveChannelRefreshToken(ch.credentialKey);
          await assertChannelIdentity(ch, refreshToken);
          const auth = { refreshToken };
          const jobs = await ensureReportingJobs(auth);
          return listNewReports(jobs, auth);
        });

        totalAvailable += refs.length;
        if (refs.length === 0) {
          logger.info(`hog-report-poll[${ch.credentialKey}]: no reports available yet (jobs ensured)`);
          continue;
        }

        // 2. Which report_ids are already stored FOR THIS CHANNEL? step.run
        // JSON-serializes its return, so we pass an ARRAY (a Set would become {})
        // and rebuild the Set in plain code.
        const knownIds = await step.run(`load-known-${ch.credentialKey}`, async () => {
          const sb = createSupabaseServiceRoleClient();
          const ids = [...new Set(refs.map((r) => r.id))];
          const { data, error } = await sb
            .from('channel_reports')
            .select('report_id')
            .eq('channel_id', ch.id)
            .in('report_id', ids);
          if (error) throw new Error(`channel_reports read failed: ${error.message}`);
          return (data ?? []).map((r) => r.report_id as string);
        });

        const known = new Set(knownIds);
        const fresh = refs.filter((r) => !known.has(r.id));
        if (fresh.length === 0) {
          logger.info(`hog-report-poll[${ch.credentialKey}]: all ${refs.length} reports already archived`);
          continue;
        }

        // 3. Download + archive each new report. Header inspected for the CTR signal.
        const archived = await step.run(`archive-${ch.credentialKey}`, async () => {
          const sb = createSupabaseServiceRoleClient();
          const refreshToken = resolveChannelRefreshToken(ch.credentialKey);
          const auth = { refreshToken };
          let n = 0;
          for (const ref of fresh) {
            const csv = await downloadReport(ref, auth);
            const [header = '', ...bodyLines] = csv.split(/\r?\n/);
            const columns = header.split(',').map((c) => c.trim()).filter(Boolean);
            // Exact column check — the loose /impression/i regex used to false-flag
            // channel_basic_a3 (its `annotation_impressions` columns are NOT thumbnail
            // impressions; only reach_basic carries the real reach signal).
            const hasImpressions = columns.includes('video_thumbnail_impressions');
            const { error } = await sb.from('channel_reports').insert({
              channel_id: ch.id,
              report_type: ref.reportTypeId,
              report_id: ref.id,
              start_date: ref.startTime ? ref.startTime.slice(0, 10) : null,
              end_date: ref.endTime ? ref.endTime.slice(0, 10) : null,
              columns,
              row_count: bodyLines.filter(Boolean).length,
              has_impressions: hasImpressions,
              raw: csv,
            });
            // Unique (channel_id, report_type, report_id) — a concurrent insert of
            // the same report is a benign no-op, not a failure.
            if (error && !/duplicate key|unique/i.test(error.message)) {
              throw new Error(`channel_reports insert failed: ${error.message}`);
            }
            if (!error) n++;
          }
          return n;
        });

        totalArchived += archived;
        logger.info(
          `hog-report-poll[${ch.credentialKey}]: archived ${archived}/${fresh.length} new reports (${refs.length} available)`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push({ channel: ch.credentialKey, error: msg });
        logger.error(`hog-report-poll[${ch.credentialKey}] FAILED: ${msg}`);
      }
    }

    // Healthy channels are archived; a failure list still fails the run so the
    // broken sensor surfaces (per-channel "gap ≠ zero" law).
    if (failed.length > 0) {
      throw new Error(
        `hog-report-poll: ${failed.length}/${channels.length} channel(s) failed: ` +
          failed.map((f) => `${f.channel}: ${f.error}`).join(' | '),
      );
    }

    return { archived: totalArchived, available: totalAvailable };
  },
);
