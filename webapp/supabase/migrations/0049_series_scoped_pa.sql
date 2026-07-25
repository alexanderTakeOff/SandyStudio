-- ──────────────────────────────────────────────────────────────────────────────
-- 0049_series_scoped_pa.sql
-- Multi-channel Phase 2 (2026-07-25, Director q3 = «чат = сериал», q1 = skip):
-- series-scope for activity_events + concierge_threads, and a series-aware
-- ambient-injection trigger.
--
-- The bug this kills (multi-channel.md §8 Phase 2): the injection trigger
-- picked «the latest open thread GLOBALLY» as a fallback, and for series-scoped
-- events (episode_id IS NULL) the predicate `(episode_id = NEW.episode_id OR
-- NEW.episode_id IS NULL)` matched ANY open thread — so a series-B event landed
-- in the series-A conversation. With a second series in production this mixes
-- Polina's context across universes.
--
-- Design:
--   1. activity_events.series_id — filled by a BEFORE INSERT trigger from
--      episodes.series_id, so ~100 existing insert call-sites need no change.
--      Series-scoped routes (episode_id IS NULL) stamp it explicitly.
--   2. concierge_threads.series_id — the thread's home series (chat-per-series).
--      A BEFORE trigger keeps it synced to the bound episode's series.
--   3. Injection trigger v6: episode-thread → same-series-thread → SKIP.
--      The global latest-open fallback survives ONLY for studio-global events
--      (no episode AND no series) — there is no leak semantics for those.
--      Skipped events are still visible in Activity feed + Director Inbox.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. activity_events.series_id ------------------------------------------------

ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.series(id) ON DELETE SET NULL;

-- Backfill from the episode's parent series.
UPDATE public.activity_events ae
SET series_id = e.series_id
FROM public.episodes e
WHERE ae.episode_id = e.id
  AND ae.series_id IS NULL;

-- Backfill series-scoped events that historically stamped metadata.series_id
-- (series/bible/themes routes). Guarded: valid uuid + row must exist.
UPDATE public.activity_events
SET series_id = (metadata->>'series_id')::uuid
WHERE series_id IS NULL
  AND episode_id IS NULL
  AND metadata->>'series_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM public.series s WHERE s.id = (metadata->>'series_id')::uuid
  );

CREATE INDEX IF NOT EXISTS activity_events_series_created_idx
  ON public.activity_events (series_id, created_at DESC)
  WHERE series_id IS NOT NULL;

-- Autofill: episode events inherit the series without touching any TS call-site.
CREATE OR REPLACE FUNCTION public.tg_activity_events_autofill_series()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.series_id IS NULL AND NEW.episode_id IS NOT NULL THEN
    SELECT series_id INTO NEW.series_id
    FROM public.episodes
    WHERE id = NEW.episode_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activity_events_autofill_series ON public.activity_events;
CREATE TRIGGER activity_events_autofill_series
  BEFORE INSERT ON public.activity_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_events_autofill_series();

-- 2. concierge_threads.series_id ----------------------------------------------

ALTER TABLE public.concierge_threads
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.series(id) ON DELETE SET NULL;

UPDATE public.concierge_threads t
SET series_id = e.series_id
FROM public.episodes e
WHERE t.episode_id = e.id
  AND t.series_id IS NULL;

CREATE INDEX IF NOT EXISTS concierge_threads_series_started_idx
  ON public.concierge_threads (series_id, started_at DESC)
  WHERE series_id IS NOT NULL;

-- Keep thread.series_id consistent with its bound episode. Fires on INSERT and
-- on episode re-binds (updateThreadEpisode); an episode always implies its
-- series, so the app layer never computes this by hand.
CREATE OR REPLACE FUNCTION public.tg_concierge_threads_autofill_series()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.episode_id IS NOT NULL THEN
    SELECT series_id INTO NEW.series_id
    FROM public.episodes
    WHERE id = NEW.episode_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS concierge_threads_autofill_series ON public.concierge_threads;
CREATE TRIGGER concierge_threads_autofill_series
  BEFORE INSERT OR UPDATE OF episode_id ON public.concierge_threads
  FOR EACH ROW EXECUTE FUNCTION public.tg_concierge_threads_autofill_series();

-- 3. Injection trigger v6 — series-scoped thread selection ---------------------
-- Body identical to 0043 except the thread-selection block and series_id in the
-- turn metadata. Whitelist unchanged. Keep in sync with
-- lib/concierge/ambient-events.ts, lib/api/event-actionable.ts,
-- scripts/backfill-pa-ambient.ts, and lib/concierge/threads.ts
-- (resolveOpenThreadId — the TS twin of the selection below).

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
    'asset_created',
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

  -- 0049 series-scoped selection (chat-per-series, Director q3/q1 2026-07-25):
  --   episode event  → open thread of that episode, else open thread of its
  --                    series, else SKIP (no cross-series leak; the event is
  --                    still in the Activity feed + Inbox).
  --   series event   → open thread of that series, else SKIP.
  --   studio-global  → latest open thread (unchanged — no series to leak across).
  IF NEW.episode_id IS NOT NULL THEN
    SELECT id, director_id INTO v_thread_id, v_director_id
    FROM public.concierge_threads
    WHERE ended_at IS NULL
      AND episode_id = NEW.episode_id
    ORDER BY started_at DESC
    LIMIT 1;

    IF v_thread_id IS NULL AND NEW.series_id IS NOT NULL THEN
      SELECT id, director_id INTO v_thread_id, v_director_id
      FROM public.concierge_threads
      WHERE ended_at IS NULL
        AND series_id = NEW.series_id
      ORDER BY started_at DESC
      LIMIT 1;
    END IF;
  ELSIF NEW.series_id IS NOT NULL THEN
    SELECT id, director_id INTO v_thread_id, v_director_id
    FROM public.concierge_threads
    WHERE ended_at IS NULL
      AND series_id = NEW.series_id
    ORDER BY started_at DESC
    LIMIT 1;
  ELSE
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
    'series_id',         NEW.series_id,
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
  '0049: series-scoped thread selection (episode → series → skip; global fallback only for events with no episode AND no series). Whitelist unchanged from 0043. Paid-wake gate is lib/api/event-actionable.ts.';
