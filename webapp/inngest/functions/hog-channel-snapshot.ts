// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/hog-channel-snapshot.ts
// HoG observer #1 — the channel time-series heartbeat.
//
// Every 15 minutes: pull LIVE Data API counters for the whole catalogue + the
// channel, and append them to channel_snapshots. This is the fundamental growth
// instrument — from the series you read velocity (views/hour), plateaus, and the
// shape of a Shorts distribution wave, none of which a single snapshot shows.
//
// The one law (0045): a broken sensor must be distinguishable from a zero reading.
// So if the pull throws (auth, quota, network) we write NOTHING and surface the
// error — a GAP in the series means "sensor was down", never "views were 0". We
// never fabricate a zero row.
//
// Data API only — deliberately NOT the Analytics API, which lags ~3 days. Mixing
// live and lagged counters in one series is the exact lie the HoG doctrine forbids.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { listAllUploads } from '@/lib/agents/providers/youtube';
import { getVideoStatistics, getChannelStatistics } from '@/lib/agents/providers/youtube-stats';

export const hogChannelSnapshot = inngest.createFunction(
  {
    id: 'hog-channel-snapshot',
    name: 'HoG: channel snapshot heartbeat (15-min)',
    retries: 1,
    // One catalogue-wide read at a time — never let two ticks overlap and double-write.
    concurrency: { limit: 1 },
  },
  { cron: '*/15 * * * *' },
  async ({ step, logger }) => {
    // 1. Pull live counters. A throw here aborts BEFORE any insert → a clean gap.
    const pull = await step.run('pull-live-counters', async () => {
      const channel = await getChannelStatistics();
      const uploads = await listAllUploads();
      const ids = uploads.map((u) => u.videoId).filter(Boolean);
      const stats = await getVideoStatistics(ids);
      return { channel, stats };
    });

    // 2. Append the snapshot. One channel row + one row per video, same captured_at.
    const inserted = await step.run('persist-snapshot', async () => {
      const sb = createSupabaseServiceRoleClient();
      const capturedAt = new Date().toISOString();

      const rows = [
        {
          captured_at: capturedAt,
          scope: 'channel' as const,
          video_id: null,
          views: pull.channel.viewCount,
          likes: 0,
          comments: 0,
          subscribers: pull.channel.subscriberCount,
          videos_count: pull.channel.videoCount,
          privacy: null,
        },
        ...pull.stats.map((s) => ({
          captured_at: capturedAt,
          scope: 'video' as const,
          video_id: s.videoId,
          views: s.viewCount,
          likes: s.likeCount,
          comments: s.commentCount,
          subscribers: null,
          videos_count: null,
          privacy: s.publicationState,
        })),
      ];

      const { error } = await sb.from('channel_snapshots').insert(rows);
      if (error) throw new Error(`channel_snapshots insert failed: ${error.message}`);
      return rows.length;
    });

    logger.info(`hog-channel-snapshot: ${inserted} rows (channel views ${pull.channel.viewCount}, subs ${pull.channel.subscriberCount})`);
    return { rows: inserted, channelViews: pull.channel.viewCount, subscribers: pull.channel.subscriberCount };
  },
);
