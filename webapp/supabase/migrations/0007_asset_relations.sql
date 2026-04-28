-- ──────────────────────────────────────────────────────────────────────────────
-- 0007_asset_relations.sql
-- Per uiux.md §17 — prepares the data model for the v2 Interactive Asset Galaxy.
-- Not consumed by any UI in Sprint 9; included now to keep the schema forward-compatible.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.asset_relations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_asset_id uuid        NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  target_asset_id uuid        NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  relation_type   text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Allowed relation types per uiux.md §17.
  CONSTRAINT asset_relations_type_valid CHECK (
    relation_type IN ('derives_from','depends_on','replaces','references','version_of','blocks','unblocks')
  ),
  -- Self-loops are meaningless.
  CONSTRAINT asset_relations_no_self_loop CHECK (source_asset_id <> target_asset_id),
  -- One relation type between two assets is enough; prevents duplicate edges.
  CONSTRAINT asset_relations_unique UNIQUE (source_asset_id, target_asset_id, relation_type)
);

CREATE INDEX asset_relations_source_idx ON public.asset_relations (source_asset_id);
CREATE INDEX asset_relations_target_idx ON public.asset_relations (target_asset_id);

-- RLS — same model as the rest of the schema.
ALTER TABLE public.asset_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY director_all ON public.asset_relations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
