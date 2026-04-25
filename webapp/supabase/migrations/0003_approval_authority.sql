-- ──────────────────────────────────────────────────────────────────────────────
-- 0003_approval_authority.sql
-- Approval Authority Matrix per specs/system/webapp.md §6.6.
-- Source of truth for "who approves what" per category.
-- One row per (series_id, episode_id, category): episode_id NULL = series default,
-- episode_id set = episode-level override.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.approval_authority (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id     text NOT NULL,
  episode_id    text,                                     -- null = series default; set = episode override
  category      text NOT NULL
                CHECK (category IN (
                  'character_visual',
                  'location_ref',
                  'generated_shots',
                  'thumbnails',
                  'scripts',
                  'storyboards',
                  'audio',
                  'copy',
                  'publish'
                )),
  approver_type text NOT NULL
                CHECK (approver_type IN ('director','human_delegate','exec_dir_ai')),
  approver_name text,                                     -- required iff approver_type='human_delegate'
  is_visual     boolean NOT NULL DEFAULT false,           -- visual=true means AI auto-approve disallowed by Visual Approval Rule
  set_by        text NOT NULL,                            -- always Director user id (audit trail)
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- One declared approver per (series, episode-or-default, category).
  CONSTRAINT approval_authority_unique
    UNIQUE NULLS NOT DISTINCT (series_id, episode_id, category),

  -- approver_name must be present iff human_delegate.
  CONSTRAINT approver_name_required_for_delegate
    CHECK (
      (approver_type = 'human_delegate' AND approver_name IS NOT NULL AND length(trim(approver_name)) > 0)
      OR (approver_type <> 'human_delegate' AND approver_name IS NULL)
    ),

  -- Hard-lock: publish category may never be exec_dir_ai (HARD LIMIT per webapp.md §6.6 + CLAUDE.md §6).
  CONSTRAINT publish_never_ai
    CHECK (NOT (category = 'publish' AND approver_type = 'exec_dir_ai')),

  -- Visual Approval Rule: visual categories may never be exec_dir_ai (locked 2026-04-24).
  CONSTRAINT visual_never_ai
    CHECK (NOT (is_visual = true AND approver_type = 'exec_dir_ai'))
);
