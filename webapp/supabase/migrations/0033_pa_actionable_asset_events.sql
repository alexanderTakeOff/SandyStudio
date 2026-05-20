-- ──────────────────────────────────────────────────────────────────────────────
-- 0033_pa_actionable_asset_events.sql
-- TD-20.B autonomy follow-up 2026-05-20.
--
-- Initial smoke surfaced that Bible Library asset generation
-- (bible/generate-image, regenerate-image) was writing activity_events
-- with event_type='asset_created' — a value NOT in the
-- activity_events_type_valid CHECK constraint. Every such insert had
-- been silently failing for a long time, so Polina could not see her
-- own finished Library previews.
--
-- The actual fix in the same commit converts those inline inserts to
-- logEvent(...) with event_type='agent_completed' + actor='EXEC-BIBLE-AUTHOR'
-- so the row passes the CHECK, gets mirrored into concierge_turns, AND
-- triggers `pa/notify-needed` for autonomous Polina reaction.
--
-- This migration is kept as a safety-net: it adds 'asset_created' to the
-- actionable whitelist in tg_inject_activity_event_into_concierge so IF
-- some future code path manages to insert that event_type (after the
-- CHECK is widened), Polina will still see it. Without this, a future
-- regression would silently de-route Library events away from her thread.
-- 'asset_updated' is deliberately NOT added — it would fire on every
-- Director-side edit (covered by TD-19 versioning work).
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_inject_activity_event_into_concierge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actionable boolean := NEW.event_type IN (
    'agent_started','agent_completed','agent_failed',
    'approval_granted','approval_revision','approval_rejected',
    'manual_trigger','budget_threshold_reached','blocker_raised',
    'decision_requested','input_requested','canon_extension_proposed',
    'episode_archived',
    -- TD-20.B 2026-05-20 — Library generation visibility (safety net;
    -- primary fix is logEvent + 'agent_completed' in the routes).
    'asset_created'
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
  '0033: extended actionable whitelist with asset_created as a safety net; primary Library-visibility fix is logEvent + agent_completed in the Bible/regenerate-image routes.';
