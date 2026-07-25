// hog-snapshot.mts — READ-ONLY daily channel snapshot for the Head of Growth loop.
// Reuses the existing YouTube providers (no duplicated API logic) + the archived
// Reporting CSV bridge, and persists one structured JSON per RUN so the daily brain
// can diff today against yesterday. No writes to YouTube, ever.
//
// Run:  node --env-file=.env.local --import tsx scripts/hog-snapshot.mts
//       (cwd = webapp; needs GOOGLE_* + YOUTUBE_REFRESH_TOKEN + SUPABASE_* in env)
//
// Output: ../docs/distribution/snapshots/<YYYY-MM-DD>T<HHMM>Z.json  (repo-root relative)

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // webapp/scripts
const outDir = join(here, '..', '..', 'docs', 'distribution', 'snapshots');
// Lifetime window for the Analytics reads — earlier than the channel's first upload.
const ANALYTICS_SINCE = '2026-01-01';

// Dynamic imports: tsx's ESM interop mis-links static named imports from sibling
// .ts modules ("does not provide an export named …"); dynamic import resolves fine.
async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const { readReachMetricsFromArchive } = await import('../lib/agents/providers/youtube-reporting.ts');
  const { getChannelStatistics, getVideoStatistics, getVideoAnalytics, isCompletionReadable } =
    await import('../lib/agents/providers/youtube-stats.ts');
  const { listAllUploads } = await import('../lib/agents/providers/youtube.ts');

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const channel = await getChannelStatistics();
  const uploads = await listAllUploads();
  const ids = uploads.map((u: any) => u.videoId).filter(Boolean);
  const stats = await getVideoStatistics(ids);
  const statById = new Map(stats.map((s: any) => [s.videoId, s]));
  // Reach layer is best-effort: an empty/failed archive must NOT sink the snapshot.
  const reach = await readReachMetricsFromArchive(sb as any).catch(() => new Map());

  // Retention is the gate metric of the growth ladder (completion > channel median =
  // the feed escalates). Best-effort per video: a null here must not sink the snapshot.
  const today = new Date().toISOString().slice(0, 10);
  const analyticsById = new Map<string, any>();
  for (const id of ids) {
    const a = await getVideoAnalytics(id, ANALYTICS_SINCE, today).catch(() => null);
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
  const snapshot = { date, collectedAt: now.toISOString(), channel, videoCount: rows.length, rows };

  mkdirSync(outDir, { recursive: true });
  // Filename carries the UTC time, so a second run the same day can never overwrite
  // the first one. The daily series is the only thing this loop can measure with.
  const outPath = join(outDir, `${date}T${now.toISOString().slice(11, 16).replace(':', '')}Z.json`);
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
  // Stdout stays machine-parseable: the path + a one-line human summary on stderr.
  console.error(
    `[hog-snapshot] ${date}: subs=${channel.subscriberCount} views=${channel.viewCount} ` +
      `public=${rows.filter((r: any) => r.state === 'public').length}/${rows.length}`,
  );
  console.log(outPath);
}

main().catch((e) => {
  console.error('[hog-snapshot] FAILED:', e?.message ?? e);
  process.exit(1);
});
