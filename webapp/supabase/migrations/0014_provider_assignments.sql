-- ──────────────────────────────────────────────────────────────────────────────
-- 0014_provider_assignments.sql
-- Phase 8 step 1 — global-tier provider selection.
--
-- Per provider_strategy.md §3.4: this table replaces the YAML's `primary` field
-- as the runtime source of truth for "which adapter resolves a contract".
-- The Director will switch active providers through UI (/settings/providers),
-- which will land in a follow-up step. For now: seeded by this migration and
-- editable via SQL only.
--
-- Phase 8 first-call MVP seeding strategy:
--   image           → gpt-image-1   (REAL — uses existing OPENAI_API_KEY)
--   video           → mock          (real Veo wired in step 13)
--   character_video → mock          (real Veo img2vid wired in step 13)
--   storage         → mock          (real Drive wired in step 10)
--   music           → mock, inactive  (silent pilot per §2.2)
--   sfx             → mock, inactive  (silent pilot)
--   publish         → mock          (real YouTube wired last, step 17)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_assignments (
  contract              text PRIMARY KEY,
  active_provider_id    text NOT NULL,
  fallback_provider_id  text NULL,
  is_active             boolean NOT NULL DEFAULT true,
  updated_by            uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  notes                 text NULL,
  CONSTRAINT provider_assignments_contract_check CHECK (
    contract IN ('image', 'video', 'character_video', 'music', 'sfx', 'storage', 'publish')
  )
);

COMMENT ON TABLE public.provider_assignments IS
  'Global-tier provider selection per contract. Per-stage overrides will live in stage_provider_overrides (later migration).';

-- Seed: only image goes real; everything else stays on mock for first-call MVP.
INSERT INTO public.provider_assignments (contract, active_provider_id, is_active, notes)
VALUES
  ('image',           'gpt-image-1',  true,  'Phase 8 MVP: real OpenAI Images API. Reuses OPENAI_API_KEY.'),
  ('video',           'mock',         true,  'Wires to veo-3 in Phase 8 step 13.'),
  ('character_video', 'mock',         true,  'Wires to veo-3-img2vid in Phase 8 step 13.'),
  ('storage',         'mock',         true,  'Wires to drive_native in Phase 8 step 10.'),
  ('music',           'mock',         false, 'Silent pilot — activate via UI when ready.'),
  ('sfx',             'mock',         false, 'Silent pilot — activate via UI when ready.'),
  ('publish',         'mock',         true,  'Wires to youtube_data_api in Phase 8 step 17.')
ON CONFLICT (contract) DO NOTHING;

-- RLS: read open to authenticated, writes restricted via API layer (requireDirector).
ALTER TABLE public.provider_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_assignments_read_authenticated"
  ON public.provider_assignments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "provider_assignments_write_service_role"
  ON public.provider_assignments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
