// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/hog-channel-snapshot.ts
// HoG observer #1 — the channel time-series heartbeat.
//
// Every 15 minutes: for EVERY ACTIVE channel passport, pull LIVE Data API
// counters for the whole catalogue + the channel, and append them (stamped with
// channel_id) to channel_snapshots. This is the fundamental growth instrument —
// from the series you read velocity (views/hour), plateaus, and the shape of a
// Shorts distribution wave, none of which a single snapshot shows.
//
// The one law (0045), now PER CHANNEL: a broken sensor must be distinguishable
// from a zero reading. If a channel's pull throws (auth, quota, network) we
// write NOTHING for that channel and record the failure — but the OTHER
// channels still get their rows. A gap in one channel's series means "that
// sensor was down", never "views were 0", and never "all sensors were down".
//
// Data API only — deliberately NOT the Analytics API, which lags ~3 days. Mixing
// live and lagged counters in one series is the exact lie the HoG doctrine forbids.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { listAllUploads } from '@/lib/providers/youtube';
import { getVideoStatistics, getChannelStatistics } from '@/lib/providers/youtube-stats';
import { resolveChannelRefreshToken } from '@/lib/providers/google-auth';
import { assertChannelIdentity, type ChannelPassport } from '@/lib/providers/channel-resolver';

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
    // 0. Load the ACTIVE channel passports — the iteration set.
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

    const ok: string[] = [];
    const failed: Array<{ channel: string; error: string }> = [];
    let totalRows = 0;

    for (const ch of channels) {
      // 1. Pull live counters for this channel. A throw aborts BEFORE any insert
      //    → a clean per-channel gap; other channels keep being read.
      try {
        const pull = await step.run(`pull-${ch.credentialKey}`, async () => {
          const refreshToken = resolveChannelRefreshToken(ch.credentialKey);
          await assertChannelIdentity(ch, refreshToken);
          const auth = { refreshToken };
          const channel = await getChannelStatistics(auth);
          const uploads = await listAllUploads(auth);
          const ids = uploads.map((u) => u.videoId).filter(Boolean);
          const stats = await getVideoStatistics(ids, auth);
          return { channel, stats };
        });

        // 2. Append the snapshot: one channel row + one row per video, same
        //    captured_at, all stamped with channel_id.
        const inserted = await step.run(`persist-${ch.credentialKey}`, async () => {
          const sb = createSupabaseServiceRoleClient();
          const capturedAt = new Date().toISOString();

          const rows = [
            {
              captured_at: capturedAt,
              channel_id: ch.id,
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
              channel_id: ch.id,
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

        totalRows += inserted;
        ok.push(ch.credentialKey);
        logger.info(
          `hog-channel-snapshot[${ch.credentialKey}]: ${inserted} rows (views ${pull.channel.viewCount}, subs ${pull.channel.subscriberCount})`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push({ channel: ch.credentialKey, error: msg });
        logger.error(`hog-channel-snapshot[${ch.credentialKey}] FAILED: ${msg}`);
      }
    }

    // Healthy channels are already persisted; a failure list still fails the run
    // so Inngest surfaces the broken sensor (per-channel "gap ≠ zero" law).
    if (failed.length > 0) {
      throw new Error(
        `hog-channel-snapshot: ${failed.length}/${channels.length} channel(s) failed: ` +
          failed.map((f) => `${f.channel}: ${f.error}`).join(' | '),
      );
    }

    return { rows: totalRows, channels: ok };
  },
);
