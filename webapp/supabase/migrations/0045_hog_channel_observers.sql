-- ──────────────────────────────────────────────────────────────────────────────
-- 0045_hog_channel_observers.sql
-- Head-of-Growth observers — the factory's channel-level MEASUREMENT layer.
--
-- Distinct from analytics_reports (0002), which is EPISODE-scoped and event-driven
-- from publish at fixed T+1h/24h/7d/30d points. HoG needs the opposite: a
-- channel-WIDE time series taken on a steady cadence over EVERY video, so growth
-- velocity (views/hour), plateaus, and the shape of a Shorts distribution wave are
-- readable — none of which a per-episode snapshot at fixed offsets can show.
--
-- Two tables, one law: a broken sensor must be distinguishable from a zero reading.
--   channel_snapshots — append-only time series of Data API LIVE counters (views/
--     likes/comments per video, subs at channel scope). Data API only — never mixed
--     with Analytics API, which lags ~3 days; mixing the two is the exact lie the
--     HoG doctrine forbids. A failed poll writes NOTHING (no fake zero row).
--   channel_reports — archive of YouTube Reporting API bulk CSVs (the only
--     automated route to impressions/CTR, which the Analytics API does not serve).
--     Deduped by (report_type, report_id) so re-polling is idempotent.
-- ──────────────────────────────────────────────────────────────────────────────

-- ─── channel_snapshots ────────────────────────────────────────────────────────
CREATE TABLE public.channel_snapshots (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_at  timestamptz NOT NULL DEFAULT now(),
  scope        text        NOT NULL CHECK (scope IN ('channel','video')),
  video_id     text,                                 -- null for channel scope
  views        bigint      NOT NULL DEFAULT 0,
  likes        bigint      NOT NULL DEFAULT 0,
  comments     bigint      NOT NULL DEFAULT 0,
  subscribers  bigint,                               -- channel scope only
  videos_count integer,                              -- channel scope only
  privacy      text,                                 -- video scope only
  source       text        NOT NULL DEFAULT 'youtube_data_api'
);

CREATE INDEX channel_snapshots_video_time_idx  ON public.channel_snapshots (video_id, captured_at DESC);
CREATE INDEX channel_snapshots_scope_time_idx  ON public.channel_snapshots (scope, captured_at DESC);

ALTER TABLE public.channel_snapshots ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.channel_snapshots TO service_role;
GRANT SELECT ON public.channel_snapshots TO authenticated;

CREATE POLICY channel_snapshots_authenticated_select
  ON public.channel_snapshots FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.channel_snapshots IS
  'HoG channel-wide time series of YouTube Data API LIVE counters (append-only). '
  'Data API only — never Analytics (which lags ~3 days). A failed poll writes no '
  'row rather than a fake zero, so gaps mean "sensor was down", not "views were 0".';

-- ─── channel_reports ──────────────────────────────────────────────────────────
CREATE TABLE public.channel_reports (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  report_type  text        NOT NULL,                 -- e.g. channel_reach_basic_a1
  report_id    text        NOT NULL,                 -- YouTube's report id (dedup key)
  start_date   date,
  end_date     date,
  columns      text[],                               -- CSV header row, split
  row_count    integer,
  has_impressions boolean  NOT NULL DEFAULT false,   -- did this report carry the CTR signal?
  raw          text,                                 -- full CSV body
  UNIQUE (report_type, report_id)
);

CREATE INDEX channel_reports_type_start_idx ON public.channel_reports (report_type, start_date DESC);

ALTER TABLE public.channel_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.channel_reports TO service_role;
GRANT SELECT ON public.channel_reports TO authenticated;

CREATE POLICY channel_reports_authenticated_select
  ON public.channel_reports FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.channel_reports IS
  'Archive of YouTube Reporting API bulk CSV reports (deduped by report_id). The '
  'only automated route to impression/CTR data — the Analytics API does not serve '
  'those metrics. Reports appear ~daily and cover ~30 days back from job creation.';
