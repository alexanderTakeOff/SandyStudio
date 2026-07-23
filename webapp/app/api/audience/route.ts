// ──────────────────────────────────────────────────────────────────────────────
// app/api/audience/route.ts
// Audience dashboard data — the Quality Sensor surface. Pulls channel videos +
// real statistics/analytics, runs the scout-mode advisor, and computes the
// shorts→episode funnel. Read-only.
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { listAllUploads } from '@/lib/agents/providers/youtube';
import {
  getVideoStatistics,
  getVideoAnalytics,
  getRetentionCurve,
  isCompletionReadable,
} from '@/lib/agents/providers/youtube-stats';
import { readReachMetricsFromArchive } from '@/lib/agents/providers/youtube-reporting';
import { buildAdvice, type VideoMetric } from '@/lib/agents/analytics-advisor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The series' category space for the holes map (from the project gag library).
// Project-specific by design — the pure advisor engine stays taxonomy-agnostic.
const SANDY_TAXONOMY = [
  'Body', 'Object', 'Environment', 'Chain-reaction', 'Status',
  'False-success', 'Sand', 'Transparent-body', 'Timing', 'Social',
];

const isShortTitle = (t: string) => /#?shorts?\b/i.test(t);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export const GET = withApiHandler(async () => {
  const { supabase } = await requireDirector();

  // 1. Every video on the channel.
  const uploads = await listAllUploads();
  const ids = uploads.map((u) => u.videoId).filter(Boolean);

  // 2. Public counters (one batched call) + analytics per video (parallel, best-effort).
  const stats = await getVideoStatistics(ids).catch(() => []);
  const statById = new Map(stats.map((s) => [s.videoId, s]));

  const now = new Date();
  const start = new Date(now.getTime() - 90 * 86_400_000);
  const analyticsById = new Map(
    await Promise.all(
      uploads.map(async (u) => {
        const a = await getVideoAnalytics(u.videoId, ymd(start), ymd(now)).catch(() => null);
        return [u.videoId, a] as const;
      }),
    ),
  );

  // 3. Shorts→episode funnel from the ledger (episodes.metadata written by P1 + EXEC-PUB).
  const { data: eps } = await supabase
    .from('episodes')
    .select('episode_code, metadata')
    .not('metadata', 'is', null);
  const funnel = (eps ?? [])
    .map((e) => {
      const m = (e.metadata && typeof e.metadata === 'object' ? e.metadata : {}) as Record<string, unknown>;
      return {
        episodeCode: e.episode_code,
        parentVideoId: typeof m.youtube_video_id === 'string' ? m.youtube_video_id : null,
        shortVideoId: typeof m.youtube_short_id === 'string' ? m.youtube_short_id : null,
      };
    })
    .filter((f) => f.parentVideoId || f.shortVideoId);
  const parentToEpisode = new Map(funnel.filter((f) => f.parentVideoId).map((f) => [f.parentVideoId!, f.episodeCode]));
  const shortToEpisode = new Map(funnel.filter((f) => f.shortVideoId).map((f) => [f.shortVideoId!, f.episodeCode]));

  // 3.5. Reach metrics from the archived Reporting CSVs — one bulk parse serves
  // every video. Best-effort: an empty/failed archive degrades to nulls
  // ("unmeasured"), never to fake zeros.
  const reachById = await readReachMetricsFromArchive(supabase).catch(
    () => new Map<string, never>(),
  );

  // 4. Assemble metrics. Retention curve only for public long-forms (heavier call).
  const metrics: VideoMetric[] = [];
  for (const u of uploads) {
    const kind = isShortTitle(u.title) ? 'short' : 'longform';
    const s = statById.get(u.videoId);
    const a = analyticsById.get(u.videoId) ?? null;
    let retentionCurve: number[] | null = null;
    // Gate on the video being PUBLIC — not on lagging Analytics views (~3d behind),
    // which skipped exactly the fresh videos whose curve matters most. A too-new
    // curve simply comes back null from the API and stays null here.
    if (kind === 'longform' && s?.publicationState === 'public') {
      retentionCurve = await getRetentionCurve(u.videoId, ymd(start), ymd(now)).catch(() => null);
    }
    const publicationState = s?.publicationState ?? 'private-draft';
    const completionReadable = isCompletionReadable(a?.averageViewPercentage);

    metrics.push({
      videoId: u.videoId,
      kind,
      title: u.title,
      episodeCode: (kind === 'short' ? shortToEpisode.get(u.videoId) : parentToEpisode.get(u.videoId)) ?? null,
      publicationState,
      liveAt: s?.liveAt ?? null,
      // Views ALWAYS from the live public counter, never from Analytics — the latter lags
      // ~3 days and for a fresh video holds only pre-publication owner plays.
      views: s?.viewCount ?? 0,
      // Zeroed rather than shown when unreadable (>100% = one tab left running, not an audience).
      avgViewPercentage: completionReadable ? a!.averageViewPercentage : 0,
      avgViewDurationSeconds: completionReadable ? (a?.averageViewDuration ?? 0) : 0,
      likes: s?.likeCount ?? 0,
      comments: s?.commentCount ?? 0,
      loops: null,
      shares: null,
      retentionCurve,
      impressions: reachById.get(u.videoId)?.impressions ?? null,
      impressionCtr: reachById.get(u.videoId)?.impressionCtr ?? null,
      subscribersGained: reachById.get(u.videoId)?.subscribersGained ?? null,
      trafficSources: reachById.get(u.videoId)?.trafficSources ?? null,
    });
  }

  // 5. Scout advice — PUBLIC videos only. Scheduled/unlisted/draft have no audience by
  //    construction; feeding them in as equal samples drags every ratio the advisor reasons
  //    on toward zero (18 of our 29 uploads are scheduled).
  const publicMetrics = metrics.filter((m) => m.publicationState === 'public');
  const report = buildAdvice({ metrics: publicMetrics, taxonomy: SANDY_TAXONOMY, shippedCategories: [] });

  return apiOk({
    generatedAt: now.toISOString(),
    videoCount: metrics.length,
    metrics,
    funnel,
    report,
  });
});
