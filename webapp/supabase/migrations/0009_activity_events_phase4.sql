-- ──────────────────────────────────────────────────────────────────────────────
-- 0009_activity_events_phase4.sql
-- Phase 4 additions to activity_events:
--
-- 1. Whitelist two new event_types:
--      cost_recorded     — written by lib/budget.ts on every successful agent step
--      governance_block  — written when enforceMode() blocks an action (Mode 1 PUBLISH)
--
-- 2. Partial unique index on (job_id, event_type='cost_recorded') so that
--    Inngest retrying a `record-cost` step does NOT double-charge the episode
--    budget. Per Plan-agent feedback in phase-4-jiggly-wave.md §4.5.
--
-- The existing CHECK constraint cannot be amended in place — DROP + ADD with
-- extended list. Existing rows are unaffected because the new list is a
-- superset of the old one.
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
      -- Phase 4 additions:
      'cost_recorded','governance_block'
    )
  );

-- Idempotency guard for budget bookkeeping.
-- A retried `record-cost` step from Inngest will hit the same (job_id, 'cost_recorded')
-- pair and the second insert will fail — the wrapper in lib/budget.ts catches the
-- unique-violation error and treats it as a no-op (the cost was already recorded).
CREATE UNIQUE INDEX IF NOT EXISTS activity_events_cost_unique_per_job
  ON public.activity_events (job_id)
  WHERE event_type = 'cost_recorded' AND job_id IS NOT NULL;
