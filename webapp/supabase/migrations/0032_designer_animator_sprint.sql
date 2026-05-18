-- ──────────────────────────────────────────────────────────────────────────────
-- 0032_designer_animator_sprint.sql
-- Sprint «Дизайнер и Аниматор», Day 1 — schema groundwork for agentifying
-- EREF (Episode Reference Designer) and VGEN (Animator).
--
-- WHY:
--   Diagnostic 2026-05-18 confirmed EREF and VGEN are the only pipeline
--   stages without a write-agent and without a reviewer. Both run as
--   template-functions (episode-references.ts builder, vgen-shot-helpers.ts
--   buildShotPromptV2) that ignore Bible style canon, camera_movement /
--   camera_motivation, and hardcode delivery aspect (1024×1024 square for
--   EREF, leading to Seedance 16:9 crop loss). This sprint introduces two
--   full LLM-driven agents with reviewer pairs (Designer's Critic, Animator's
--   Critic) and a Plan-asset gate, mirroring the Writer↔SREV pattern that
--   already governs Script and Storyboard stages.
--
-- WHAT:
--   1. series.metadata jsonb (NOT NULL DEFAULT '{}'::jsonb) — mirrors
--      episodes.metadata from 0029. Initial use:
--        series.metadata.delivery_targets[] — array of target slugs
--        ('youtube_landscape' | 'youtube_shorts' | 'instagram_reels' |
--         'instagram_post' | 'tiktok' | 'print_poster'). Empty array =
--        default to 'youtube_landscape'. For S14 pilot period the default
--        is ['youtube_landscape']; broader distribution arrives later.
--
--   2. episodes.metadata.delivery_targets[] — same shape, override for one
--      episode. Already addressable (column added by 0029).
--
--   3. activity_events.event_type whitelist extended with 6 new types for
--      Plan-asset lifecycle and agent dialog:
--        plan_proposed     — Designer/Animator emitted a SPC-*_plan asset
--        plan_approved     — Critic or Director approved a Plan
--        plan_revised      — Critic verdict REVISE → Designer/Animator
--                            re-runs with revision_note
--        plan_rejected     — Director or Critic rejected the Plan
--        agent_question    — Agent posted a question to Director via PA
--                            (Director-initiated dialog pattern, day-by-day
--                            opt-in via PA askAgent tool)
--        agent_answered    — Director answered (or PA forwarded an answer)
--                            back to the requesting agent
--
--   Plan-asset types (SPC-ref_plan-<shot_id>-vNN-<STATUS>.md,
--   SPC-shot_plan-<shot_id>-vNN-<STATUS>.md) reuse the existing
--   assets.filename CHECK from 0002 (SPC is already whitelisted). No
--   filename-format migration needed.
--
-- HOW TO APPLY:
--   `supabase db push` (CLI is linked + authenticated per memory note
--   2026-05-13). MCP apply_migration remains denied. Migration is idempotent:
--   all changes guarded by IF NOT EXISTS / EXCEPTION pattern.
-- ──────────────────────────────────────────────────────────────────────────────


-- 1. series.metadata jsonb (mirrors episodes.metadata 0029) ─────────────────
ALTER TABLE public.series
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.series.metadata IS
  'Structured series-level side-data. Initial use: metadata.delivery_targets[]
   — array of distribution-target slugs the Designer / Animator consult when
   choosing aspect ratio, size, and variant count. Empty array → assumes
   default ["youtube_landscape"]. Episode-level override lives at
   episodes.metadata.delivery_targets[] (column added by 0029).';

CREATE INDEX IF NOT EXISTS series_metadata_gin
  ON public.series USING GIN (metadata);


-- 2. activity_events whitelist: Plan-asset lifecycle + agent dialog ─────────
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
      -- 0018 / 0019
      'governance_block',
      'agent_started','agent_progress','agent_completed',
      'asset_updated','manual_trigger','approval_revision','approval_rejected',
      'decision_requested','input_requested','blocker_raised',
      'canon_extension_proposed','canon_extension_resolved',
      -- 0029
      'episode_archived',
      -- 0032: Plan-asset lifecycle (Designer/Animator + Critics)
      'plan_proposed','plan_approved','plan_revised','plan_rejected',
      -- 0032: Director ↔ Agent dialog via PA-proxy (opt-in)
      'agent_question','agent_answered'
    )
  );


-- 3. Reserve agent_failed event_type used by EXEC-SREV (regression guard) ───
-- Earlier hot-fix 2026-05-12 added `agent_failed` insertions in
-- inngest/functions/exec-srev.ts try/catch but the constraint widening at
-- that time wasn't migrated. Catch up here so PA + Activity Feed see SREV
-- crashes properly.
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
      'decision_requested','input_requested','blocker_raised',
      'canon_extension_proposed','canon_extension_resolved',
      'episode_archived',
      'plan_proposed','plan_approved','plan_revised','plan_rejected',
      'agent_question','agent_answered',
      'agent_failed'
    )
  );
