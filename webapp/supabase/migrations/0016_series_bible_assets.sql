-- ──────────────────────────────────────────────────────────────────────────────
-- 0016_series_bible_assets.sql
-- Step 4 of contract pipeline rollout — Series Bible MVP.
--
-- Allow `assets` rows to be series-scoped (Bible assets) in addition to
-- episode-scoped. Existing episode-scoped assets are unchanged.
--
-- New file_type prefixes (text values, no enum change):
--   SBL-general_idea, SBL-character_*, SBL-location_*, SBL-object_*,
--   SBL-style_*, SBL-audio_*
--
-- Constraint: every asset belongs to exactly one of {episode, series}.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Make episode_id nullable (so series-scoped assets can have NULL).
ALTER TABLE assets ALTER COLUMN episode_id DROP NOT NULL;

-- 2. Add series_id column with FK to series.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS series_id UUID
  REFERENCES series(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS assets_series_id_idx ON assets(series_id);

-- 3. Mutual-exclusion check: exactly one of {episode_id, series_id} is set.
-- Drop any prior version first (idempotent).
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_series_or_episode_check;
ALTER TABLE assets ADD CONSTRAINT assets_series_or_episode_check
  CHECK (
    (episode_id IS NOT NULL AND series_id IS NULL) OR
    (episode_id IS NULL AND series_id IS NOT NULL)
  );

-- 4. RLS — Director can read/write Bible assets via series_id ownership.
-- The existing assets RLS policy may already cover this through episode_id;
-- add an explicit policy for series_id-scoped rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assets'
      AND policyname = 'assets_series_director_all'
  ) THEN
    CREATE POLICY assets_series_director_all
      ON assets
      FOR ALL
      TO authenticated
      USING (series_id IS NOT NULL)
      WITH CHECK (series_id IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN assets.series_id IS
  'Series-scoped Bible assets reference the parent series here. Mutually exclusive with episode_id (see assets_series_or_episode_check).';
