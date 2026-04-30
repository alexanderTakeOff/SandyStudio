-- ──────────────────────────────────────────────────────────────────────────────
-- 0015_assets_drive_fields.sql
-- Phase 8 step 10 — Drive becomes canonical storage for binaries.
--
-- Per provider_strategy.md §5.2: when storage provider is `drive_native`,
-- binaries (image/video/audio) are uploaded to Drive in addition to the
-- local cache at webapp/public/staging/. This migration adds the two columns
-- needed to track the Drive file identity:
--
--   drive_file_id      — canonical Drive file id (used for download/delete/share)
--   drive_web_view_url — Drive's preview page URL (auth required to view)
--
-- The legacy `drive_path` column keeps its current role: a string the browser
-- can fetch directly. For local cache that's "/staging/<file>"; for Drive-only
-- mode (post-MVP) it can hold the webViewLink so the asset is still
-- discoverable without the cache.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS drive_file_id text NULL;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS drive_web_view_url text NULL;

COMMENT ON COLUMN public.assets.drive_file_id IS
  'Canonical Google Drive file id. Set when the storage provider is drive_native and the asset is binary. NULL for text assets (those use assets.content) and for mock-mode binaries.';

COMMENT ON COLUMN public.assets.drive_web_view_url IS
  'Drive web preview URL (https://drive.google.com/file/d/.../view). Authenticated. Used as fallback when the local /staging/ cache is unavailable.';
