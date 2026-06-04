-- ──────────────────────────────────────────────────────────────────────────────
-- 0036_single_approved_partial_indexes.sql
-- 2026-06-04 — Single-approved invariant (Director rule, UNIT 1).
--
-- Enforce at the DB level: there is never more than ONE occupying asset per
-- slot. APPROVED is the occupying status for episode-scoped slots; LOCKED is
-- the occupying status for series-scoped SBL Bible assets. The application
-- layer (app/api/assets/[id]/approve/route.ts → demoteSiblingApproved) already
-- demotes prior occupants to INVALIDATED at approve/lock time; these partial
-- UNIQUE indexes guarantee correctness even if that app logic ever regresses.
--
-- Mirrors the existing EREF index shape from 0024_eref_one_approved_per_shot
-- (IMG-episode_ref, keyed on metadata.shot_reference.shot_id). This migration
-- adds one index per remaining slot family:
--   - IMG-anchor    → (episode_id, shot_reference.shot_id, anchor_position)
--   - SPC-shot_plan → (episode_id, shot_id)   [covers SPC-shot_plan-% too —
--                      every Plan variant carries metadata.shot_id]
--   - VID-shot      → (episode_id, shot_id)
--   - SPC-ref_plan  → (episode_id, shot_id)   [covers SPC-ref_plan-% too]
--   - SBL           → (series_id, file_type)  [LOCKED set]
--
-- Each index is filtered to its occupying status + file_type family + a
-- NOT NULL guard on the slot key, so legacy rows missing the key (pre-invariant
-- records) are skipped rather than colliding.
--
-- !! RUN THE GENERALIZED DEDUP (npm run dedup-approved-anchors) BEFORE APPLYING
--    THIS MIGRATION — existing duplicate APPROVED / LOCKED rows will make index
--    creation fail (duplicate key violation). The orchestrator runs the dedup
--    (dry-run then apply) across ALL episodes first, then `supabase db push`.
--
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── IMG-anchor: one APPROVED anchor per (episode, shot_id, anchor_position).
-- start/end are distinct slots, so anchor_position is part of the key.
CREATE UNIQUE INDEX IF NOT EXISTS assets_one_approved_per_anchor
  ON public.assets (
    episode_id,
    ((metadata -> 'shot_reference' ->> 'shot_id')),
    ((metadata ->> 'anchor_position'))
  )
  WHERE
    status = 'APPROVED'
    AND file_type LIKE 'IMG-anchor%'
    AND (metadata -> 'shot_reference' ->> 'shot_id') IS NOT NULL
    AND (metadata ->> 'anchor_position') IS NOT NULL;

COMMENT ON INDEX public.assets_one_approved_per_anchor IS
  'Single-approved invariant — one APPROVED IMG-anchor per (episode, shot_id, anchor_position). '
  'Route: app/api/assets/[id]/approve/route.ts (demoteSiblingApproved).';

-- ── SPC-shot_plan: one APPROVED Plan per (episode, shot_id). The LIKE pattern
-- and the metadata.shot_id key cover both SPC-shot_plan and SPC-shot_plan-%.
CREATE UNIQUE INDEX IF NOT EXISTS assets_one_approved_per_shot_plan
  ON public.assets (
    episode_id,
    ((metadata ->> 'shot_id'))
  )
  WHERE
    status = 'APPROVED'
    AND file_type LIKE 'SPC-shot_plan%'
    AND (metadata ->> 'shot_id') IS NOT NULL;

COMMENT ON INDEX public.assets_one_approved_per_shot_plan IS
  'Single-approved invariant — one APPROVED SPC-shot_plan(-%) per (episode, shot_id). '
  'Route: app/api/assets/[id]/approve/route.ts (demoteSiblingApproved).';

-- ── VID-shot: one APPROVED video per (episode, shot_id).
CREATE UNIQUE INDEX IF NOT EXISTS assets_one_approved_per_vid_shot
  ON public.assets (
    episode_id,
    ((metadata ->> 'shot_id'))
  )
  WHERE
    status = 'APPROVED'
    AND file_type LIKE 'VID-shot%'
    AND (metadata ->> 'shot_id') IS NOT NULL;

COMMENT ON INDEX public.assets_one_approved_per_vid_shot IS
  'Single-approved invariant — one APPROVED VID-shot(-%) per (episode, shot_id). '
  'Route: app/api/assets/[id]/approve/route.ts (demoteSiblingApproved).';

-- ── SPC-ref_plan: one APPROVED Reference Plan per (episode, shot_id). The LIKE
-- pattern + metadata.shot_id key cover both SPC-ref_plan and SPC-ref_plan-%.
CREATE UNIQUE INDEX IF NOT EXISTS assets_one_approved_per_ref_plan
  ON public.assets (
    episode_id,
    ((metadata ->> 'shot_id'))
  )
  WHERE
    status = 'APPROVED'
    AND file_type LIKE 'SPC-ref_plan%'
    AND (metadata ->> 'shot_id') IS NOT NULL;

COMMENT ON INDEX public.assets_one_approved_per_ref_plan IS
  'Single-approved invariant — one APPROVED SPC-ref_plan(-%) per (episode, shot_id). '
  'Route: app/api/assets/[id]/approve/route.ts (demoteSiblingApproved).';

-- ── SBL Bible assets: one LOCKED asset per (series_id, file_type). SBL is
-- series-scoped (episode_id NULL); LOCKED is the occupying status for the set.
CREATE UNIQUE INDEX IF NOT EXISTS assets_one_locked_per_sbl_slot
  ON public.assets (
    series_id,
    file_type
  )
  WHERE
    status = 'LOCKED'
    AND file_type LIKE 'SBL%'
    AND series_id IS NOT NULL;

COMMENT ON INDEX public.assets_one_locked_per_sbl_slot IS
  'Single-approved invariant — one LOCKED SBL-* per (series_id, file_type). '
  'Route: app/api/assets/[id]/approve/route.ts (demoteSiblingApproved).';
