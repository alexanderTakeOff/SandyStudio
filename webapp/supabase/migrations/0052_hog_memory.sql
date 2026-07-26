-- ──────────────────────────────────────────────────────────────────────────────
-- 0052_hog_memory.sql
-- Head-of-Growth analytical memory (multi-channel Phase 4b, spec §8).
--
-- Stores ANALYSIS, not statistics (statistics already live in channel_snapshots
-- / channel_reports): the hypothesis journal, experiments, decisions, daily
-- advisor output (buildAdvice cards), weekly channel medians, and the rollup
-- hierarchy. Append-only, one row per event, always stamped with channel_id.
--
-- Rollup law (Director + HoG, 2026-07-26): daily rows → weekly_rollup →
-- monthly_rollup, and every period reads ONLY the previous rollup + the rows
-- since it — never the full history (context stays bounded forever).
--
-- Lands WITH its writers (hog-report-poll daily_advice persist + the rollup
-- crons + scripts/hog-memory-append.mts), never dead schema (0040 precedent).
-- Shape mirrors episode_scorecard: typed spine + jsonb payload so new analysis
-- fields never need a migration.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.hog_memory (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   uuid        NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  kind         text        NOT NULL CHECK (kind IN (
                 'daily_advice',    -- persisted buildAdvice() output + channel stats of the day
                 'hypothesis',      -- the journal: one hypothesis, status tracked below
                 'experiment',      -- what changed, single-variable?, result
                 'decision',        -- a decision made + its consequence
                 'median_recalc',   -- weekly channel medians (written by the weekly rollup)
                 'weekly_rollup',   -- the week's digest (reads prev rollup + rows since)
                 'monthly_rollup'   -- the month's digest (reads ONLY weekly rollups)
               )),
  -- Hypothesis lifecycle (kind='hypothesis'/'experiment'; null otherwise).
  status       text        CHECK (status IN ('PENDING','CONFIRMED','REFUTED')),
  -- Earliest date the hypothesis becomes judgeable (metric lag, sample floor).
  unlock_date  date,
  -- Rollup window (kind='weekly_rollup'/'monthly_rollup'/'median_recalc').
  period_start date,
  period_end   date,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hog_memory_channel_kind_idx
  ON public.hog_memory (channel_id, kind, created_at DESC);

ALTER TABLE public.hog_memory ENABLE ROW LEVEL SECURITY;

-- Mirrors channel_snapshots (0045): the app reads; only crons/scripts write
-- (service_role bypasses RLS).
GRANT SELECT, INSERT ON public.hog_memory TO service_role;
GRANT SELECT ON public.hog_memory TO authenticated;

CREATE POLICY hog_memory_authenticated_select
  ON public.hog_memory FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.hog_memory IS
  'HoG analytical memory (append-only, per-channel): hypothesis journal, experiments, '
  'decisions, persisted daily advisor output, weekly medians, weekly/monthly rollups. '
  'Analysis only — statistics live in channel_snapshots/channel_reports. Each rollup '
  'period reads ONLY the previous rollup + rows since it (bounded context).';
