-- Migration 0027: allow authenticated users to SELECT activity_events.
-- Phase 10A.0 Realtime push fix (Director directive 2026-05-13).
--
-- Without this, Realtime channel subscriptions silently return zero rows
-- because Supabase Realtime applies row-level security policies to every
-- channel. activity_events had RLS enabled with no SELECT policy → anon
-- AND authenticated requests both blocked → useActivityRealtime hook
-- subscribes successfully but never receives an INSERT event.
--
-- Director surfaced this 2026-05-13 09:37 UTC: "Полина никак не реагирует
-- на сгенерированные / утверждённые кадры — баг". Confirmed by diagnostic
-- showing 14 activity_events in the last 30 minutes but 0 ambient turns
-- persisted in concierge_turns.
--
-- Policy scope:
--   SandyStudio is single-director (webapp.md §2.1). Every authenticated
--   session belongs to the Director. There is no multi-tenant boundary
--   inside activity_events — events reference episodes / assets that the
--   Director already owns. So a permissive SELECT to authenticated is
--   correct AND minimal. INSERT / UPDATE / DELETE remain blocked for the
--   browser (service-role server routes do all writes).

DO $$
BEGIN
  -- Idempotent: drop if exists then create. Avoids "policy already exists"
  -- error when re-running locally or in CI.
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.activity_events'::regclass
      AND polname = 'activity_events_authenticated_select'
  ) THEN
    DROP POLICY activity_events_authenticated_select ON public.activity_events;
  END IF;
END $$;

CREATE POLICY activity_events_authenticated_select
  ON public.activity_events
  FOR SELECT
  TO authenticated
  USING (true);
