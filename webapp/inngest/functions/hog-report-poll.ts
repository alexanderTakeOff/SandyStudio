// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/hog-report-poll.ts
// HoG observer #2 — the bulk-report poller (the impression/CTR route).
//
// Once a day: make sure the Reporting API jobs exist (idempotent), list every
// report available, and archive the ones we haven't stored yet into
// channel_reports. Deduped by (report_type, report_id) so re-polling is a no-op.
//
// This is the ONLY automated path to impressions + CTR — the Analytics API serves
// no such metric. Reports appear ~daily and backfill ~30 days from job creation,
// so the first useful file lands roughly a day after the jobs are first created.
//
// Same law as the snapshot heartbeat: a failed poll archives nothing and surfaces
// the error, rather than writing an empty/placeholder row.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  ensureReportingJobs,
  listNewReports,
  downloadReport,
} from '@/lib/agents/providers/youtube-reporting';

export const hogReportPoll = inngest.createFunction(
  {
    id: 'hog-report-poll',
    name: 'HoG: bulk report poll (daily)',
    retries: 1,
    concurrency: { limit: 1 },
  },
  { cron: '17 6 * * *' }, // 06:17 UTC daily — off the top of the hour to dodge cron pileups
  async ({ step, logger }) => {
    // 1. Ensure jobs, then list what's available. A throw = clean skip, retry tomorrow.
    const refs = await step.run('ensure-jobs-and-list', async () => {
      const jobs = await ensureReportingJobs();
      return listNewReports(jobs);
    });

    if (refs.length === 0) {
      logger.info('hog-report-poll: no reports available yet (jobs ensured)');
      return { archived: 0, available: 0 };
    }

    // 2. Which report_ids are already stored? Dedup so a download only happens once.
    // step.run JSON-serializes its return, so we pass an ARRAY (a Set would become
    // {}) and rebuild the Set in plain code.
    const knownIds = await step.run('load-known-report-ids', async () => {
      const sb = createSupabaseServiceRoleClient();
      const ids = [...new Set(refs.map((r) => r.id))];
      const { data, error } = await sb
        .from('channel_reports')
        .select('report_id')
        .in('report_id', ids);
      if (error) throw new Error(`channel_reports read failed: ${error.message}`);
      return (data ?? []).map((r) => r.report_id as string);
    });

    const known = new Set(knownIds);
    const fresh = refs.filter((r) => !known.has(r.id));
    if (fresh.length === 0) {
      logger.info(`hog-report-poll: all ${refs.length} reports already archived`);
      return { archived: 0, available: refs.length };
    }

    // 3. Download + archive each new report. Header inspected for the CTR signal.
    const archived = await step.run('download-and-archive', async () => {
      const sb = createSupabaseServiceRoleClient();
      let n = 0;
      for (const ref of fresh) {
        const csv = await downloadReport(ref);
        const [header = '', ...bodyLines] = csv.split(/\r?\n/);
        const columns = header.split(',').map((c) => c.trim()).filter(Boolean);
        // Exact column check — the loose /impression/i regex used to false-flag
        // channel_basic_a3 (its `annotation_impressions` columns are NOT thumbnail
        // impressions; only reach_basic carries the real reach signal).
        const hasImpressions = columns.includes('video_thumbnail_impressions');
        const { error } = await sb.from('channel_reports').insert({
          report_type: ref.reportTypeId,
          report_id: ref.id,
          start_date: ref.startTime ? ref.startTime.slice(0, 10) : null,
          end_date: ref.endTime ? ref.endTime.slice(0, 10) : null,
          columns,
          row_count: bodyLines.filter(Boolean).length,
          has_impressions: hasImpressions,
          raw: csv,
        });
        // Unique (report_type, report_id) — a concurrent insert of the same report
        // is a benign no-op, not a failure.
        if (error && !/duplicate key|unique/i.test(error.message)) {
          throw new Error(`channel_reports insert failed: ${error.message}`);
        }
        if (!error) n++;
      }
      return n;
    });

    logger.info(`hog-report-poll: archived ${archived}/${fresh.length} new reports (${refs.length} available)`);
    return { archived, available: refs.length };
  },
);
