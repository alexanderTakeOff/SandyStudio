-- 0056 (Ф4 миграции «Полина в харнес», 2026-08-09) — кнопки Директора становятся
-- СЛЫШИМЫМИ: approval_granted / pipeline_started / episode_settings_changed
-- добавлены в whitelist инжекта activity_events → concierge_turns. До этого
-- нажатие «Approve» и «Save generation config» не рождало ни пузыря в чате, ни
-- сигнала уму (D92) — Директор работал курьером между своей кнопкой и своим
-- исполнителем. Эхо-защита прежняя: собственные approval_* Директора в его же
-- треде отфильтрованы блоком actor=director_id внутри функции.
-- Тело функции — 0049 v6 с расширенным v_actionable; больше НИЧЕГО не менялось.
CREATE OR REPLACE FUNCTION public.tg_inject_activity_event_into_concierge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actionable boolean := NEW.event_type IN (
    'agent_completed','agent_failed',
    'approval_granted','pipeline_started','episode_settings_changed',
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


