-- ──────────────────────────────────────────────────────────────────────────────
-- 0020_assets_metadata.sql
-- Adds a free-form `metadata` JSONB column to assets so we can carry
-- structured side-data without proliferating columns:
--
--   image_prompt:
--     current_version: int
--     style_anchor_asset_id: uuid | null
--     history: [{ version, prompt, source, at, cost_usd, staging_path,
--                 drive_file_id, drive_web_view_url, width, height, quality }]
--
--   description_history:
--     current_version: int
--     history: [{ version, content, source, at }]
--
-- Used by:
--   - EXEC-BIBLE-AUTHOR (initial enrichment after Director approves a
--     canon extension proposal)
--   - POST /api/series/[id]/bible/[assetId]/regenerate-image
--     (Director-driven prompt edits + image rerolls)
--   - PATCH /api/assets/[id] (description history versioning)
--
-- The column is nullable — pre-existing assets keep working untouched.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE assets ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN assets.metadata IS
  'Structured side-data: image_prompt.history (Director-editable rerolls), description_history (versioned text edits). See migration 0020 for schema.';

-- GIN index for fast lookup if we ever need to query by prompt source / version.
CREATE INDEX IF NOT EXISTS assets_metadata_gin ON assets USING GIN (metadata);
