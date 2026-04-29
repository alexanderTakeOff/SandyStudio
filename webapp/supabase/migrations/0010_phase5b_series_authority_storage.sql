-- ──────────────────────────────────────────────────────────────────────────────
-- 0010_phase5b_series_authority_storage.sql
-- Phase 5b additions per:
--   - specs/system/onboarding.md §6.4 (approval_authority_matrix)
--   - specs/system/onboarding.md §5.3 (series table)
--   - specs/system/storage_configuration.md §2 (app_config storage scope)
--
-- Additive only. Does not alter or drop existing rows. Safe to apply on top
-- of 0001..0009.
-- ──────────────────────────────────────────────────────────────────────────────


-- ─── series table ────────────────────────────────────────────────────────────
-- The webapp until now used episodes.series_id as a free-text slug pointing
-- at FILMS/<series>/PROJECT.md. Phase 5b introduces a proper rows table so
-- Series CRUD has a real backing model. episodes.series_id remains a text
-- column that matches series.code (no destructive FK migration).
CREATE TABLE IF NOT EXISTS public.series (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE NOT NULL,                  -- e.g. "SS-S01"
  title           text NOT NULL,
  audience        text,                                  -- 'adult' | 'kids' | 'mixed' | 'other'
  genre           text,                                  -- 'comedy' | 'drama' | 'doc' | 'sci_fi' | 'other'
  logline         text,
  episode_budget_ceiling numeric(10,2),
  status          text NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_by      uuid,                                  -- auth.users(id)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER series_set_updated_at
  BEFORE UPDATE ON public.series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_series_status ON public.series(status);


-- ─── approval_authority_matrix ───────────────────────────────────────────────
-- Per onboarding.md §6.4. Stores per-series, per-category approver choice.
-- Visual + publish rows are always Director (is_locked=true).
CREATE TABLE IF NOT EXISTS public.approval_authority_matrix (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id         uuid NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  category          text NOT NULL
                    CHECK (category IN (
                      'character_visual','location_ref','generated_shots','thumbnail',
                      'script','storyboard','music','metadata','publish'
                    )),
  approver          text NOT NULL
                    CHECK (approver IN ('director','exec_dir_ai','human_delegate')),
  delegate_user_id  uuid,                                -- nullable, future
  is_locked         boolean NOT NULL DEFAULT false,      -- visual + publish locked
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aam_unique UNIQUE (series_id, category)
);

CREATE TRIGGER aam_set_updated_at
  BEFORE UPDATE ON public.approval_authority_matrix
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_aam_series ON public.approval_authority_matrix(series_id);


-- ─── extend app_config CHECK to allow new scopes ─────────────────────────────
-- Drop and re-add the CHECK constraint. Kept additive — no existing data is
-- affected because no rows currently use the new scopes.
ALTER TABLE public.app_config
  DROP CONSTRAINT IF EXISTS app_config_scope_check;

ALTER TABLE public.app_config
  ADD CONSTRAINT app_config_scope_check CHECK (
    scope IN (
      'production','visual','audio','seo','analytics','finance','providers',
      'narrative','characters','world','naming','app',
      'storage','onboarding','system'
    )
  );


-- ─── seed default storage paths (idempotent) ─────────────────────────────────
INSERT INTO public.app_config (scope, key, value, source)
VALUES
  ('storage', 'project_root',
   '"C:\\SandyStudio\\FILMS\\"'::jsonb, 'repo'),
  ('storage', 'media_storage_root',
   '"H:\\My Drive\\SandyStudio_Media\\"'::jsonb, 'repo'),
  ('storage', 'project_root_writable',  'false'::jsonb, 'repo'),
  ('storage', 'media_root_writable',    'false'::jsonb, 'repo'),
  ('storage', 'last_validated_at',      'null'::jsonb, 'repo'),
  ('storage', 'last_validated_by',      'null'::jsonb, 'repo'),
  ('system',  'system_mode',            '"===1==="'::jsonb, 'repo'),
  ('system',  'governance_mode_default','1'::jsonb, 'repo'),
  ('onboarding', 'state',
   '{"current_step":1,"completed_steps":[],"draft_series_id":null,"draft_episode_id":null,"started_at":null}'::jsonb,
   'repo')
ON CONFLICT (scope, key) DO NOTHING;


-- ─── activity_events: extend event_type vocabulary ───────────────────────────
-- We rely on activity_events for audit trail of new actions. Existing schema
-- has no CHECK on event_type (free text), so no migration needed. Document
-- the new event types here for searchability:
--
--   storage_config_change
--   system_mode_change
--   governance_mode_change
--   series_created
--   episode_created
--   approval_granted          (already used)
--   approval_revision         (new)
--   approval_rejected         (new)
--   manual_trigger            (new)
--   onboarding_advanced       (new)


-- ─── RLS policies for new tables ─────────────────────────────────────────────
ALTER TABLE public.series                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_authority_matrix   ENABLE ROW LEVEL SECURITY;

CREATE POLICY series_authenticated_full ON public.series
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY aam_authenticated_full ON public.approval_authority_matrix
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
