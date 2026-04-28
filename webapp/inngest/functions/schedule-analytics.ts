// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/schedule-analytics.ts
// Cron fan-out per webapp.md §4.3.
//
// Listens to `sandystudio/exec-pub/published` and schedules 4 future
// `exec-anal/collect` events at T+1h, T+24h, T+7d, T+30d relative to the
// publish timestamp.
//
// Inngest's `step.sendEvent` accepts a `ts: Date` (or epoch ms) that defers
// dispatch until that moment. Cloud Inngest holds events up to 1 year.
// On the dev server, deferred events fire immediately on cold start so the
// replay-pilot harness sees all 4 analytics rows materialize quickly.
//
// This is NOT an agent — it's pure event plumbing. No jobs row, no asset
// write, no cost record. Just transforms one event into four scheduled events.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';

const POINTS = [
  { label: 'T+1h' as const, delayMs: 60 * 60 * 1000 },
  { label: 'T+24h' as const, delayMs: 24 * 60 * 60 * 1000 },
  { label: 'T+7d' as const, delayMs: 7 * 24 * 60 * 60 * 1000 },
  { label: 'T+30d' as const, delayMs: 30 * 24 * 60 * 60 * 1000 },
] as const;

export const scheduleAnalytics = inngest.createFunction(
  {
    id: 'schedule-analytics',
    name: 'Schedule Analytics Collection',
    retries: 1,
  },
  { event: 'sandystudio/exec-pub/published' },
  async ({ event, step }) => {
    const { episodeId, youtubeVideoId, publishTimestamp } = event.data;

    await step.sendEvent(
      'fan-out-analytics',
      POINTS.map((p) => ({
        name: 'sandystudio/exec-anal/collect' as const,
        data: {
          episodeId,
          youtubeVideoId,
          collectionPoint: p.label,
        },
        ts: publishTimestamp + p.delayMs,
      })),
    );

    return {
      ok: true,
      scheduled: POINTS.map((p) => p.label),
      youtubeVideoId,
    };
  },
);
