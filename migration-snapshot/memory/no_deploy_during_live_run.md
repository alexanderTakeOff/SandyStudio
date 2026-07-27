---
name: no_deploy_during_live_run
description: "During a live episode run/fanout — push & merge only, NEVER deploy or restart the server without Director's OK and only when no processes are running."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ad2d9be0-dd02-4fef-81e2-cf9f1e0e28ab
---

# No deploy / server restart during a live run

**Rule (Director, 2026-07-11 — E27 «Эскалатор» smoke):**

During an ACTIVE episode run (fanout / any in-flight agent jobs):
- **Push and merge freely** — landing fixes on master is fine.
- **Do NOT deploy or restart the server.** Deploy/rebuild/`next start` restart happens
  **only with the Director's explicit approval** AND **only at a moment with no running
  processes** (no live fanout, no RUNNING/QUEUED jobs).

**Why:** restarting the prod app (:3000) mid-fanout kills the in-flight inngest→app
step calls — the inngest dev server gets `connection refused` / «existing connection
forcibly closed» POSTing to `/api/inngest`, so in-flight agents (e.g. EXEC-EPREV critics)
error out and the run stalls. On E27 I rebuilt+restarted for a D2/D3 deploy while the
reference fanout was live (06:53 UTC log) → the designer→critic chain stalled for the
tail shots. This compounds the already-fragile dev-inngest behaviour
([[inngest_dev_router_unreliable_no_selfheal]], [[eref_generation_needs_stable_server]]).

**How to apply:** before ANY deploy/restart, check for a live run (RUNNING/QUEUED jobs,
active fanout, `designer_fanout_pending`). If a run is live → land the fix (push+merge)
but **defer the deploy** and ask the Director for a quiet window. Never assume a restart
is harmless mid-run.
