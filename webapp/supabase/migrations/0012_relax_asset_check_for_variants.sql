-- ──────────────────────────────────────────────────────────────────────────────
-- 0012_relax_asset_check_for_variants.sql
-- Phase 5c first-cycle fix: EXEC-VGEN/EXEC-MGEN write file_type values that
-- include the shotId/section as a variant. shotIds come from EXEC-EDIT and
-- contain dashes (e.g. "<episodeUuid>-A1-SC01-SH01"). The 0011 CHECK regex
-- only allowed a single underscore/letter segment after the base code,
-- which rejected these legitimate values.
--
-- New rule: allow [a-z0-9_-]+ in the variant + filename description portions.
-- Still rejects spaces, uppercase, and dangerous chars.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_file_type_check;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_file_type_check
  CHECK (file_type ~ '^(SCR|STB|IMG|VID|AUD|BIB|PRO|REV|SPC|STA)(-[a-z0-9_-]+)?$');


ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_filename_format;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_filename_format
  CHECK (
    filename ~* '^SS-(S\d{2}|PILOT)(-E\d{2})?-(SCR|STB|IMG|VID|AUD|BIB|PRO|REV|SPC|STA)-[a-z0-9_-]+-v\d{2}-(DRAFT|REVIEW|REVISION|APPROVED|LOCKED)\.[a-z0-9]+$'
  );
