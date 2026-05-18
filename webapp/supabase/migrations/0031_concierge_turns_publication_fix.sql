-- Migration 0031: ensure concierge_turns is in supabase_realtime publication.
--
-- 2026-05-14 — Director directive after running γ smoke: «похоже что твои
-- сообщения попадают в чат только после моего ctrl+R».
--
-- Live Realtime probe confirmed: client subscribes successfully (SUBSCRIBED),
-- service-role inserts a row, but 0 events arrive to the subscriber within
-- 5s. Polling watcher catches the row immediately, so the row is in DB —
-- the publication just isn't broadcasting it.
--
-- Migration 0030 attempted `ALTER PUBLICATION supabase_realtime ADD TABLE
-- public.concierge_turns` inside a DO block with `IF NOT EXISTS` guard
-- against `pg_publication_tables`. The guard read evaluated to "needs add"
-- but the ALTER didn't actually take effect (likely a transaction quirk
-- with the IF NOT EXISTS subquery in a DO block). 0026 used a cleaner
-- `EXCEPTION WHEN duplicate_object THEN NULL` pattern — mirroring it here.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.concierge_turns;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Defensive REPLICA IDENTITY FULL (already set by 0030 but no-op if so).
ALTER TABLE public.concierge_turns REPLICA IDENTITY FULL;
