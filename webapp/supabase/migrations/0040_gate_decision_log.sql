-- ──────────────────────────────────────────────────────────────────────────────
-- 0040_gate_decision_log.sql
-- S3 / P1 measurement — one row per autonomy-gate decision, so the E13 live run
-- MEASURES the real gate taxonomy (plan control-point #1: decided_by +
-- human_required + which gate). Director decision "б": the table lands WITH its
-- writer (factory choke-point), never an empty/dead prod schema.
--
-- Scope note (measurement-first, q2a 2026-06-28): only the columns the factory
-- writer populates TODAY exist here. The shadow-junior / cost / latency / regen
-- columns from the full plan land WITH their own writers (S6+) — no dead schema.
-- The HUMAN-intervention ground truth is already in activity_events
-- (approval_granted etc.); the E13 analysis JOINs the two, so this table does not
-- duplicate it — it records what the FACTORY decided (incl. "require_human").
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.gate_decision_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id       uuid        NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  -- Shot-scoped gates carry the canonical S-E-SH id; episode-level gates leave it null.
  shot_id          text,
  -- The agent whose run produced this gate decision.
  gate             text        NOT NULL,
  -- Initial taxonomy (tunable): mechanical (rule-based, future auto-pass candidate),
  -- creative (needs human taste), hard_limit (Director-always: publish/LOCKED/budget).
  gate_class       text        NOT NULL CHECK (gate_class IN ('mechanical','creative','hard_limit')),
  governance_mode  integer,
  -- Did the factory advance autonomously (Mode 4) or is a human required (Mode 1-3)?
  autonomous       boolean     NOT NULL,
  decision         text        NOT NULL CHECK (decision IN ('advance','require_human')),
  decided_by       text        NOT NULL CHECK (decided_by IN ('factory','human')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gate_decision_log_episode_idx
  ON public.gate_decision_log (episode_id, created_at DESC);

ALTER TABLE public.gate_decision_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.gate_decision_log TO service_role;

COMMENT ON TABLE public.gate_decision_log IS
  'S3/P1 measurement — one row per autonomy-gate decision (factory choke-point). '
  'gate=agent_id, gate_class taxonomy, autonomous/decision/decided_by. Human-action '
  'ground truth lives in activity_events; E13 analysis joins the two.';
