-- ──────────────────────────────────────────────────────────────────────────────
-- 0009_activity_events_phase4.sql
-- Phase 4 schema additions:
--
-- 1. Whitelist `governance_block` in activity_events.event_type so that
--    enforceMode() blocks (e.g. PUBLISH without director_confirm) appear in
--    the human-visible Dashboard timeline.
--
-- 2. Partial unique index on budget_log(job_id) so that an Inngest retry of
--    the `record-cost` step does NOT double-charge episodes.budget_spent.
--    Per phase-4-jiggly-wave.md §4.5 — idempotency is the single most
--    important property of the cost path.
--
-- The existing CHECK constraint cannot be amended in place — DROP + ADD with
-- the extended list. Existing rows are unaffected (the new list is a superset).
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
      -- Phase 4 addition:
      'governance_block'
    )
  );

-- Idempotency guard for cost recording. A retried record-cost step from
-- Inngest hits the same job_id and the second insert fails with 23505;
-- lib/budget.ts catches this and treats it as a no-op (the cost was already
-- recorded on the first attempt).
CREATE UNIQUE INDEX IF NOT EXISTS budget_log_job_unique
  ON public.budget_log (job_id)
  WHERE job_id IS NOT NULL;
