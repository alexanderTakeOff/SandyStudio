-- ──────────────────────────────────────────────────────────────────────────────
-- 0035_activity_events_type_catchup.sql
-- 2026-06-03 — Critical audit-log fix. Saving the per-episode budget cap
-- (PATCH /api/episodes/[id]/settings) threw:
--   "new row for relation \"activity_events\" violates check constraint
--    \"activity_events_type_valid\"" with event_type='episode_settings_changed'.
-- The budget value saved, but the audit event was rejected and silently lost
-- (logEvent swallows the error per lib/api/events.ts).
--
-- Root cause: many code paths emit event_type values into activity_events that
-- were never added to the activity_events_type_valid CHECK constraint. The
-- constraint last grew in 0032 (Designer/Animator sprint) and missed a whole
-- class of UI / system / lifecycle audit events accumulated since.
--
-- This migration catches the constraint up. It cross-checked every event_type
-- string literal inserted into activity_events across the codebase (route
-- handlers, lib/api/events.ts logEvent callers, lib/concierge/tools/skills.ts,
-- runner/factory) against the allowed list and adds every MISSING value.
-- All existing values are preserved — this only ADDs.
--
-- Newly added (emitted by code but rejected by the old constraint):
--   episode_settings_changed   app/api/episodes/[id]/settings/route.ts  (the bug)
--   system_mode_change         app/api/system/mode/route.ts
--   governance_mode_change     app/api/system/governance-mode/route.ts
--   storage_config_change      app/api/storage/config/route.ts
--   provider_switched_global   app/api/providers/assignments/[contract]/route.ts
--   onboarding_advanced        app/api/onboarding/{advance,exit}/route.ts
--   series_created             app/api/series/route.ts
--   episode_created            app/api/episodes/route.ts
--   episode_updated            app/api/episodes/[id]/route.ts
--   pipeline_started           app/api/episodes/[id]/approve/route.ts
--   plan_anchor_stale_block    app/api/episodes/[id]/regenerate-image-from-plan/route.ts
--   asset_created              app/api/series/[id]/bible/route.ts
--   rule_proposal              app/api/skills/route.ts, lib/concierge/tools/skills.ts
--   rule_approved              app/api/skills/{route,[slug]/route}.ts, lib/concierge/tools/skills.ts
--   rule_rejected              app/api/skills/[slug]/route.ts, lib/concierge/tools/skills.ts
--
-- Idempotent: DROP IF EXISTS + ADD.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_valid;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_valid CHECK (
    event_type IN (
      -- 0008 base
      'job_started','job_completed','job_failed',
      'asset_submitted','approval_requested','approval_granted',
      'revision_requested','asset_rejected',
      'budget_threshold_reached','publish_pending','published',
      'mode_changed','agent_prompt_updated','config_updated',
      -- 0009 / 0018 / 0019
      'governance_block',
      'agent_started','agent_progress','agent_completed',
      'asset_updated','manual_trigger','approval_revision','approval_rejected',
      'decision_requested','input_requested','blocker_raised',
      'canon_extension_proposed','canon_extension_resolved',
      -- 0029
      'episode_archived',
      -- 0032
      'plan_proposed','plan_approved','plan_revised','plan_rejected',
      'agent_question','agent_answered',
      'agent_failed',
      -- 0035 catch-up: episode settings / budget cap (the reported bug)
      'episode_settings_changed',
      -- 0035 catch-up: system + governance + storage + provider config audits
      'system_mode_change','governance_mode_change','storage_config_change',
      'provider_switched_global',
      -- 0035 catch-up: onboarding wizard
      'onboarding_advanced',
      -- 0035 catch-up: series / episode lifecycle audits
      'series_created','episode_created','episode_updated','pipeline_started',
      -- 0035 catch-up: plan anchor freshness guard
      'plan_anchor_stale_block',
      -- 0035 catch-up: Bible Library asset creation (safety net per 0033)
      'asset_created',
      -- 0035 catch-up: Skill Editor rule lifecycle (activity_events, distinct
      -- from the concierge_turns rule_* values added in 0025)
      'rule_proposal','rule_approved','rule_rejected'
    )
  );
