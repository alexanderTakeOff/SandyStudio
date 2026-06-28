-- ──────────────────────────────────────────────────────────────────────────────
-- 0039_dispatch_intent.sql
-- S2 leak-closing / P2 (plan: calm-percolating-sifakis.md) — race-free dispatch
-- claim that closes the double-fire / wasted-render class.
--
-- Problem this fixes:
--   factory.ts Step 0b ("eref-inflight-dedup-check") guards a SECOND concurrent
--   run of the SAME agent for the SAME shot by READING jobs in ('QUEUED','RUNNING')
--   and matching the shot. That read-then-check is a TOCTOU race: two dispatches
--   for the same shot (E07 ×2, E12 SH10 — bare "SH10" racing a canonical
--   "A2-SC06-SH10") both read "nothing in flight", both pass, both render → a
--   double image bill (~$1.21 each leak) and a duplicate fan-out.
--
-- The cure is an ATOMIC test-and-set. A dedicated tiny table carries a UNIQUE
-- (episode_id, shot_id, agent_id) claim. The jobs table cannot carry this
-- constraint: it legitimately holds many rows per (episode,agent) across versions
-- and transient retries, and a hard unique there would block legitimate recovery.
--
-- Key choice (deviates from the plan's literal 4-col key on purpose):
--   the UNIQUE is (episode_id, shot_id, agent_id) WITHOUT input_hash. The live
--   Step 0b blocks a second concurrent run REGARDLESS of input — putting
--   input_hash in the key would let two same-shot dispatches with slightly
--   different payloads BOTH claim and re-open the exact E12 SH10 double-render.
--   input_hash is kept as a column (waste-ledger / future measurement signal),
--   not part of uniqueness.
--
-- Status lifecycle: claimed → running → done | failed. A TERMINAL row (done/
-- failed) may be RE-CLAIMED — that is how a SEQUENTIAL regen of the same shot
-- still works (matches Step 0b's "prior job no longer QUEUED/RUNNING" semantics).
-- An IN-FLIGHT row (claimed/running) blocks the duplicate and bumps blocked_count
-- (the dup-waste signal the plan's measurement system (A) wants).
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.dispatch_intent (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id      uuid        NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  -- Empty string (not NULL) so the UNIQUE works plainly; only shot-scoped agents
  -- are routed through this, so '' rows are not created by the current wiring.
  shot_id         text        NOT NULL DEFAULT '',
  agent_id        text        NOT NULL,
  -- Stable hash of the dispatch's identifying payload. Audit / waste-ledger only;
  -- NOT part of the unique key (see header).
  input_hash      text        NOT NULL DEFAULT '',
  status          text        NOT NULL DEFAULT 'claimed'
                              CHECK (status IN ('claimed','running','done','failed')),
  inngest_run_id  text,
  -- How many duplicate dispatches this claim has blocked while in flight.
  blocked_count   integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX dispatch_intent_key_uniq
  ON public.dispatch_intent (episode_id, shot_id, agent_id);

CREATE INDEX dispatch_intent_episode_idx
  ON public.dispatch_intent (episode_id, created_at DESC);

-- Service-role only (Inngest functions use the service-role client, which
-- bypasses RLS). Enable RLS with no authenticated policy → locked to service-role.
ALTER TABLE public.dispatch_intent ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_intent TO service_role;

COMMENT ON TABLE public.dispatch_intent IS
  'Race-free per-shot dispatch claim (S2/P2). UNIQUE (episode_id, shot_id, agent_id). '
  'A claimed/running row blocks a concurrent duplicate dispatch; a done/failed row may be '
  're-claimed for a sequential regen. blocked_count = dup-waste signal.';

-- ── Atomic claim ────────────────────────────────────────────────────────────
-- Returns exactly one row:
--   claimed=true  → caller holds the claim (fresh insert OR re-claim of a terminal
--                   row) → proceed to render.
--   claimed=false → an in-flight claim already exists → caller MUST skip (this is
--                   the duplicate dispatch being blocked); blocking_run_id/status
--                   describe the holder, and its blocked_count was incremented.
--
-- The INSERT ... ON CONFLICT DO UPDATE ... WHERE status IN ('done','failed') is a
-- single statement: the row lock serialises concurrent callers, and a conflict on
-- an in-flight row updates nothing / returns nothing (no error), giving a clean
-- atomic claim-or-block with no lost-update window.
CREATE OR REPLACE FUNCTION public.claim_dispatch_intent(
  p_episode uuid,
  p_shot    text,
  p_agent   text,
  p_hash    text,
  p_run     text
)
RETURNS TABLE (
  claimed         boolean,
  blocking_run_id text,
  blocking_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shot text := coalesce(p_shot, '');
  v_claimed_id uuid;
  v_block record;
BEGIN
  INSERT INTO public.dispatch_intent (episode_id, shot_id, agent_id, input_hash, status, inngest_run_id)
  VALUES (p_episode, v_shot, p_agent, coalesce(p_hash, ''), 'claimed', p_run)
  ON CONFLICT (episode_id, shot_id, agent_id) DO UPDATE
    SET status         = 'claimed',
        input_hash     = excluded.input_hash,
        inngest_run_id = excluded.inngest_run_id,
        blocked_count  = 0,
        updated_at     = now()
    WHERE public.dispatch_intent.status IN ('done','failed')
  RETURNING id INTO v_claimed_id;

  IF v_claimed_id IS NOT NULL THEN
    claimed := true;
    blocking_run_id := null;
    blocking_status := null;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Conflict on an in-flight row → blocked. Record the dup-waste and report holder.
  UPDATE public.dispatch_intent
     SET blocked_count = blocked_count + 1,
         updated_at    = now()
   WHERE episode_id = p_episode AND shot_id = v_shot AND agent_id = p_agent
  RETURNING inngest_run_id, status INTO v_block;

  claimed := false;
  blocking_run_id := v_block.inngest_run_id;
  blocking_status := v_block.status;
  RETURN NEXT;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_dispatch_intent(uuid, text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.claim_dispatch_intent(uuid, text, text, text, text) IS
  'Atomic per-shot dispatch claim (S2/P2). claimed=true → proceed; claimed=false → '
  'an in-flight claim blocks this duplicate (blocked_count bumped). Terminal rows are re-claimable.';
