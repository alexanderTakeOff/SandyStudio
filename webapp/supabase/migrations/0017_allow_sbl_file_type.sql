-- ──────────────────────────────────────────────────────────────────────────────
-- 0017_allow_sbl_file_type.sql
-- Step 4 follow-up: allow `SBL-*` in the assets.file_type CHECK regex and
-- the assets.filename_format regex. Series Bible asset types (introduced in
-- 0016_series_bible_assets.sql) need their own prefix space so they don't
-- clash with episode-scoped BIB-* filenames.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_file_type_check;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_file_type_check
  CHECK (file_type ~ '^(SCR|STB|IMG|VID|AUD|BIB|PRO|REV|SPC|STA|SBL)(-[a-z0-9_-]+)?$');

ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_filename_format;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_filename_format
  CHECK (
    filename ~* '^SS-(S\d{2}|PILOT)(-E\d{2})?-(SCR|STB|IMG|VID|AUD|BIB|PRO|REV|SPC|STA|SBL)-[a-z0-9_-]+-v\d{2}-(DRAFT|REVIEW|REVISION|APPROVED|LOCKED)\.[a-z0-9]+$'
  );
