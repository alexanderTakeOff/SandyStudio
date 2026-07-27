---
name: overlay_agent_reports_on_server_logs
description: "ALWAYS cross-check subagent (and your own code-reading) conclusions against the live SERVER LOGS. Subagents aren't smarter — they just have cleaner context. Runtime truth beats static analysis."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ad2d9be0-dd02-4fef-81e2-cf9f1e0e28ab
---

# Always overlay agent reports onto the server logs

**Rule (Director, 2026-07-11 — E27):** «отчёт агентов всегда накладывай на логи сервера. субагенты не умнее тебя, может только сессия у них почище.»

A subagent's report — and your OWN static code-reading — is a HYPOTHESIS, not ground
truth. Before acting on it, verify against the live runtime: **server/prod logs, inngest
logs, DB state, actual jobs/events**. Subagents are not smarter than you; they just run in
a cleaner context. Their conclusions can be confidently wrong.

**Why (the E27 case that established this):** the code-reviewer subagent concluded
`factory.ts:788-835` `isPlanCritic` "already does Mode 2/3 auto-promote" — correct that the
CODE exists, so I discarded my (redundant) fix. But the actual bug was that this code was
**broken at runtime**: `step.sendEvent` was nested inside `step.run('plan-critic-autofire')`,
which Inngest rejects (`NESTING_STEPS` — 72 warnings in the prod log). The plan flipped
APPROVED but the artist event was silently dropped → 26 approved plans, 0 images. The
SERVER LOG revealed in one grep what neither the reviewer's nor my static reading caught.
Earlier the same run, a throughput agent's "restart was one-time / not the cause" was also
only trustable BECAUSE it was grounded in the inngest log timestamps.

**How to apply:**
- Treat every subagent finding + every "the code says X so it works" as unverified until
  the runtime confirms it. Grep the prod log (`scratchpad/prod*.log`), the inngest log
  (`scratchpad/inngest.log`), and the DB for the actual behaviour.
- When a report says a mechanism "works/handles X", find the log line that PROVES it fired
  and produced the effect — not just that the code path exists.
- Runtime evidence (logs, jobs, events, assets) OVERRIDES static analysis. If they
  disagree, the logs win; re-open the investigation.
- Relatedly, provider/agent stalls surface in the server log FIRST — read logs before
  theorising ([[provider_fetch_no_timeout_root_cause]], [[verify_real_results_not_logs]]).
