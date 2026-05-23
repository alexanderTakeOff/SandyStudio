-- ──────────────────────────────────────────────────────────────────────────────
-- 0034_relax_file_type_for_mixed_case_variants.sql
-- 2026-05-20 — Critical schema fix for Sprint «Дизайнер и Аниматор» Plan-asset
-- flow. Polina diagnosed 22 Reference Designer jobs failing on:
--   "saveAgentOutput: assets insert failed: new row for relation \"assets\"
--    violates check constraint \"assets_file_type_check\""
--
-- Root cause: runner.ts saveAgentOutput builds file_type as
--   `${fileTypeBase}-${variant}` where variant for EXEC-EREF-DESIGNER and
-- EXEC-VANIM is the canonical shot_id like "SS-S15-E01-A1-SC01-SH01". The
-- regex from migration 0017 was `^...(SPC|...)(-[a-z0-9_-]+)?$` — only
-- lowercase letters allowed after the prefix. Shot ids carry uppercase
-- (SS, S, E, A, SC, SH), so the entire string failed CHECK validation,
-- the insert was rejected, and the Designer agent crashed at save step.
-- All 22 fan-out jobs hit the same wall.
--
-- 0032 noted "SPC is already whitelisted, no filename-format migration
-- needed" — that was true for the SPC prefix but missed the variant
-- character-class. This migration relaxes the second capture group to
-- accept uppercase letters too, so Plan-asset file_types like
-- 'SPC-ref_plan-SS-S15-E01-A1-SC01-SH01' validate.
--
-- Also widens assets_filename_format (added in 0017) — the filename
-- always echoed the same shape, so it's a parallel issue.
--
-- Idempotent: DROP IF EXISTS + ADD.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_file_type_check;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_file_type_check
  CHECK (file_type ~ '^(SCR|STB|IMG|VID|AUD|BIB|PRO|REV|SPC|STA|SBL)(-[A-Za-z0-9_-]+)?$');

-- assets_filename_format already permits uppercase (it uses ~* case-insensitive
-- regex per 0017 line 22). No change required there. Migration only touches
-- the file_type CHECK that was the actual blocker.
