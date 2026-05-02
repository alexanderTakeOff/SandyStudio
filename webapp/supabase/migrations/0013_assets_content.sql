-- ──────────────────────────────────────────────────────────────────────────────
-- 0013_assets_content.sql
-- Phase 5d step 2.1 — markdown content as a first-class column on assets.
--
-- Decision (provider_strategy.md §5 + chat 2026-04-30): markdown is editorial
-- structured content (briefs, scripts, storyboards, QA reports). It belongs
-- in the database, not on disk. Binary assets (image / video / audio) keep
-- using staging_path / drive_file_id (the latter lands in Phase 8 step 10).
--
-- Until now, runner.ts saveAgentOutput stuffed the markdown body into
-- `description` (truncated 8000 chars). That worked as a Phase 4 mock
-- workaround but is the wrong shape — `description` is a short summary,
-- `content` is the source-of-truth body. Phase 5d step 2 (kebab Edit)
-- needs a real read/write target.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS content text NULL;

COMMENT ON COLUMN public.assets.content IS
  'Canonical body for text/markdown assets. NULL for binary assets (image/video/audio) — those use staging_path or drive_file_id.';
