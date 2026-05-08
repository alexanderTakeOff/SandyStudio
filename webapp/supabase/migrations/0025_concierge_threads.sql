-- ──────────────────────────────────────────────────────────────────────────────
-- 0025_concierge_threads.sql
-- Long-term memory for the Studio Concierge / Prod Assistant.
--
-- Per ~/.claude/plans/valiant-soaring-karp.md (Mode 2.5 Phase 1 — approved
-- 2026-05-08): two tables that capture every conversation turn so we can
-- (a) restore Director's history across browser sessions and
-- (b) feed future Skill Editor / Learning Loop with structured signal.
--
-- Critical design rule from the approved plan:
--   event_type enum is defined upfront with ALL values needed by future
--   Path A (Skill Editor + Learning Loop), even though Phase 1 only writes
--   'message', 'tool_call', 'tool_result'. This guarantees Path A → no
--   schema migration when Skill Editor ships.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.concierge_threads (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  director_id  uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  episode_id   uuid        REFERENCES public.episodes(id) ON DELETE SET NULL,
  -- Snapshot of governance mode at thread start. Mode may change mid-thread;
  -- per-turn metadata can override this when the Skill Editor needs it.
  active_mode  text,
  -- Snapshot of the active pipeline gate (e.g. 'BRIEF', 'SCRIPT_REVIEW',
  -- 'STB_ACT1') — NULL when the conversation is not episode-scoped.
  active_gate  text,
  title        text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz,
  CONSTRAINT concierge_threads_mode_valid CHECK (
    active_mode IS NULL OR active_mode IN ('1','2','2.5','3','4')
  )
);

CREATE INDEX concierge_threads_director_started_idx
  ON public.concierge_threads (director_id, started_at DESC);
CREATE INDEX concierge_threads_episode_started_idx
  ON public.concierge_threads (episode_id, started_at DESC)
  WHERE episode_id IS NOT NULL;

-- One row per conversation turn. Reified turns (not a JSON blob) so the
-- Skill Editor can index, filter, and aggregate.
CREATE TABLE public.concierge_turns (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid        NOT NULL REFERENCES public.concierge_threads(id) ON DELETE CASCADE,
  -- Conversation role. 'tool' covers both tool_call and tool_result rows;
  -- event_type narrows it further.
  role        text        NOT NULL,
  event_type  text        NOT NULL,
  content     text        NOT NULL DEFAULT '',
  -- Free-form structured payload. Phase 1 writes empty {}; Path A writes
  -- { rule_candidate_id, confidence, sentiment, ... }.
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  token_count integer,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT concierge_turns_role_valid CHECK (
    role IN ('director','assistant','tool','system')
  ),

  -- ALL event types defined upfront. Phase 1 uses only the first three;
  -- the rest exist so Path A can begin writing them without a migration.
  CONSTRAINT concierge_turns_event_type_valid CHECK (
    event_type IN (
      -- Phase 1 (Mode 2.5 MVP — written from day one) ──
      'message',          -- plain text turn (director or assistant)
      'tool_call',        -- assistant invoked a tool (metadata.tool_name, args)
      'tool_result',      -- tool response (metadata.tool_name, result)
      -- Path A (Skill Editor / Learning Loop — reserved, not yet emitted) ──
      'gate_proposal',    -- assistant proposed advancing to next pipeline gate
      'feedback',         -- director gave feedback on a gate output
      'approval',         -- director approved a gate output
      'rejection',        -- director rejected a gate output
      'rule_proposal',    -- assistant proposed a reusable rule candidate
      'rule_approved',    -- director approved a rule candidate
      'rule_rejected'     -- director rejected a rule candidate
    )
  )
);

CREATE INDEX concierge_turns_thread_created_idx
  ON public.concierge_turns (thread_id, created_at ASC);
CREATE INDEX concierge_turns_event_type_idx
  ON public.concierge_turns (event_type, created_at DESC);

-- RLS — Director-only (single principal model per auth.md §1).
ALTER TABLE public.concierge_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_turns   ENABLE ROW LEVEL SECURITY;

CREATE POLICY director_all ON public.concierge_threads
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY director_all ON public.concierge_turns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Convenience view: latest turn per thread, for thread-list rendering.
CREATE OR REPLACE VIEW public.concierge_threads_with_latest AS
SELECT
  t.id,
  t.director_id,
  t.episode_id,
  t.active_mode,
  t.active_gate,
  t.title,
  t.started_at,
  t.ended_at,
  (
    SELECT created_at FROM public.concierge_turns
    WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1
  ) AS last_turn_at,
  (
    SELECT count(*) FROM public.concierge_turns
    WHERE thread_id = t.id
  ) AS turn_count
FROM public.concierge_threads t;
