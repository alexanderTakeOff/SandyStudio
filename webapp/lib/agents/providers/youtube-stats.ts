// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/youtube-stats.ts
// Read-only audience metrics for the Quality Sensor (EXEC-ANAL). Two sources:
//   - Data API v3 /videos?part=statistics → views / likes / comments (public counts)
//   - YouTube Analytics API v2 /reports    → averageViewPercentage, avg view
//     duration, estimated minutes, and the retention curve (audienceWatchRatio)
//
// Uses the same YOUTUBE_REFRESH_TOKEN as youtube.ts, which now carries the
// `yt-analytics.readonly` scope (consent 2026-07-12). Defensive: brand-new /
// unlisted videos return near-zero or empty — every path degrades to 0/null
// rather than throwing, so the advisor's silence layer does its job.
// ──────────────────────────────────────────────────────────────────────────────

import { getYouTubeAccessToken, GoogleAuthError } from './google-auth';
import { fetchWithTimeout } from './fetch-with-timeout';

const DATA_API = 'https://www.googleapis.com/youtube/v3';
const ANALYTICS_API = 'https://youtubeanalytics.googleapis.com/v2/reports';
const TIMEOUT_MS = 30_000;

export class YouTubeStatsError extends Error {
  constructor(message: string, public readonly status: number | null = null) {
    super(message);
    this.name = 'YouTubeStatsError';
  }
}

async function authedGet(url: string): Promise<Response> {
  let token: string;
  try {
    token = await getYouTubeAccessToken();
  } catch (err) {
    if (err instanceof GoogleAuthError) throw new YouTubeStatsError(err.message);
    throw err;
  }
  return fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } }, TIMEOUT_MS);
}

/**
 * Where a video actually stands on YouTube. The Data API has NO `scheduled`
 * privacy value — a scheduled video reports `privacyStatus: 'private'` WITH a
 * `status.publishAt`. Reading `privacyStatus` alone mislabels every scheduled
 * video as private (2026-07-21: all 18 of ours). Derive, never read raw.
 */
export type PublicationState = 'public' | 'unlisted' | 'scheduled' | 'private-draft';

export interface ChannelStatistics {
  viewCount: number;
  subscriberCount: number;
  videoCount: number;
}

/** Channel-level live counters (Data API) — the channel-scope row of the HoG time series. */
export async function getChannelStatistics(): Promise<ChannelStatistics> {
  const res = await authedGet(`${DATA_API}/channels?part=statistics&mine=true`);
  if (!res.ok) throw new YouTubeStatsError(`getChannelStatistics failed (${res.status})`, res.status);
  const json = (await res.json()) as {
    items?: Array<{ statistics?: { viewCount?: string; subscriberCount?: string; videoCount?: string } }>;
  };
  const s = json.items?.[0]?.statistics;
  return {
    viewCount: Number(s?.viewCount ?? 0),
    subscriberCount: Number(s?.subscriberCount ?? 0),
    videoCount: Number(s?.videoCount ?? 0),
  };
}

export interface VideoStatistics {
  videoId: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  /** Derived — the only sanctioned way to talk about a video's YouTube state. */
  publicationState: PublicationState;
  /** When the audience sees/saw it: `publishAt` for scheduled, else `publishedAt`. Null for a draft. */
  liveAt: string | null;
  durationSeconds: number;
}

function isoDurationToSeconds(iso: string | undefined): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso ?? '');
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Public counters + publication state for up to 50 videos per call (Data API caps id list at 50). */
export async function getVideoStatistics(videoIds: string[]): Promise<VideoStatistics[]> {
  const out: VideoStatistics[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const url = `${DATA_API}/videos?part=statistics,status,snippet,contentDetails&id=${batch.map(encodeURIComponent).join(',')}`;
    const res = await authedGet(url);
    if (!res.ok) throw new YouTubeStatsError(`getVideoStatistics failed (${res.status})`, res.status);
    const json = (await res.json()) as {
      items?: Array<{
        id?: string;
        statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
        status?: { privacyStatus?: string; publishAt?: string };
        snippet?: { publishedAt?: string };
        contentDetails?: { duration?: string };
      }>;
    };
    for (const it of json.items ?? []) {
      const privacy = it.status?.privacyStatus;
      const publishAt = it.status?.publishAt ?? null;
      const publishedAt = it.snippet?.publishedAt ?? null;

      let publicationState: PublicationState;
      let liveAt: string | null;
      if (privacy === 'public') {
        publicationState = 'public';
        liveAt = publishedAt;
      } else if (privacy === 'unlisted') {
        publicationState = 'unlisted';
        liveAt = publishedAt;
      } else if (publishAt) {
        publicationState = 'scheduled';
        liveAt = publishAt;
      } else {
        publicationState = 'private-draft';
        liveAt = null;
      }

      out.push({
        videoId: it.id ?? '',
        viewCount: Number(it.statistics?.viewCount ?? 0),
        likeCount: Number(it.statistics?.likeCount ?? 0),
        commentCount: Number(it.statistics?.commentCount ?? 0),
        publicationState,
        liveAt,
        durationSeconds: isoDurationToSeconds(it.contentDetails?.duration),
      });
    }
  }
  return out;
}

/**
 * Is this Analytics completion figure usable as a QUALITY signal?
 *
 * `averageViewPercentage` = avg view duration ÷ length. A single playback left
 * running or rewound in a tab pushes it far past 100% (measured: 4228% off five
 * playbacks). At our sample sizes that number measures the operator's own
 * browser, not an audience — so it must never be displayed or ranked on.
 */
export function isCompletionReadable(pct: number | null | undefined): boolean {
  return typeof pct === 'number' && pct > 0 && pct <= 100;
}

export interface VideoAnalytics {
  videoId: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
}

/**
 * Aggregate analytics for one video over [startDate, endDate] (YYYY-MM-DD).
 * Returns null when the Analytics API has no rows (too new / no watch data) or the
 * scope isn't granted — the caller treats null as "no signal".
 */
export async function getVideoAnalytics(
  videoId: string,
  startDate: string,
  endDate: string,
): Promise<VideoAnalytics | null> {
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage',
    filters: `video==${videoId}`,
  });
  const res = await authedGet(`${ANALYTICS_API}?${params.toString()}`);
  if (res.status === 403) return null; // scope/permission — degrade quietly
  if (!res.ok) throw new YouTubeStatsError(`getVideoAnalytics failed (${res.status})`, res.status);
  const json = (await res.json()) as { rows?: number[][] };
  const row = json.rows?.[0];
  if (!row) return null;
  return {
    videoId,
    views: row[0] ?? 0,
    estimatedMinutesWatched: row[1] ?? 0,
    averageViewDuration: row[2] ?? 0,
    averageViewPercentage: row[3] ?? 0,
  };
}

/**
 * Retention curve (audienceWatchRatio sampled across the video). Returns the
 * ratio series, or null if the video is too new to have one. This is the input
 * for the retention-drop → shot mapping.
 */
export async function getRetentionCurve(
  videoId: string,
  startDate: string,
  endDate: string,
): Promise<number[] | null> {
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'audienceWatchRatio',
    dimensions: 'elapsedVideoTimeRatio',
    filters: `video==${videoId}`,
    sort: 'elapsedVideoTimeRatio',
  });
  const res = await authedGet(`${ANALYTICS_API}?${params.toString()}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new YouTubeStatsError(`getRetentionCurve failed (${res.status})`, res.status);
  const json = (await res.json()) as { rows?: number[][] };
  if (!json.rows?.length) return null;
  // rows: [elapsedRatio, audienceWatchRatio] → keep the ratio series in order.
  return json.rows.map((r) => r[1] ?? 0);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * One audience snapshot for a video, in the shape EXEC-ANAL persists (a superset
 * of the old mock so downstream REV-analytics consumers are unchanged). Real
 * numbers where available; zeros/empty (not throws) where the video is too new.
 */
export async function collectAudienceSnapshot(args: {
  youtubeVideoId: string;
  collectionPoint: string;
  lookbackDays?: number;
}): Promise<{
  status: 'success';
  provider: 'youtube';
  collected_at: string;
  collection_point: string;
  views: number;
  watch_time_minutes: number;
  avg_view_duration_seconds: number;
  avg_view_percentage: number;
  impressions: number;
  impression_ctr: number;
  subscribers_gained: number;
  likes: number;
  comments: number;
  traffic_sources: Record<string, number>;
  retention_curve: number[];
  cost_usd: 0;
  note: string;
}> {
  const now = new Date();
  const start = new Date(now.getTime() - (args.lookbackDays ?? 90) * 86_400_000);
  const [stats] = await getVideoStatistics([args.youtubeVideoId]).catch(() => []);
  const analytics = await getVideoAnalytics(args.youtubeVideoId, ymd(start), ymd(now)).catch(() => null);
  const retention = (await getRetentionCurve(args.youtubeVideoId, ymd(start), ymd(now)).catch(() => null)) ?? [];

  return {
    status: 'success',
    provider: 'youtube',
    collected_at: now.toISOString(),
    collection_point: args.collectionPoint,
    // Views ALWAYS come from the live public counter (spec: specs/distribution/analytics.md).
    // Analytics `views` lags ~3 days and, for a freshly published video, contains only
    // pre-publication owner plays — preferring it reported 10 for a video with 1248 views.
    views: stats?.viewCount ?? 0,
    watch_time_minutes: analytics?.estimatedMinutesWatched ?? 0,
    avg_view_duration_seconds: analytics?.averageViewDuration ?? 0,
    avg_view_percentage: isCompletionReadable(analytics?.averageViewPercentage) ? analytics!.averageViewPercentage : 0,
    impressions: 0,
    impression_ctr: 0,
    subscribers_gained: 0,
    likes: stats?.likeCount ?? 0,
    comments: stats?.commentCount ?? 0,
    traffic_sources: {},
    retention_curve: retention,
    cost_usd: 0,
    note: analytics
      ? `views=live counter; completion/watch-time from Analytics (lags ~3d)${
          isCompletionReadable(analytics.averageViewPercentage) ? '' : '; completion unreadable, zeroed'
        }`
      : 'views=live counter; no Analytics rows yet (processing lag)',
  };
}
