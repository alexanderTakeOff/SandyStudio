-- ───────────────────────────────────────────────────────────────────────────
-- 0028_widen_vgen_provider.sql
-- Phase 2 (2026-05-13) — promote Seedance 2.0 to the default character_video
-- provider after Phase 1 probe confirmed substantially better character
-- motion + camera control over Veo 3.1.
--
-- Schema-level: no DDL change required. `provider_assignments.active_provider_id`
-- is unconstrained `text` (intentionally — keeps the catalog mutable without
-- migrations), and `app_config.value` is `jsonb` (vgen_defaults lives there).
-- Both surfaces now accept 'seedance-fal-img2vid'.
--
-- Data:
--   1. Flip `provider_assignments` row for contract='character_video' from
--      the previous default (mock or veo-3-img2vid) to 'seedance-fal-img2vid'.
--   2. Bump notes column.
-- ───────────────────────────────────────────────────────────────────────────

UPDATE public.provider_assignments
SET
  active_provider_id = 'seedance-fal-img2vid',
  notes = 'Seedance 2.0 via fal.ai (Phase 2, 2026-05-13). Per Director: best motion / camera control on probe (orbit + dance + 360°). Veo 3.1 still selectable per-event via UI dropdown.',
  updated_at = now()
WHERE contract = 'character_video';

-- The `video` contract (text-to-video) stays on its previous setting — Director
-- decided per-contract switching out of scope for this PR. If Director wants
-- Seedance text-to-video too, they can flip it in /settings → Providers.
