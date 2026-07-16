-- Migration 0044: allow the authenticated Director browser session to SELECT
-- episode_scorecard.
--
-- Bug (2026-07-16): the Factory page (/factory) rendered "No scorecards yet"
-- despite a fully-populated table (25 episodes, 35 proposals). Root cause:
-- 0041 enabled RLS on episode_scorecard but granted access to service_role ONLY
-- (no authenticated policy, no authenticated grant). The Factory API reads via
-- requireDirector()'s cookie-based client, which runs as the `authenticated`
-- role (RLS-scoped) — NOT service_role — so every browser read returned 0 rows.
-- Writes (Inngest scorecard refresh + backfill) use service_role and worked,
-- which is why the table filled but the page stayed empty. Classic post-2026-05-30
-- "new public table needs an explicit authenticated grant" trap.
--
-- Fix: mirror the established single-Director pattern (0006 director_all,
-- 0027 activity_events_authenticated_select). Read-only for the browser — all
-- scorecard writes remain service_role, so INSERT/UPDATE/DELETE stay blocked here.

GRANT SELECT ON public.episode_scorecard TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.episode_scorecard'::regclass
      AND polname = 'episode_scorecard_authenticated_select'
  ) THEN
    DROP POLICY episode_scorecard_authenticated_select ON public.episode_scorecard;
  END IF;
END $$;

CREATE POLICY episode_scorecard_authenticated_select
  ON public.episode_scorecard
  FOR SELECT
  TO authenticated
  USING (true);
