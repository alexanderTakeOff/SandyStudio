-- ──────────────────────────────────────────────────────────────────────────────
-- 0005_indexes.sql
-- Indexes derived from access patterns in webapp.md §4 (fan-out by episode_id),
-- §5 (`/api/budget`, `/api/jobs`), §6 (Approval Queue, Dashboard), §7 (governance lookups).
-- Primary keys + UNIQUE columns already produce indexes — only add what's missing.
-- ──────────────────────────────────────────────────────────────────────────────

-- assets — list by episode (Episode Detail page); filter by status (Approval Queue).
-- assets.filename is already UNIQUE → no extra index needed.
CREATE INDEX assets_episode_id_idx     ON public.assets (episode_id);
CREATE INDEX assets_status_idx         ON public.assets (status);
CREATE INDEX assets_episode_status_idx ON public.assets (episode_id, status);

-- jobs — Dashboard "Recent Jobs", live status by episode, Inngest job lookup.
CREATE INDEX jobs_episode_id_idx        ON public.jobs (episode_id);
CREATE INDEX jobs_status_created_at_idx ON public.jobs (status, created_at DESC);
CREATE INDEX jobs_inngest_run_id_idx    ON public.jobs (inngest_run_id) WHERE inngest_run_id IS NOT NULL;

-- budget_log — `/api/budget` summary, per-call log, model routing audit.
CREATE INDEX budget_log_episode_created_idx  ON public.budget_log (episode_id, created_at DESC);
CREATE INDEX budget_log_provider_created_idx ON public.budget_log (api_provider, created_at DESC);

-- approvals — Asset detail "approval history", Episode approval timeline.
CREATE INDEX approvals_asset_id_idx          ON public.approvals (asset_id);
CREATE INDEX approvals_episode_created_idx   ON public.approvals (episode_id, created_at DESC);

-- analytics_reports — Episode analytics page; one row per (episode, collection point).
CREATE INDEX analytics_episode_point_idx ON public.analytics_reports (episode_id, collection_point);

-- approval_authority — lookup by category for governance enforcement (§7.3).
-- The UNIQUE constraint already produces an index on (series_id, episode_id, category).
-- Add a covering index for the common lookup "by series only" (when episode_id IS NULL):
CREATE INDEX approval_authority_series_category_idx
  ON public.approval_authority (series_id, category)
  WHERE episode_id IS NULL;

-- agent_prompts.agent_id and app_config (scope,key) are already UNIQUE → indexed.
