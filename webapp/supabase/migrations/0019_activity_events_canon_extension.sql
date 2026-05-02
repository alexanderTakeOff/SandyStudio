-- ──────────────────────────────────────────────────────────────────────────────
-- 0019_activity_events_canon_extension.sql
-- Whitelist event types used by the Director Inbox (decision_requested,
-- input_requested, blocker_raised) and the new Bible Extension proposal flow
-- (canon_extension_proposed, canon_extension_resolved).
--
-- Per Director's 2026-05-02 architecture decision: agents that need a non-
-- canonical asset must surface a Bible Extension Proposal — never invent
-- silently. Inbox routes these proposals to Director via input_requested
-- events.
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
      'agent_started','agent_progress','agent_completed',
      'asset_updated','manual_trigger','approval_revision','approval_rejected',
      -- Inbox surfaces these (they were queried but never insertable):
      'decision_requested','input_requested','blocker_raised',
      -- Bible Extension Proposal flow (Director-arbitrated canon growth):
      'canon_extension_proposed','canon_extension_resolved'
    )
  );

-- Resolution flag: marks an event as completed (Director clicked Approve /
-- Reject / dismissed). Used to filter Inbox so resolved items disappear.
ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS activity_events_unresolved_idx
  ON public.activity_events (episode_id, created_at DESC)
  WHERE resolved_at IS NULL
    AND event_type IN ('decision_requested','input_requested','blocker_raised','canon_extension_proposed');
