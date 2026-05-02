-- ──────────────────────────────────────────────────────────────────────────────
-- 0018_activity_events_agent_started.sql
-- Whitelist three agent-lifecycle event_type values used by factory.ts so
-- the Pipeline View activity feed has live entries from the moment a stage
-- starts, not only after the asset lands. Per Director feedback 2026-05-02 —
-- "Activity says No activity, but Storyboarder is clearly working."
--
-- New types:
--   agent_started   — emitted right after insertJobRow (factory.ts step 1)
--   agent_progress  — periodic in-flight markers (reserved; not used yet)
--   agent_completed — emitted after saveAgentOutput (factory.ts step 5)
--                     (Already inserted today but type was outside the
--                      whitelist, so all such inserts silently failed —
--                      this migration unblocks them.)
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_valid;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_valid CHECK (
    event_type IN (
      'job_started','job_completed','job_failed',
      'asset_submitted','approval_requested','approval_granted',
      'revision_requested','asset_rejected',
      'budget_threshold_reached','publish_pending','published',
      'mode_changed','agent_prompt_updated','config_updated',
      'governance_block',
      -- Phase backbone-v2 addition (2026-05-02):
      'agent_started','agent_progress','agent_completed',
      -- Generic helpers used by approve/content routes:
      'asset_updated','manual_trigger','approval_revision','approval_rejected'
    )
  );
