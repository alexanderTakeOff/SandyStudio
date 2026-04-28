-- ──────────────────────────────────────────────────────────────────────────────
-- 0004_hybrid_sync_tables.sql
-- Hybrid-sync mirror tables per webapp.md §11 W-001 + W-004.
-- Source of truth lives in the repo (agents/*.md, config/defaults.yaml).
-- These tables are the deploy-side mirror used by the runtime + UI for hot-edit.
-- "promote to repo" action is a separate UI flow (Phase 6 Settings).
-- ──────────────────────────────────────────────────────────────────────────────


-- ─── agent_prompts (W-001) ───────────────────────────────────────────────────
-- Mirror of agents/<level>/<name>.md. Synced on deploy from repo.
-- UI Settings can hot-edit (writes here only); persistence across redeploy
-- requires a PR back to the .md file in the repo.
CREATE TABLE public.agent_prompts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    text UNIQUE NOT NULL,                       -- e.g. 'EXEC-SW'
  source_path text NOT NULL,                              -- e.g. 'agents/exec/screenwriter.md'
  prompt_md   text NOT NULL,                              -- full system prompt body
  version     integer NOT NULL DEFAULT 1 CHECK (version > 0),
  source      text NOT NULL DEFAULT 'repo'
              CHECK (source IN ('repo','ui_edit')),       -- divergence from filesystem indicator
  synced_at   timestamptz NOT NULL DEFAULT now()
);


-- ─── app_config (W-004) ──────────────────────────────────────────────────────
-- Mirror of config/defaults.yaml. Same hybrid pattern as agent_prompts.
-- One row per (scope, key); value is jsonb so nested config is supported without
-- proliferating columns.
CREATE TABLE public.app_config (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope     text NOT NULL
            CHECK (scope IN ('production','visual','audio','seo','analytics','finance','providers','narrative','characters','world','naming','app')),
  key       text NOT NULL,
  value     jsonb NOT NULL,
  source    text NOT NULL DEFAULT 'repo'
            CHECK (source IN ('repo','ui_edit')),
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_config_unique UNIQUE (scope, key)
);
