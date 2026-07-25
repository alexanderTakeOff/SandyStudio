// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/youtube-reporting.ts
// YouTube Reporting API — bulk daily CSV reports. A DIFFERENT service from the
// Analytics API: you subscribe a "job" to a report type once, and YouTube then
// generates a daily CSV (~30 days of backfill on first run). This is the ONLY
// automated route to impression / CTR data — the Analytics API serves no such
// metric (verified 2026-07-21: every impression identifier → "Unknown identifier").
//
// Flow: ensureReportingJobs() (idempotent — creates only missing jobs) →
// listNewReports() (every report across jobs) → downloadReport() (the CSV body).
// The caller dedupes by report.id and persists to channel_reports.
//
// Multi-channel: every exported op takes an optional `auth` (channel refresh
// token); omitted = legacy bare env token. Same yt-analytics.readonly scope as
// youtube-stats.ts. Every path throws YouTubeReportingError on a hard failure so
// the observer can log SENSOR_DOWN rather than silently persist nothing.
// ──────────────────────────────────────────────────────────────────────────────

import { getYouTubeAccessToken, GoogleAuthError } from './google-auth';
import { fetchWithTimeout } from './fetch-with-timeout';

const REPORTING_API = 'https://youtubereporting.googleapis.com/v1';
const TIMEOUT_MS = 30_000;

// The report types that carry the growth signal we care about. "reach_basic" is
// the Studio "Reach" tab — where impressions + impressionClickThroughRate live.
export const HOG_REPORT_TYPES = [
  'channel_reach_basic_a1', // impressions / CTR
  'channel_basic_a3', // views / watch-time / subs per video per day
  'channel_traffic_source_a3', // where the views came from, per video per day
] as const;

export type HogReportType = (typeof HOG_REPORT_TYPES)[number];

export class YouTubeReportingError extends Error {
  constructor(message: string, public readonly status: number | null = null) {
    super(message);
    this.name = 'YouTubeReportingError';
  }
}

export interface YouTubeAuth {
  refreshToken: string;
}

async function authed(url: string, init: RequestInit = {}, auth?: YouTubeAuth): Promise<Response> {
  let token: string;
  try {
    token = await getYouTubeAccessToken(auth?.refreshToken);
  } catch (err) {
    if (err instanceof GoogleAuthError) throw new YouTubeReportingError(err.message);
    throw err;
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetchWithTimeout(url, { ...init, headers }, TIMEOUT_MS);
}

export interface ReportingJob {
  id: string;
  reportTypeId: string;
  name?: string;
  createTime?: string;
}

export async function listReportingJobs(auth?: YouTubeAuth): Promise<ReportingJob[]> {
  const res = await authed(`${REPORTING_API}/jobs`, {}, auth);
  if (!res.ok) throw new YouTubeReportingError(`listReportingJobs failed (${res.status})`, res.status);
  const json = (await res.json()) as { jobs?: ReportingJob[] };
  return json.jobs ?? [];
}

/**
 * Idempotent: create a job for each HoG report type that has none yet. Returns
 * the full job set (existing + newly created). A job already present is left
 * untouched — YouTube keeps generating its daily reports regardless.
 */
export async function ensureReportingJobs(auth?: YouTubeAuth): Promise<ReportingJob[]> {
  const existing = await listReportingJobs(auth);
  const haveTypes = new Set(existing.map((j) => j.reportTypeId));
  const created: ReportingJob[] = [];
  for (const type of HOG_REPORT_TYPES) {
    if (haveTypes.has(type)) continue;
    const res = await authed(`${REPORTING_API}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportTypeId: type, name: `hog-${type}` }),
    }, auth);
    if (!res.ok) throw new YouTubeReportingError(`createJob(${type}) failed (${res.status})`, res.status);
    created.push((await res.json()) as ReportingJob);
  }
  return [...existing, ...created];
}

export interface ReportRef {
  id: string;
  jobId: string;
  reportTypeId: string;
  startTime?: string;
  endTime?: string;
  downloadUrl: string;
}

/** Every report currently available across all HoG jobs. Caller dedupes by id. */
export async function listNewReports(jobs: ReportingJob[], auth?: YouTubeAuth): Promise<ReportRef[]> {
  const out: ReportRef[] = [];
  for (const job of jobs) {
    const res = await authed(`${REPORTING_API}/jobs/${job.id}/reports`, {}, auth);
    if (!res.ok) throw new YouTubeReportingError(`listReports(${job.id}) failed (${res.status})`, res.status);
    const json = (await res.json()) as {
      reports?: Array<{ id?: string; startTime?: string; endTime?: string; downloadUrl?: string }>;
    };
    for (const r of json.reports ?? []) {
      if (!r.id || !r.downloadUrl) continue;
      out.push({
        id: r.id,
        jobId: job.id,
        reportTypeId: job.reportTypeId,
        startTime: r.startTime,
        endTime: r.endTime,
        downloadUrl: r.downloadUrl,
      });
    }
  }
  return out;
}

/** The raw CSV body of one report. */
export async function downloadReport(ref: ReportRef, auth?: YouTubeAuth): Promise<string> {
  const res = await authed(ref.downloadUrl, {}, auth);
  if (!res.ok) throw new YouTubeReportingError(`downloadReport(${ref.id}) failed (${res.status})`, res.status);
  return res.text();
}

// ── archive → typed metrics bridge ───────────────────────────────────────────
// The poller archives raw CSVs into `channel_reports`; until 2026-07-24 nothing
// read them back, so impressions/CTR/subs/traffic stayed hardcoded to 0 in the
// audience snapshot and the HoG diagnostic ladder (which branches on impressions
// first) was unexecutable. This bridge parses the archived CSVs into per-video
// aggregates. It is the ONLY source for these metrics — see the header note on
// why the Analytics API cannot serve them.

/** Per-video aggregates parsed from the archived Reporting CSVs. */
export interface ArchivedVideoReach {
  impressions: number;
  /** Impression-weighted average CTR, in the CSV's native unit (fraction). */
  impressionCtr: number;
  subscribersGained: number;
  subscribersLost: number;
  /** Views per traffic source over the archive window. Keys are labelled where the
   *  Reporting enum is unambiguous, otherwise `source_<code>` (raw code preserved). */
  trafficSources: Record<string, number>;
}

// Best-effort labels for the Reporting API `traffic_source_type` enum. Only codes
// we are confident about are named; anything else surfaces as `source_<code>` so
// a wrong guess can never mislead the HoG advisor.
const TRAFFIC_SOURCE_LABELS: Record<string, string> = {
  '3': 'browse_features',
  '5': 'yt_search',
  '7': 'suggested_video',
  '24': 'shorts_feed',
};

/** Minimal structural client — keeps this provider decoupled from a concrete
 *  supabase-js generic; both the service-role and the route clients satisfy it. */
interface ChannelReportsResult {
  data: Array<{ report_type: string; start_date: string | null; raw: string }> | null;
  error: { message: string } | null;
}
interface ChannelReportsOrdered {
  order(col: string, opts: { ascending: boolean }): PromiseLike<ChannelReportsResult>;
}
interface ChannelReportsSelect extends ChannelReportsOrdered {
  eq(col: 'channel_id', value: string): ChannelReportsOrdered;
}
interface ChannelReportsReader {
  // `select → unknown` keeps the structural match against the full supabase-js
  // builder SHALLOW — typing the builder members here made every typed-client
  // call site explode with TS2589 (deep instantiation). The real shape is
  // narrowed once, internally, via the ChannelReportsSelect cast below.
  from(table: 'channel_reports'): { select(cols: string): unknown };
}

function csvCells(line: string): string[] {
  return line.split(',').map((c) => c.trim());
}

/**
 * Parse every archived report into per-video reach aggregates.
 *
 * Dedup rule: YouTube may re-issue a report for the same day; rows are keyed by
 * (video, date[, source]) and reports are applied in start_date order so the
 * LATEST report for a given day wins instead of double-counting.
 */
export async function readReachMetricsFromArchive(
  sb: ChannelReportsReader,
  // Multi-channel (Phase 3): scope the archive to ONE channel. Optional for
  // back-compat; with two channels an unscoped read would merge both channels'
  // CSVs into one per-video map (safe only while video ids never collide).
  channelId?: string | null,
): Promise<Map<string, ArchivedVideoReach>> {
  const selected = sb
    .from('channel_reports')
    .select('report_type,start_date,raw') as ChannelReportsSelect;
  const scoped: ChannelReportsOrdered = channelId
    ? selected.eq('channel_id', channelId)
    : selected;
  const { data, error } = await scoped.order('start_date', { ascending: true });
  if (error) throw new YouTubeReportingError(`channel_reports read failed: ${error.message}`);

  // (video|date) → value maps; last write wins per key (re-issued report days).
  const impressionsByKey = new Map<string, { impressions: number; ctr: number }>();
  const subsByKey = new Map<string, { gained: number; lost: number }>();
  const trafficByKey = new Map<string, { video: string; source: string; views: number }>();

  for (const report of data ?? []) {
    const lines = (report.raw ?? '').split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) continue;
    const header = csvCells(lines[0]);
    const col = (name: string) => header.indexOf(name);

    if (report.report_type === 'channel_reach_basic_a1') {
      const [vid, impr, ctr] = [col('video_id'), col('video_thumbnail_impressions'), col('video_thumbnail_impressions_ctr')];
      if (vid < 0 || impr < 0) continue;
      for (const line of lines.slice(1)) {
        const cells = csvCells(line);
        const date = cells[col('date')] ?? report.start_date ?? '';
        impressionsByKey.set(`${cells[vid]}|${date}`, {
          impressions: Number(cells[impr]) || 0,
          ctr: ctr >= 0 ? Number(cells[ctr]) || 0 : 0,
        });
      }
    } else if (report.report_type === 'channel_basic_a3') {
      const [vid, gained, lost] = [col('video_id'), col('subscribers_gained'), col('subscribers_lost')];
      if (vid < 0 || gained < 0) continue;
      // basic_a3 splits a video's day across subscribed_status/country rows —
      // sum within THIS report, then overwrite the (video|date) key so a
      // re-issued report replaces the day instead of double-counting it.
      const perDay = new Map<string, { gained: number; lost: number }>();
      for (const line of lines.slice(1)) {
        const cells = csvCells(line);
        const date = cells[col('date')] ?? report.start_date ?? '';
        const key = `${cells[vid]}|${date}`;
        const prev = perDay.get(key);
        perDay.set(key, {
          gained: (prev?.gained ?? 0) + (Number(cells[gained]) || 0),
          lost: (prev?.lost ?? 0) + (lost >= 0 ? Number(cells[lost]) || 0 : 0),
        });
      }
      for (const [key, v] of perDay) subsByKey.set(key, v);
    } else if (report.report_type === 'channel_traffic_source_a3') {
      const [vid, srcType, views] = [col('video_id'), col('traffic_source_type'), col('views')];
      if (vid < 0 || srcType < 0 || views < 0) continue;
      // Same shape: sum a (video|date|source) within this report across country
      // rows, then overwrite the day-key so re-issues replace, not double.
      const perDay = new Map<string, { video: string; source: string; views: number }>();
      for (const line of lines.slice(1)) {
        const cells = csvCells(line);
        const date = cells[col('date')] ?? report.start_date ?? '';
        const source = TRAFFIC_SOURCE_LABELS[cells[srcType]] ?? `source_${cells[srcType]}`;
        const key = `${cells[vid]}|${date}|${source}`;
        const prev = perDay.get(key);
        perDay.set(key, { video: cells[vid], source, views: (prev?.views ?? 0) + (Number(cells[views]) || 0) });
      }
      for (const [key, v] of perDay) trafficByKey.set(key, v);
    }
  }

  const out = new Map<string, ArchivedVideoReach>();
  const ensure = (videoId: string): ArchivedVideoReach => {
    let v = out.get(videoId);
    if (!v) {
      v = { impressions: 0, impressionCtr: 0, subscribersGained: 0, subscribersLost: 0, trafficSources: {} };
      out.set(videoId, v);
    }
    return v;
  };

  // Impressions + impression-weighted CTR.
  const ctrWeight = new Map<string, number>();
  for (const [key, { impressions, ctr }] of impressionsByKey) {
    const videoId = key.split('|')[0];
    const v = ensure(videoId);
    v.impressions += impressions;
    ctrWeight.set(videoId, (ctrWeight.get(videoId) ?? 0) + ctr * impressions);
  }
  for (const [videoId, weighted] of ctrWeight) {
    const v = ensure(videoId);
    v.impressionCtr = v.impressions > 0 ? weighted / v.impressions : 0;
  }

  for (const [key, { gained, lost }] of subsByKey) {
    const v = ensure(key.split('|')[0]);
    v.subscribersGained += gained;
    v.subscribersLost += lost;
  }

  for (const { video, source, views } of trafficByKey.values()) {
    const v = ensure(video);
    v.trafficSources[source] = (v.trafficSources[source] ?? 0) + views;
  }

  return out;
}
