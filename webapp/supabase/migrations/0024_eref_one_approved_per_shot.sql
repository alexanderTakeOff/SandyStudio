-- ──────────────────────────────────────────────────────────────────────────────
-- 0024_eref_one_approved_per_shot.sql
-- Enforce EREF v2 invariant: 1 shot ↔ 1 approved image.
--
-- Background:
--   The Animatic stage requires exactly one canonical IMG-episode_ref asset
--   per storyboard shot. Application code in
--   app/api/assets/[id]/approve/route.ts auto-demotes any prior APPROVED
--   asset for the same (episode_id, shot_id) tuple, but DB-level enforcement
--   guarantees correctness even if app logic regresses.
--
-- Index shape:
--   - Partial UNIQUE index over (episode_id, metadata.shot_reference.shot_id)
--   - Filtered to status='APPROVED' AND file_type LIKE 'IMG-episode_ref%'
--   - Skips rows where shot_id is missing (legacy v1 records pre-EREF v2)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS assets_one_approved_per_shot
  ON public.assets (
    episode_id,
    ((metadata -> 'shot_reference' ->> 'shot_id'))
  )
  WHERE
    status = 'APPROVED'
    AND file_type LIKE 'IMG-episode_ref%'
    AND (metadata -> 'shot_reference' ->> 'shot_id') IS NOT NULL;

COMMENT ON INDEX public.assets_one_approved_per_shot IS
  'EREF v2 invariant — only one APPROVED IMG-episode_ref per (episode, shot_id). '
  'See spec: purrfect-stirring-hollerith.md, route: app/api/assets/[id]/approve/route.ts.';
