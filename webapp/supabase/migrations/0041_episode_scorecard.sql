-- ──────────────────────────────────────────────────────────────────────────────
-- 0041_episode_scorecard.sql
-- Episode Autonomy Scorecard SSOT — one row per compute event (append-only);
-- the latest row per episode = current. The REV-scorecard .md asset is a RENDER
-- of the latest row, never parsed back.
--
-- The factory question is not "did the episode ship?" but "how much of it moved
-- ITSELF (code) vs needed an intelligent agent (human OR AI-EP) to push?". Every
-- intelligent touch is cost (human = Director time, AI-EP = Opus tokens), so both
-- are driven toward zero by transferring muscle to code.
--
-- Lands WITH its writer (lib/agents/scorecard/*), never dead schema (0040 precedent).
-- Derived read-only from jobs + activity_events + gate_decision_log + STB shot
-- count. Typed columns = headline KPIs (trendable); jsonb metrics = catch-all so
-- new metrics never need a migration.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.episode_scorecard (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id                uuid        NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  series_id                 uuid        REFERENCES public.series(id) ON DELETE CASCADE,
  -- snapshot (first final cut) → published → analytics (audience metrics later).
  phase                     text        NOT NULL CHECK (phase IN ('snapshot','published','analytics')),

  -- Denominator (canonical SSOT shot count, excl. deleted/excluded).
  shot_count                integer     NOT NULL,

  -- KPI-1 : machine churn (self-moving ~1-2).
  total_agent_runs          integer     NOT NULL,
  kpi1_runs_per_shot        numeric     NOT NULL,

  -- KPI-2 : code-able intelligent touches (cost to reduce → transfer to code).
  codeable_touches_total    integer     NOT NULL,
  codeable_touches_human    integer     NOT NULL,   -- Director time
  codeable_touches_ai_ep    integer     NOT NULL,   -- AI-EP (exec-dir-ai) Opus tokens

  -- Autonomy ledger : chain_fired / total_advances = Autonomy%.
  chain_fired_advances      integer     NOT NULL,
  total_advances            integer     NOT NULL,

  -- Floor : creative-gate approvals — judgement, not waste (tracked, not minimised).
  approvals_creative_human  integer     NOT NULL,
  approvals_creative_ai     integer     NOT NULL,

  -- Reliability / churn / latency.
  agent_failures            integer     NOT NULL,
  churn_refires             integer     NOT NULL,
  stuck_shots_final         integer     NOT NULL,
  latency_first_final_cut_s bigint,                 -- null until a final cut exists

  runs_by_stage             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  failures_by_stage         jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Catch-all: autonomy_pct, manual/mechanical splits, gate autonomy, per-stage
  -- runs/shot, churn coverage, source flags. New metrics land here NO migration.
  metrics                   jsonb       NOT NULL DEFAULT '{}'::jsonb,

  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX episode_scorecard_episode_idx
  ON public.episode_scorecard (episode_id, created_at DESC);

ALTER TABLE public.episode_scorecard ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.episode_scorecard TO service_role;

COMMENT ON TABLE public.episode_scorecard IS
  'Per-episode Autonomy Scorecard SSOT (append-only, latest row per episode = current). '
  'KPI-1 agent-runs-per-shot (self-moving ~1-2), KPI-2 code-able intelligent touches '
  '(human + AI-EP, both cost → transfer to code). Derived read-only from jobs + '
  'activity_events + gate_decision_log + STB shot count. The REV-scorecard .md asset '
  'renders the latest row, never parsed back.';
