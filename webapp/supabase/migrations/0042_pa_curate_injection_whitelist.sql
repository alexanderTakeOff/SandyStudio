-- ──────────────────────────────────────────────────────────────────────────────
-- 0042_pa_curate_injection_whitelist.sql
-- D17 curation (E18 firehose) 2026-07-08.
--
-- The first honest autonomy run (E18, 14 shots) injected 438 ambient system
-- turns into Polina's thread and spent $18.82 / 378 paid auto-react calls —
-- because this Gate-A injection trigger fired on *already-happened* telemetry
-- (agent_started 150×) and echoed the Director's own clicks back at her
-- (approval_granted 74×, manual_trigger 60×). Together those three types were
-- 284 of the 438 injections — pure noise carrying no decision.
--
-- Fix (pure subtraction): narrow v_actionable — drop
--   'agent_started', 'approval_granted', 'manual_trigger'.
-- Everything else is unchanged. `agent_completed` stays injected as CONTEXT
-- (pipeline visibility, no paid wake — the paid-wake gate lives in
-- lib/api/event-actionable.ts and was tightened in the same PR).
--
-- The director-own approval skip (kept below) is now moot for 'approval_granted'
-- since that type no longer reaches here, but it stays harmless for
-- 'approval_revision'/'approval_rejected'. Its underlying director_id≠actor
-- mismatch (the reason it never fired on E18) is no longer load-bearing.
--
-- Keep this whitelist in sync with lib/concierge/ambient-events.ts and
-- scripts/backfill-pa-ambient.ts.
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
  '0042: D17 curation — dropped agent_started/approval_granted/manual_trigger from the injection whitelist (E18 firehose: 284 of 438 injections). agent_completed stays as context; paid-wake gate is lib/api/event-actionable.ts.';
