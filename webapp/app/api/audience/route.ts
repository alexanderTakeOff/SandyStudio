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
import { getVideoStatistics, getVideoAnalytics, getRetentionCurve } from '@/lib/agents/providers/youtube-stats';
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

  // 4. Assemble metrics. Retention curve only for the few long-forms with analytics (heavier call).
  const metrics: VideoMetric[] = [];
  for (const u of uploads) {
    const kind = isShortTitle(u.title) ? 'short' : 'longform';
    const s = statById.get(u.videoId);
    const a = analyticsById.get(u.videoId) ?? null;
    let retentionCurve: number[] | null = null;
    if (kind === 'longform' && a && a.views > 0) {
      retentionCurve = await getRetentionCurve(u.videoId, ymd(start), ymd(now)).catch(() => null);
    }
    metrics.push({
      videoId: u.videoId,
      kind,
      title: u.title,
      episodeCode: (kind === 'short' ? shortToEpisode.get(u.videoId) : parentToEpisode.get(u.videoId)) ?? null,
      views: a?.views ?? s?.viewCount ?? 0,
      avgViewPercentage: a?.averageViewPercentage ?? 0,
      avgViewDurationSeconds: a?.averageViewDuration ?? 0,
      likes: s?.likeCount ?? 0,
      comments: s?.commentCount ?? 0,
      loops: null,
      shares: null,
      retentionCurve,
    });
  }

  // 5. Scout advice. shippedCategories empty until per-gag tagging (P2) → whole space is a hole.
  const report = buildAdvice({ metrics, taxonomy: SANDY_TAXONOMY, shippedCategories: [] });

  return apiOk({
    generatedAt: now.toISOString(),
    videoCount: metrics.length,
    metrics,
    funnel,
    report,
  });
});
