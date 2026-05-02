-- ──────────────────────────────────────────────────────────────────────────────
-- 0011_phase5c_fixes.sql
-- Phase 5c first-cycle fixes per Director smoke 2026-04-29:
--
--   1. assets.file_type CHECK was too strict — runner writes 'SCR-script',
--      'SPC-metadata', 'VID-animatic', etc. The original constraint only
--      allowed bare codes ('SCR','SPC',...). Replay-pilot didn't catch this
--      because its mock supabase ignores CHECK constraints.
--
--      Relax to: <BASE>(-<variant>)?  where BASE is one of the canonical
--      short codes per CLAUDE.md §3 naming convention.
--
--   2. Cleanup of orphan SS01-E01 episode + SS01 series. They were created
--      during the first user smoke when wizard accepted 'SS01' (no dash) as
--      series code — assets.filename CHECK then rejected the brief insert,
--      leaving episode without its brief.
-- ──────────────────────────────────────────────────────────────────────────────


-- ─── 1. Relax assets.file_type CHECK ─────────────────────────────────────────
ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_file_type_check;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_file_type_check
  CHECK (file_type ~ '^(SCR|STB|IMG|VID|AUD|BIB|PRO|REV|SPC|STA)(-[a-z0-9_]+)?$');


-- ─── 2. Cleanup orphan first-smoke data ──────────────────────────────────────
-- Series code 'SS01' is invalid format (must be 'SS-S01'). Wizard now rejects.
-- Delete the failed run so Director can restart cleanly.
DELETE FROM public.jobs
  WHERE episode_id IN (
    SELECT id FROM public.episodes WHERE episode_code IN ('SS01-E01')
  );

DELETE FROM public.activity_events
  WHERE episode_id IN (
    SELECT id FROM public.episodes WHERE episode_code IN ('SS01-E01')
  );

DELETE FROM public.episodes WHERE episode_code IN ('SS01-E01');
DELETE FROM public.approval_authority_matrix WHERE series_id IN (
  SELECT id FROM public.series WHERE code = 'SS01'
);
DELETE FROM public.series WHERE code = 'SS01';

-- Reset onboarding state so the wizard reopens clean.
UPDATE public.app_config
  SET value = '{"current_step":1,"completed_steps":[],"draft_series_id":null,"draft_episode_id":null,"started_at":null}'::jsonb,
      synced_at = now()
  WHERE scope = 'onboarding' AND key = 'state';
