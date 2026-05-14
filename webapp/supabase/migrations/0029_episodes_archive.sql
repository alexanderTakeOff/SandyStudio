-- ──────────────────────────────────────────────────────────────────────────────
-- 0029_episodes_archive.sql
-- Sprint α→ε kickoff plan, P0(b). 2026-05-14.
--
-- WHY:
--   Director needs to mark episodes as ARCHIVED from the UI so the rest of
--   the system (Episode list filters, Pipeline DAG, Activity Feed, PA tools)
--   can react to one canonical signal. Before this migration the closest
--   terminal state was `COMPLETE`, which carries a different semantic
--   ("shipped & analytics done"). An episode like SS-S14-E20 — closed at
--   17/19 shots because Veo quota was exhausted — does not fit `COMPLETE`.
--
-- WHAT:
--   1. Add `ARCHIVED` to the `episode_status` enum. Single value covers both
--      PARTIAL and FULL archive — the distinction lives in
--      `episodes.metadata.archival.state` (see schema below). Keeps the enum
--      thin and lets future archival reasons grow without further migrations.
--
--   2. Add `episodes.metadata jsonb` (default `'{}'::jsonb`, NOT NULL). This
--      mirrors `assets.metadata` from migration 0020. Used initially for
--      the archival payload but reusable for future structured episode-level
--      side-data without column proliferation.
--
--      Archival payload schema (under `metadata.archival`):
--        {
--          state:               'PARTIAL' | 'COMPLETE',
--          completed_shots:     integer,
--          total_shots:         integer,
--          reason:              text,
--          final_cut_asset_id:  uuid | null,
--          final_cut_path:      text | null,
--          archived_at:         iso8601,
--          archived_by:         text   -- 'Director' | 'EXEC-DIR-AI:<scope>'
--        }
--
-- HOW TO APPLY:
--   The Supabase MCP `apply_migration` is denied permissions in this env
--   (see memory note 2026-05-13). Director applies via Dashboard SQL editor
--   or `psql`. Idempotent: enum ADD VALUE IF NOT EXISTS + column IF NOT EXISTS.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Extend episode_status enum.
ALTER TYPE public.episode_status ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- 2. Add metadata column.
ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.episodes.metadata IS
  'Structured side-data. Initial use: metadata.archival = { state, completed_shots, total_shots, reason, final_cut_asset_id, final_cut_path, archived_at, archived_by } when status=ARCHIVED. See migration 0029.';

-- GIN index for ad-hoc queries (e.g. "all PARTIAL archives across series").
CREATE INDEX IF NOT EXISTS episodes_metadata_gin
  ON public.episodes USING GIN (metadata);
