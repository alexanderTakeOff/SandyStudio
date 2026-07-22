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
// Reuses the same YOUTUBE_REFRESH_TOKEN / yt-analytics.readonly scope as
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

async function authed(url: string, init: RequestInit = {}): Promise<Response> {
  let token: string;
  try {
    token = await getYouTubeAccessToken();
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

export async function listReportingJobs(): Promise<ReportingJob[]> {
  const res = await authed(`${REPORTING_API}/jobs`);
  if (!res.ok) throw new YouTubeReportingError(`listReportingJobs failed (${res.status})`, res.status);
  const json = (await res.json()) as { jobs?: ReportingJob[] };
  return json.jobs ?? [];
}

/**
 * Idempotent: create a job for each HoG report type that has none yet. Returns
 * the full job set (existing + newly created). A job already present is left
 * untouched — YouTube keeps generating its daily reports regardless.
 */
export async function ensureReportingJobs(): Promise<ReportingJob[]> {
  const existing = await listReportingJobs();
  const haveTypes = new Set(existing.map((j) => j.reportTypeId));
  const created: ReportingJob[] = [];
  for (const type of HOG_REPORT_TYPES) {
    if (haveTypes.has(type)) continue;
    const res = await authed(`${REPORTING_API}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportTypeId: type, name: `hog-${type}` }),
    });
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
export async function listNewReports(jobs: ReportingJob[]): Promise<ReportRef[]> {
  const out: ReportRef[] = [];
  for (const job of jobs) {
    const res = await authed(`${REPORTING_API}/jobs/${job.id}/reports`);
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
export async function downloadReport(ref: ReportRef): Promise<string> {
  const res = await authed(ref.downloadUrl);
  if (!res.ok) throw new YouTubeReportingError(`downloadReport(${ref.id}) failed (${res.status})`, res.status);
  return res.text();
}
