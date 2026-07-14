-- ──────────────────────────────────────────────────────────────────────────────
-- 0043_pa_inject_revision_requested.sql
-- Phase 1 «Дирижёр и Спинной Мозг» (2026-07-14) — failure-spine sidecar.
--
-- The critic revision-cap HALT (lib/agents/critic-loop.ts) writes an
-- `activity_events` row of type `revision_requested` when a shot bounces past its
-- cap — a genuine decision that needs a human / Polina. It was missing from BOTH
-- paid-wake whitelists (lib/api/event-actionable.ts, fixed in the same PR) AND the
-- DB ambient-injection whitelist below (0042's `v_actionable`), so it reached
-- NOBODY: a warning row in the feed only.
--
-- Fix (pure addition of one type): add `revision_requested` to `v_actionable` so
-- the cap-HALT is injected as ambient context for Polina, matching the code-side
-- paid-wake whitelist. Everything else is byte-identical to 0042.
--
-- Keep this whitelist in sync with lib/concierge/ambient-events.ts,
-- lib/api/event-actionable.ts, and scripts/backfill-pa-ambient.ts.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_inject_activity_event_into_concierge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actionable boolean := NEW.event_type IN (
    'agent_completed','agent_failed',
    'approval_revision','approval_rejected',
    'budget_threshold_reached','blocker_raised',
    'decision_requested','input_requested','canon_extension_proposed',
    'episode_archived',
    -- TD-20.B 2026-05-20 — Library generation visibility (safety net;
    -- primary fix is logEvent + 'agent_completed' in the routes).
    'asset_created',
    -- 0043 — critic revision-cap HALT (critic-loop.ts): the shot needs a
    -- human/Polina decision. Missing here since 0042 → reached nobody.
    'revision_requested'
  );
  v_thread_id uuid;
  v_director_id uuid;
  v_summary text;
  v_severity text;
  v_content text;
  v_metadata jsonb;
  v_existing uuid;
BEGIN
  IF NOT v_actionable THEN
    RETURN NEW;
  END IF;

  SELECT id, director_id INTO v_thread_id, v_director_id
  FROM public.concierge_threads
  WHERE ended_at IS NULL
    AND (episode_id = NEW.episode_id OR NEW.episode_id IS NULL)
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_thread_id IS NULL THEN
    SELECT id, director_id INTO v_thread_id, v_director_id
    FROM public.concierge_threads
    WHERE ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1;
  END IF;

  IF v_thread_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type IN ('approval_granted','approval_revision','approval_rejected')
     AND v_director_id IS NOT NULL
     AND NEW.actor::text = v_director_id::text
  THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_existing
  FROM public.concierge_turns
  WHERE thread_id = v_thread_id
    AND metadata @> jsonb_build_object('activity_event_id', NEW.id::text)
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_severity := COALESCE(NULLIF(NEW.severity, ''), 'info');
  IF NEW.description IS NOT NULL
     AND length(NEW.description) > 0
     AND length(NEW.description) <= 220
  THEN
    v_summary := NEW.title || ' — ' || NEW.description;
  ELSE
    v_summary := NEW.title;
  END IF;
  v_content := '[ambient pipeline event · ' || NEW.event_type || '] '
            || v_summary
            || ' (actor=' || COALESCE(NEW.actor, 'system') || ')';

  v_metadata := jsonb_build_object(
    'kind',              'pipeline_event',
    'activity_event_id', NEW.id::text,
    'event_type',        NEW.event_type,
    'severity',          v_severity,
    'actor',             NEW.actor,
    'episode_id',        NEW.episode_id,
    'asset_id',          NEW.asset_id,
    'job_id',            NEW.job_id,
    'created_at',        NEW.created_at
  );

  INSERT INTO public.concierge_turns (thread_id, role, event_type, content, metadata)
  VALUES (v_thread_id, 'system', 'message', v_content, v_metadata);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_inject_activity_event_into_concierge IS
  '0043: added revision_requested (critic-cap HALT) to the injection whitelist. Otherwise identical to 0042. Paid-wake gate is lib/api/event-actionable.ts.';
