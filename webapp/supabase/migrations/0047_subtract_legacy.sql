-- ──────────────────────────────────────────────────────────────────────────────
-- 0047_subtract_legacy.sql
-- Multi-channel Phase 0 subtraction: two dead tables.
--
--   series_state       (0002) — "queryable mirror of PROJECT.md paths"; never
--                       read by any code path. 0 rows at drop time (verified).
--   approval_authority (0003) — text-id predecessor of approval_authority_matrix
--                       (0010, uuid FK). All live code uses the matrix table.
--                       0 rows at drop time (verified).
--
-- Policies/triggers/indexes fall with the tables (CASCADE not needed — no
-- dependent objects outside the tables themselves).
-- ──────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.series_state;
DROP TABLE IF EXISTS public.approval_authority;
