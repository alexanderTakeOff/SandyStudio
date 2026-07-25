-- ──────────────────────────────────────────────────────────────────────────────
-- 0050_channels_ui_write_and_branding.sql
-- Multi-channel Phase 2 (2026-07-25):
--   1. Director (authenticated) can create/update channels from the Settings UI
--      (0046 gave authenticated SELECT only; INSERT/UPDATE were service-role).
--      Single-Director model — same trust as series_authenticated_full (0010).
--   2. Seed Sandy's branding into channels.metadata so the shorts-route /
--      ShortsPanel / EXEC-PUB literals can move from code to data with
--      byte-identical behaviour (multi-channel.md §2: metadata = «брендовые
--      дефолты, оверлеи» — Phase 2).
--
-- Branding resolution cascade (lib/agents/branding.ts):
--   series.metadata.branding.<key> → channels.metadata.branding.<key> → neutral.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Director write access ----------------------------------------------------

DROP POLICY IF EXISTS channels_authenticated_insert ON public.channels;
CREATE POLICY channels_authenticated_insert ON public.channels
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS channels_authenticated_update ON public.channels;
CREATE POLICY channels_authenticated_update ON public.channels
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 2. Sandy branding seed (idempotent — only when no branding key yet) ---------

UPDATE public.channels
SET metadata = metadata || jsonb_build_object(
  'branding', jsonb_build_object(
    'short_overlay_text', 'SANDY the HOURGLASS',
    'short_description',
      '⏳ Sandy the Hourglass — silent physical comedy. Life is short. Flip yourself. #Shorts',
    'short_tags', jsonb_build_array('Shorts', 'Sandy the Hourglass', 'animation', 'comedy')
  )
)
WHERE credential_key = 'SANDY'
  AND NOT (metadata ? 'branding');
