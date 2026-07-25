// ──────────────────────────────────────────────────────────────────────────────
// app/api/audience/route.ts
// Audience dashboard data — the Quality Sensor surface. Pulls channel videos +
// real statistics/analytics, runs the scout-mode advisor, and computes the
// shorts→episode funnel. Read-only.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseSearchParams } from '@/lib/api/zod-helpers';
import { ValidationError } from '@/lib/api/errors';
import { listAllUploads } from '@/lib/agents/providers/youtube';
import { resolveChannelRefreshToken } from '@/lib/agents/providers/google-auth';
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

const ListQuery = z.object({
  // Multi-channel (Phase 3): which channel's audience to read. When absent, the
  // single/first ACTIVE channel is used (pre-Phase-3 behaviour = the Sandy
  // token). NO cross-channel merge is possible any more: every YouTube call
  // below is authed with THIS channel's token and the reach archive is
  // filtered to THIS channel's rows.
  channel_id: z.string().uuid().optional(),
});

export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireDirector();
  const q = parseSearchParams(req.url, ListQuery);

  // 0. Resolve the target channel passport.
  const { data: chRows, error: chErr } = await supabase
    .from('channels')
    .select('id, name, credential_key, status')
    .order('created_at', { ascending: true });
  if (chErr) throw new Error(`channels read failed: ${chErr.message}`);
  const channels = (chRows ?? []) as Array<{
    id: string; name: string; credential_key: string; status: string;
  }>;
  const active = channels.filter((c) => c.status === 'ACTIVE');
  const target = q.channel_id
    ? channels.find((c) => c.id === q.channel_id) ?? null
    : active[0] ?? channels[0] ?? null;
  if (!target) {
    throw new ValidationError(
      q.channel_id ? `Channel ${q.channel_id} not found` : 'No channels configured',
    );
  }
  // Rule 8 / multi-channel §3: no silent fallback to another channel's token —
  // a missing env token for THIS channel is a loud GoogleAuthError (HALT).
  const auth = { refreshToken: resolveChannelRefreshToken(target.credential_key) };

  // 1. Every video on the channel.
  const uploads = await listAllUploads(auth);
  const ids = uploads.map((u) => u.videoId).filter(Boolean);

  // 2. Public counters (one batched call) + analytics per video (parallel, best-effort).
  const stats = await getVideoStatistics(ids, auth).catch(() => []);
  const statById = new Map(stats.map((s) => [s.videoId, s]));

  const now = new Date();
  const start = new Date(now.getTime() - 90 * 86_400_000);
  const analyticsById = new Map(
    await Promise.all(
      uploads.map(async (u) => {
        const a = await getVideoAnalytics(u.videoId, ymd(start), ymd(now), auth).catch(() => null);
        return [u.videoId, a] as const;
      }),
    ),
  );

  // 3. Shorts→episode funnel from the ledger (episodes.metadata written by P1 +
  //    EXEC-PUB) — episodes of THIS channel's series only.
  const { data: chSeries } = await supabase
    .from('series')
    .select('id')
    .eq('channel_id', target.id);
  const seriesIds = ((chSeries ?? []) as Array<{ id: string }>).map((s) => s.id);
  let eps: Array<{ episode_code: string; metadata: unknown }> = [];
  if (seriesIds.length > 0) {
    const { data: epRows } = await supabase
      .from('episodes')
      .select('episode_code, metadata')
      .not('metadata', 'is', null)
      .in('series_id', seriesIds);
    eps = (epRows ?? []) as Array<{ episode_code: string; metadata: unknown }>;
  }
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
  const reachById = await readReachMetricsFromArchive(supabase, target.id).catch(
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
      retentionCurve = await getRetentionCurve(u.videoId, ymd(start), ymd(now), auth).catch(() => null);
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
    channel: { id: target.id, name: target.name },
    videoCount: metrics.length,
    metrics,
    funnel,
    report,
  });
});
