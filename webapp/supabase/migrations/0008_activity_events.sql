-- ──────────────────────────────────────────────────────────────────────────────
-- 0008_activity_events.sql
-- Per uiux.md §21 — unified event feed for the Dashboard "Recent activity" rail
-- and the Concierge agent's "what happened recently?" queries.
-- Distinct from `jobs` (Inngest run state) and `approvals` (decision records).
-- This is the human-readable timeline.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.activity_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id  uuid        REFERENCES public.episodes(id) ON DELETE CASCADE,
  asset_id    uuid        REFERENCES public.assets(id)   ON DELETE SET NULL,
  job_id      uuid        REFERENCES public.jobs(id)     ON DELETE SET NULL,
  event_type  text        NOT NULL,
  severity    text        NOT NULL DEFAULT 'info',
  title       text        NOT NULL,
  description text,
  actor       text,                       -- 'director' | 'exec_dir_ai' | agent_id | 'system'
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Whitelist event types per uiux.md §21 to prevent typos drifting into the feed.
  CONSTRAINT activity_events_type_valid CHECK (
    event_type IN (
      'job_started','job_completed','job_failed',
      'asset_submitted','approval_requested','approval_granted',
      'revision_requested','asset_rejected',
      'budget_threshold_reached','publish_pending','published',
      'mode_changed','agent_prompt_updated','config_updated'
    )
  ),
  CONSTRAINT activity_events_severity_valid CHECK (
    severity IN ('info','success','warning','error')
  )
);

CREATE INDEX activity_events_episode_created_idx ON public.activity_events (episode_id, created_at DESC);
CREATE INDEX activity_events_type_created_idx    ON public.activity_events (event_type, created_at DESC);
CREATE INDEX activity_events_severity_created_idx ON public.activity_events (severity, created_at DESC)
  WHERE severity IN ('warning','error');

-- RLS.
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY director_all ON public.activity_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
