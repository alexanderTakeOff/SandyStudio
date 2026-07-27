---
name: session_2026-06-28_s2-leak-closing
description: "Session 2026-06-28 — S2(a)+(b) leak-closing shipped (dispatch_intent + billing-escalate); S3 next, design fork open."
metadata: 
  node_type: memory
  type: project
  originSessionId: da204751-9709-4f22-9bb7-9d3ab3ef80d3
---

# Session 2026-06-28 — S2 leak-closing (a+b shipped)

**Phase:** AI-factory autonomy+cost → Mode 3. Drove S2 after `/resume` of the
2026-06-27 aifactory session. Director: «погнали, иди до конца фазы».

## What landed (master, LOCAL — not pushed)
- **S2(a) `862acc8`** — atomic `dispatch_intent` claim closes the per-shot
  double-fire leak. migration 0039: table `UNIQUE(episode_id,shot_id,agent_id)`
  + RPC `claim_dispatch_intent` (INSERT…ON CONFLICT, terminal-status→re-claim so
  sequential regen lives). Replaced the racy factory.ts Step 0b
  («eref-inflight-dedup-check», TOCTOU). `input_hash` = ledger column, NOT in the
  unique key (in the key it would re-open E12 SH10). Deleted the superseded
  `findInFlightShotDuplicate` + its tests. helper `lib/agents/dispatch-intent.ts`.
- **S2(b) `df53433`** — billing failure escalates to Director, does NOT loop
  Polина. `lib/agents/provider-failure.ts` classifies persistent-billing vs
  transient (fal+OpenAI+Anthropic text-sig, reuses isFalBalanceLock). factory
  catch tags `agent_failed` with `metadata.auto_react=false` + «⛔ Provider out of
  funds» title; `logEvent` skips the `pa/notify-needed` wake for that flag
  (mirrors the 2026-06-25 `isSelfCausedNotify` loop-breaker). The cross-wake
  billing spiral (the ~$100/day vector) is broken; within-wake was already
  SPIN-guarded.
- **S3-measurement `c8d412c`** (Director q2a) — decideGate choke-point +
  gate_decision_log. `lib/agents/gate-decision.ts`: build-exhaustive GATE_CLASS
  Record<AgentId> (mechanical/creative/hard_limit) + pure decideGate
  (behaviour-preserving: autonomous=Mode4) + recordGateDecision writer. migration
  0040 gate_decision_log (writer-columns only). factory's 2 governance_mode===4
  reads (autoApprove/autoChain) route through decideGate + 1 log row/run. The 6
  next-events `AUTOTEST` forks were NOT collapsed — deferred to S6/S7 (anti-additive,
  seam not load-bearing). Human-action ground truth stays in activity_events.
- **PLAN.md** `ae87ed4`,`e8e2cc3`,`cf4137d` (master-only) + plan artifact updated.

## Verify (each slice)
S2: tsc·0 / vitest 1030 / replay·30. **S3: tsc·0 / vitest 1040 (+10) / replay·30**
(Mode-4 unchanged + Mode 1-3 next-events tests intact → human path preserved).

## Key decisions / deviations
- **dispatch_intent unique key = (episode,shot,agent), NOT the plan's literal
  4-col with input_hash.** Including input_hash would re-open the E12 SH10
  double-render (the live guard blocks a 2nd concurrent run of the same shot
  regardless of input). input_hash kept as a ledger column. Stated in the
  migration header + commit.
- **S2(c) (FAILED transient-vs-persistent in caps) — NOT done, subsumed by (b).**
  (b) already stops the auto-react re-fire + escalates; the Director (the only
  non-auto re-fire path) is never capped. Optional follow-up only if a
  non-billing persistent-fail re-fire path surfaces.

## Open / next
- **RESIDUAL (flagged, not silently capped):** the batch-stall watchdog can still
  nudge Polина 1×/interval on a billing-halted episode — SPIN-bounded (not a tight
  loop). Full close also gates the watchdog on billing-halt. Deferred — Director's
  eye on the $100 subsystem.
- **S3 `decideGate()` is next.** Surface: 6× `directorUserId==='AUTOTEST'` in
  `lib/agents/next-events.ts` + 2× `governance_mode===4` in `lib/agents/factory.ts`
  (513 autoApprove, 713/720 autoChain). Mode-4 path is replay-covered; **Mode 1-3
  human path is NOT replay-covered** (only ~21 next-events unit assertions, incl.
  one explicit non-AUTOTEST). **DESIGN FORK OPEN (q2):** (a) measurement-first —
  land `gate_decision_log` + a writer at the factory choke-point (gives E13 the
  gate-taxonomy data), defer the 6 next-events fork-collapse to S6/S7 when the seam
  is load-bearing [my recommendation, anti-additive]; (b) full behaviour-preserving
  collapse now per the plan literal. Director "б" earlier = table lands WITH its
  writer in S3 (no dead schema) — satisfied by either if the writer ships.
- After S3: watchdog-residual full-close · S-reorder (pilot-first ref/video) · E13
  live calibration run (tripwires: casting-not-skipped, canon-preflight-fires,
  S-E-SH numbering on a real model, 4-touch gate map).

## Env / notes
- Mode ===5=== EDIT. Polина live: gemini-free ($0), Opus ready, MAX_CALLS=40.
- Commits LOCAL on master (not pushed). HEAD `e8e2cc3`.
- mock-supabase gained: `dispatch_intent` table + `claim_dispatch_intent` rpc +
  chainable `update().eq().eq()` + `insert().select().maybeSingle()`.
