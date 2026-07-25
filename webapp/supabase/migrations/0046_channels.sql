-- ──────────────────────────────────────────────────────────────────────────────
-- 0046_channels.sql
-- Multi-channel Phase 1: the channel becomes a first-class entity.
-- Spec: specs/system/multi-channel.md (Director q1a/q2y/q4y, 2026-07-25).
--
--   channels          — passport row per YouTube channel. The channel's identity
--                       is its OAuth refresh token (env YOUTUBE_REFRESH_TOKEN_
--                       <credential_key>); youtube_channel_id is a verification
--                       guard, never the auth source.
--   series.channel_id — nullable BY DESIGN: a series may produce without a
--                       channel; publish/analytics gates HALT when it's absent
--                       (no silent fallback to a global token).
--   channel_snapshots / channel_reports — gain channel_id + Sandy backfill so
--                       a second channel cannot corrupt the existing time series.
--                       Kept NULLABLE here (zero-downtime: the 15-min cron may
--                       insert between this migration and the code deploy);
--                       0048 backfills stragglers and tightens to NOT NULL.
-- ──────────────────────────────────────────────────────────────────────────────

-- ─── channels ─────────────────────────────────────────────────────────────────
CREATE TABLE public.channels (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text        NOT NULL,
  youtube_channel_id text        NOT NULL UNIQUE,
  credential_key     text        NOT NULL UNIQUE CHECK (credential_key ~ '^[A-Z][A-Z0-9_]*$'),
  ntfy_topic         text,
  status             text        NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED')),
  metadata           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER channels_set_updated_at
  BEFORE UPDATE ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.channels TO service_role;
GRANT SELECT ON public.channels TO authenticated;

CREATE POLICY channels_authenticated_select
  ON public.channels FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.channels IS
  'YouTube channel passports (multi-channel.md §2). credential_key names the env '
  'secret YOUTUBE_REFRESH_TOKEN_<KEY>; the token IS the channel identity, '
  'youtube_channel_id is the verification guard checked before publish/snapshot.';

-- ─── seed: the existing Sandy channel ─────────────────────────────────────────
INSERT INTO public.channels (name, youtube_channel_id, credential_key, ntfy_topic, status)
VALUES ('Sandy the Hourglass', 'UCc2YJlHFclO9BWLEgPlglIg', 'SANDY', 'sandystudio-hog-a7f3k9', 'ACTIVE');

-- ─── series.channel_id (nullable by design) ───────────────────────────────────
ALTER TABLE public.series
  ADD COLUMN channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL;
CREATE INDEX idx_series_channel ON public.series (channel_id);

COMMENT ON COLUMN public.series.channel_id IS
  'Owning channel. NULL = series produces without a channel; publish/analytics '
  'gates HALT on NULL instead of falling back to a global token.';

UPDATE public.series
SET channel_id = (SELECT id FROM public.channels WHERE credential_key = 'SANDY')
WHERE code IN ('SS-S09','SS-S14','SS-S15');

-- ─── channel_snapshots.channel_id + Sandy backfill ────────────────────────────
ALTER TABLE public.channel_snapshots
  ADD COLUMN channel_id uuid REFERENCES public.channels(id);

UPDATE public.channel_snapshots
SET channel_id = (SELECT id FROM public.channels WHERE credential_key = 'SANDY')
WHERE channel_id IS NULL;

CREATE INDEX channel_snapshots_channel_time_idx
  ON public.channel_snapshots (channel_id, scope, captured_at DESC);

-- ─── channel_reports.channel_id + Sandy backfill + UNIQUE swap ────────────────
ALTER TABLE public.channel_reports
  ADD COLUMN channel_id uuid REFERENCES public.channels(id);

UPDATE public.channel_reports
SET channel_id = (SELECT id FROM public.channels WHERE credential_key = 'SANDY')
WHERE channel_id IS NULL;

-- NULLS NOT DISTINCT: rows inserted by pre-deploy code (channel_id NULL) keep
-- the old dedup semantics until 0048 tightens the column.
ALTER TABLE public.channel_reports
  ADD CONSTRAINT channel_reports_channel_type_report_key
  UNIQUE NULLS NOT DISTINCT (channel_id, report_type, report_id);

-- Drop the old two-column UNIQUE whatever its live name is (created inline in
-- 0045, so the name is server-generated).
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.channel_reports'::regclass
      AND contype = 'u'
      AND conname <> 'channel_reports_channel_type_report_key'
  LOOP
    EXECUTE format('ALTER TABLE public.channel_reports DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;
