-- ──────────────────────────────────────────────────────────────────────────────
-- 0030_concierge_team_chat.sql
-- Sprint α — Postgres trigger Realtime + team-chat unified thread.
-- 2026-05-14.
--
-- WHY:
--   1. The browser Realtime subscription on `activity_events` is silent (0
--      POSTs to /api/concierge/ambient despite migration 0027 RLS fix). Root
--      cause is fragile client-side state. Replace with a server-side
--      Postgres trigger that fires on `activity_events` INSERT and writes
--      directly into the relevant `concierge_turns` row — zero browser
--      dependency, ~ms latency.
--
--   2. Team-chat: Claude (the CLI agent in worktree) needs to drop messages
--      into the same PA thread the Director chats in. Postgres publication
--      on `concierge_turns` lets the browser subscribe to that table
--      directly, picking up both pipeline events and Claude's team-chat
--      messages in one stream.
--
-- WHAT:
--   1. Trigger function `tg_inject_activity_event_into_concierge()` —
--      ambient injector. Replicates the TypeScript filter rules in
--      `lib/concierge/ambient-events.ts` so behaviour stays identical:
--        - actionable event_type whitelist
--        - skip Director-own approval events (actor = director's user id)
--        - dedupe by metadata.activity_event_id
--      Target thread = latest open thread (ended_at IS NULL) for the event's
--      episode_id; fallback to latest open thread globally. Skip if none.
--
--   2. `supabase_realtime` publication picks up `concierge_turns` so the
--      browser can subscribe and render new system turns live. REPLICA
--      IDENTITY FULL ensures DELETEs broadcast row data (defensive — we
--      don't delete turns today, but consistent with 0026 pattern).
-- ──────────────────────────────────────────────────────────────────────────────

-- ─── trigger: ambient events → system turns ──────────────────────────────────

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
    'episode_archived'
  );
  v_thread_id uuid;
  v_director_id uuid;
  v_summary text;
  v_severity text;
  v_content text;
  v_metadata jsonb;
  v_existing uuid;
BEGIN
  -- Filter 1: actionable types only.
  IF NOT v_actionable THEN
    RETURN NEW;
  END IF;

  -- Find latest open thread for this episode, else latest open globally.
  SELECT id, director_id INTO v_thread_id, v_director_id
  FROM public.concierge_threads
  WHERE ended_at IS NULL
    AND (episode_id = NEW.episode_id OR NEW.episode_id IS NULL)
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_thread_id IS NULL THEN
    -- Fallback: latest open thread regardless of episode.
    SELECT id, director_id INTO v_thread_id, v_director_id
    FROM public.concierge_threads
    WHERE ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1;
  END IF;

  IF v_thread_id IS NULL THEN
    -- No open thread — skip silently. Director will see events via the
    -- pull-based getRecentActivityEvents tool on her next interaction.
    RETURN NEW;
  END IF;

  -- Filter 2: skip Director's own approval events to avoid echo.
  IF NEW.event_type IN ('approval_granted','approval_revision','approval_rejected')
     AND v_director_id IS NOT NULL
     AND NEW.actor::text = v_director_id::text
  THEN
    RETURN NEW;
  END IF;

  -- Filter 3: dedupe by activity_event_id (same event written twice = no-op).
  SELECT id INTO v_existing
  FROM public.concierge_turns
  WHERE thread_id = v_thread_id
    AND metadata @> jsonb_build_object('activity_event_id', NEW.id::text)
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Compose summary: title — description (if short), else title only.
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

DROP TRIGGER IF EXISTS activity_events_to_concierge ON public.activity_events;
CREATE TRIGGER activity_events_to_concierge
  AFTER INSERT ON public.activity_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_inject_activity_event_into_concierge();

COMMENT ON FUNCTION public.tg_inject_activity_event_into_concierge IS
  '0030: AFTER INSERT on activity_events → write a system turn into the latest open concierge_thread (filtered + deduped). Replaces the silent client-side Realtime path that was 0 POSTs in production.';

-- ─── Realtime publication: concierge_turns ───────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'concierge_turns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.concierge_turns;
  END IF;
END$$;

ALTER TABLE public.concierge_turns REPLICA IDENTITY FULL;
