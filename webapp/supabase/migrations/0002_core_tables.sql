-- ──────────────────────────────────────────────────────────────────────────────
-- 0002_core_tables.sql
-- Core production tables. 7 tables per specs/system/webapp.md §3.1.
-- Includes pgcrypto extension (gen_random_uuid), updated_at triggers,
-- and a CHECK constraint on assets.filename mirroring .claude/hooks/naming-validator.cjs
-- (CLAUDE.md §3 naming convention).
-- ──────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ─── set_updated_at trigger fn ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ─── episodes ────────────────────────────────────────────────────────────────
CREATE TABLE public.episodes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id       text NOT NULL,                          -- e.g. "SS-S01"
  episode_code    text UNIQUE NOT NULL,                   -- e.g. "SS-S01-E03"
  title_working   text,
  status          public.episode_status NOT NULL DEFAULT 'BRIEF_PENDING',
  governance_mode smallint NOT NULL DEFAULT 1
                  CHECK (governance_mode BETWEEN 1 AND 4),  -- 1=MANUAL 2=HYBRID 3=DELEGATED 4=AUTOTEST
  budget_ceiling  numeric(10,2),
  budget_spent    numeric(10,2) DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER episodes_set_updated_at
  BEFORE UPDATE ON public.episodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── assets ──────────────────────────────────────────────────────────────────
-- filename CHECK mirrors .claude/hooks/naming-validator.cjs regex (defence in depth).
-- Pattern: SS-(S\d{2}|PILOT)(-E\d{2})?-TYPE-name-vNN-STATUS.ext
CREATE TABLE public.assets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id         uuid REFERENCES public.episodes(id) ON DELETE CASCADE,
  filename           text UNIQUE NOT NULL,
  file_type          text NOT NULL
                     CHECK (file_type IN ('SCR','STB','IMG','VID','AUD','BIB','PRO','REV','SPC','STA')),
  description        text,
  version            smallint NOT NULL DEFAULT 1 CHECK (version > 0),
  status             public.asset_status NOT NULL DEFAULT 'DRAFT',
  staging_path       text,                                -- C:\SandyStudio\Staging\ (pre-approval)
  drive_path         text,                                -- H:\My Drive\SandyStudio_Media\ (post-approval)
  staging_expires_at timestamptz,                         -- 48h TTL on Staging
  agent_id           text,                                -- producing agent (e.g. EXEC-VGEN)
  revision_log       text,                                -- populated when status = REVISION
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assets_filename_format
    CHECK (filename ~* '^SS-(S\d{2}|PILOT)(-E\d{2})?-(SCR|STB|IMG|VID|AUD|BIB|PRO|REV|SPC|STA)-[a-z0-9_]+-v\d{2}-(DRAFT|REVIEW|REVISION|APPROVED|LOCKED)\.[a-z0-9]+$')
);

CREATE TRIGGER assets_set_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── approvals ───────────────────────────────────────────────────────────────
CREATE TABLE public.approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      uuid REFERENCES public.assets(id) ON DELETE CASCADE,
  episode_id    uuid REFERENCES public.episodes(id) ON DELETE CASCADE,
  approved_by   text NOT NULL,                            -- 'DIRECTOR' | 'EXEC-DIR-AI' | human delegate name
  approval_type text NOT NULL,                            -- asset type or gate name
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);


-- ─── jobs ────────────────────────────────────────────────────────────────────
CREATE TABLE public.jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id     uuid REFERENCES public.episodes(id) ON DELETE CASCADE,
  inngest_event  text NOT NULL,                           -- e.g. "sandystudio/exec-sw/write-script"
  inngest_run_id text,
  agent_id       text NOT NULL,
  status         public.job_status NOT NULL DEFAULT 'QUEUED',
  input_snapshot jsonb,                                   -- inputs at job creation time
  output_ref     text,                                    -- asset filename or path produced
  error_message  text,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);


-- ─── budget_log ──────────────────────────────────────────────────────────────
CREATE TABLE public.budget_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id    uuid REFERENCES public.episodes(id) ON DELETE CASCADE,
  job_id        uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  agent_id      text NOT NULL,
  api_provider  text NOT NULL,                            -- "anthropic" | "kling" | "fal_ai" | ...
  model_or_tier text,                                     -- "claude-haiku-4-5" | "kling-3.0" | ...
  operation     text NOT NULL,                            -- "video_generation" | ...
  cost_usd      numeric(10,6) NOT NULL CHECK (cost_usd >= 0),
  tokens_used   integer,                                  -- LLM calls
  duration_ms   integer,                                  -- generation calls
  created_at    timestamptz NOT NULL DEFAULT now()
);


-- ─── analytics_reports ───────────────────────────────────────────────────────
CREATE TABLE public.analytics_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id       uuid REFERENCES public.episodes(id) ON DELETE CASCADE,
  collection_point text NOT NULL
                   CHECK (collection_point IN ('T+1h','T+24h','T+7d','T+30d')),
  youtube_video_id text,
  collected_at     timestamptz NOT NULL DEFAULT now(),
  data             jsonb NOT NULL,                        -- raw metrics per analytics.md schema
  flags            jsonb,                                 -- [{metric, flag_type, value, threshold}]
  report_path      text                                   -- generated .md report
);


-- ─── series_state ────────────────────────────────────────────────────────────
-- Queryable mirror of FILMS/<series>/<season>/PROJECT.md (anchor file is editable;
-- this table is the indexed copy webapp/agents read from).
CREATE TABLE public.series_state (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id                text UNIQUE NOT NULL,
  world_bible_path         text,
  style_bible_path         text,
  series_arc_path          text,
  creative_direction_path  text,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER series_state_set_updated_at
  BEFORE UPDATE ON public.series_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
