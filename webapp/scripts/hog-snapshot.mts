// hog-snapshot.mts — READ-ONLY daily channel snapshot for the Head of Growth loop.
// Reuses the existing YouTube providers (no duplicated API logic) + the archived
// Reporting CSV bridge, and persists one structured JSON per RUN per CHANNEL so
// the daily brain can diff today against yesterday. No writes to YouTube, ever.
//
// Multi-channel Phase 4a (2026-07-26): iterates channels WHERE status='ACTIVE'
// with the channel's own token + identity guard (mirrors
// inngest/functions/hog-channel-snapshot.ts). One channel failing does not sink
// the others; exit≠0 only when EVERY channel failed.
//
// Run:  node --env-file=.env.local --import tsx scripts/hog-snapshot.mts
//       (cwd = webapp; needs GOOGLE_* + YOUTUBE_REFRESH_TOKEN_<KEY> + SUPABASE_* in env)
//
// Output: ../docs/distribution/snapshots/<YYYY-MM-DD>T<HHMM>Z-<CREDENTIAL_KEY>.json
//         (repo-root relative; one file per channel, stdout = one path per line)

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // webapp/scripts
const outDir = join(here, '..', '..', 'docs', 'distribution', 'snapshots');
// Lifetime window for the Analytics reads — earlier than any channel's first upload.
const ANALYTICS_SINCE = '2026-01-01';

// Dynamic imports: tsx's ESM interop mis-links static named imports from sibling
// .ts modules ("does not provide an export named …"); dynamic import resolves fine.
// --history <videoId> [hours]: READ-ONLY replay of the 15-minute archive that the
// Inngest snapshot job already writes to `channel_snapshots`. Added 2026-08-01
// after the daily brain issued a false verdict ("the views axis lags a day") on a
// video that had in fact been unpublished and relaunched mid-day: the daily JSON
// pair cannot see a transition that opens AND closes between two snapshots, while
// the 15-minute archive records it. No new table, no new collector — one read mode
// on the handle that already owns this data.
async function history(videoId: string, hours: number) {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data, error } = await sb
    .from('channel_snapshots')
    .select('captured_at, views, privacy')
    .eq('video_id', videoId)
    .gte('captured_at', since)
    .order('captured_at', { ascending: true });
  if (error) throw new Error(`history read failed: ${error.message}`);
  const rows = data ?? [];
  if (!rows.length) {
    console.log(`no snapshots for ${videoId} in the last ${hours}h`);
    return;
  }
  let prevPrivacy: string | null = null;
  let lastWentPublic: string | null = null;
  console.log(`video ${videoId} — ${rows.length} snapshots over ${hours}h`);
  for (const r of rows) {
    if (r.privacy !== prevPrivacy) {
      console.log(`  [${r.captured_at.slice(0, 16)}] privacy: ${prevPrivacy ?? '—'} -> ${r.privacy}`);
      if (r.privacy === 'public') lastWentPublic = r.captured_at;
      prevPrivacy = r.privacy;
    }
  }
  // Hourly curve counted from the LAST transition into public — that, not
  // publishedAt, is when this video's current run at the feed actually started.
  const t0 = lastWentPublic ? new Date(lastWentPublic).getTime() : new Date(rows[0].captured_at).getTime();
  console.log(
    lastWentPublic
      ? `  clock starts at ${new Date(t0).toISOString().slice(0, 16)} (last transition into public)`
      : `  NEVER went public in this window — clock starts at the first snapshot ` +
        `${new Date(t0).toISOString().slice(0, 16)}; the hours below are NOT airtime`,
  );
  let nextMark = 0;
  for (const r of rows) {
    const h = (new Date(r.captured_at).getTime() - t0) / 3600_000;
    if (h < -0.01 || h < nextMark) continue;
    console.log(`  +${h.toFixed(1).padStart(5)}h  views=${String(r.views).padStart(6)}  ${r.privacy}`);
    nextMark = Math.floor(h) + 1;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const hi = argv.indexOf('--history');
  if (hi !== -1) {
    const videoId = argv[hi + 1];
    if (!videoId) throw new Error('--history needs a videoId');
    await history(videoId, Number(argv[hi + 2]) || 48);
    return;
  }
  const { createClient } = await import('@supabase/supabase-js');
  const { readReachMetricsFromArchive } = await import('../lib/agents/providers/youtube-reporting.ts');
  const { getChannelStatistics, getVideoStatistics, getVideoAnalytics, isCompletionReadable } =
    await import('../lib/agents/providers/youtube-stats.ts');
  const { listAllUploads } = await import('../lib/agents/providers/youtube.ts');
  const { resolveChannelRefreshToken } = await import('../lib/agents/providers/google-auth.ts');
  const { assertChannelIdentity } = await import('../lib/agents/providers/channel-resolver.ts');

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: channelRows, error } = await sb
    .from('channels')
    .select('id, name, youtube_channel_id, credential_key, ntfy_topic, status')
    .eq('status', 'ACTIVE');
  if (error) throw new Error(`channels read failed: ${error.message}`);
  if (!channelRows?.length) throw new Error('No ACTIVE channels in the passport table');

  const ok: string[] = [];
  const failed: Array<{ channel: string; error: string }> = [];

  for (const row of channelRows) {
    const passport = {
      id: row.id,
      name: row.name,
      youtubeChannelId: row.youtube_channel_id,
      credentialKey: row.credential_key,
      ntfyTopic: row.ntfy_topic,
      status: row.status,
    };
    try {
      const refreshToken = resolveChannelRefreshToken(passport.credentialKey);
      await assertChannelIdentity(passport as never, refreshToken);
      const auth = { refreshToken };

      const channel = await getChannelStatistics(auth);
      const uploads = await listAllUploads(auth);
      const ids = uploads.map((u: any) => u.videoId).filter(Boolean);
      const stats = await getVideoStatistics(ids, auth);
      const statById = new Map(stats.map((s: any) => [s.videoId, s]));
      // Reach layer is best-effort: an empty/failed archive must NOT sink the snapshot.
      // Scoped to THIS channel's archive rows — never merge channels.
      const reach = await readReachMetricsFromArchive(sb as any, passport.id).catch(() => new Map());

      // Retention is the gate metric of the growth ladder (completion > channel median =
      // the feed escalates). Best-effort per video: a null here must not sink the snapshot.
      const today = new Date().toISOString().slice(0, 10);
      const analyticsById = new Map<string, any>();
      for (const id of ids) {
        const a = await getVideoAnalytics(id, ANALYTICS_SINCE, today, auth).catch(() => null);
        if (a) analyticsById.set(id, a);
      }

      const rows = uploads.map((u: any) => {
        const s: any = statById.get(u.videoId);
        const r: any = reach.get(u.videoId);
        const a: any = analyticsById.get(u.videoId);
        return {
          id: u.videoId,
          title: u.title,
          state: s?.publicationState ?? '?',
          liveAt: s?.liveAt ?? null,
          durationSeconds: s?.durationSeconds ?? 0,
          views: s?.viewCount ?? 0,
          likes: s?.likeCount ?? 0,
          comments: s?.commentCount ?? 0,
          impressions: r?.impressions ?? null,
          impressionCtr: r?.impressionCtr ?? null,
          subscribersGained: r?.subscribersGained ?? null,
          subscribersLost: r?.subscribersLost ?? null,
          trafficSources: r?.trafficSources ?? null,
          // Readable completion only (0..100]; loop-inflated figures measure the operator's
          // own browser, not an audience — kept raw alongside so the brain can say WHY it is null.
          avgViewPercentage: isCompletionReadable(a?.averageViewPercentage)
            ? a.averageViewPercentage
            : null,
          avgViewPercentageRaw: a?.averageViewPercentage ?? null,
          avgViewDurationSeconds: a?.averageViewDuration ?? null,
        };
      });
      rows.sort((a: any, b: any) => b.views - a.views);

      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const snapshot = {
        date,
        collectedAt: now.toISOString(),
        channelKey: passport.credentialKey,
        channelId: passport.id,
        channelName: passport.name,
        youtubeChannelId: passport.youtubeChannelId,
        channel,
        videoCount: rows.length,
        rows,
      };

      mkdirSync(outDir, { recursive: true });
      // Filename carries the UTC time + the channel key, so a second run the same
      // day can never overwrite the first one and two channels never collide.
      const outPath = join(
        outDir,
        `${date}T${now.toISOString().slice(11, 16).replace(':', '')}Z-${passport.credentialKey}.json`,
      );
      writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
      // Stdout stays machine-parseable: one path per line, human summary on stderr.
      console.error(
        `[hog-snapshot] ${date} ${passport.credentialKey}: subs=${channel.subscriberCount} ` +
          `views=${channel.viewCount} public=${rows.filter((r: any) => r.state === 'public').length}/${rows.length}`,
      );
      console.log(outPath);
      ok.push(passport.credentialKey);
    } catch (e: any) {
      failed.push({ channel: passport.credentialKey, error: e?.message ?? String(e) });
      console.error(`[hog-snapshot] ${passport.credentialKey} FAILED: ${e?.message ?? e}`);
    }
  }

  console.error(
    `[hog-snapshot] done: ok=[${ok.join(', ')}] failed=[${failed.map((f) => f.channel).join(', ')}]`,
  );
  if (ok.length === 0) throw new Error('every channel failed');
}

main().catch((e) => {
  console.error('[hog-snapshot] FAILED:', e?.message ?? e);
  process.exit(1);
});
