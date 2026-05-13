-- Migration 0026: enable Supabase Realtime for activity_events.
-- Phase 10A.0 (Realtime push) — Director directive 2026-05-13.
--
-- Without this, Supabase Realtime subscriptions to public.activity_events
-- never fire INSERT events and the Prod Assistant (Polina) remains
-- pull-only — she only learns about pipeline events when she runs
-- `getRecentActivityEvents` on her own initiative. With it, every INSERT
-- broadcasts to subscribed clients and the webapp can inject ambient
-- pipeline events into the PA conversation thread within ~1 second.
--
-- The publication `supabase_realtime` exists by default in every Supabase
-- project. ADD TABLE is wrapped in DO to make the migration idempotent
-- when re-run against a database where the table is already published.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- REPLICA IDENTITY FULL so subscribers receive the entire row payload
-- (including metadata JSON) on INSERT/UPDATE, not just the primary key.
-- The full row is needed for PA's event filter — `metadata.agent`,
-- `metadata.file_type`, `actor`, `severity`, `description` all matter.
-- activity_events is append-only and small (one row per pipeline event),
-- so the storage cost of FULL replica identity is negligible here.
ALTER TABLE public.activity_events REPLICA IDENTITY FULL;
