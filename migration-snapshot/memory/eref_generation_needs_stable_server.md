---
name: eref-generation-needs-stable-server
description: EREF/image generation takes ~6 min per frame; turbopack dev + inngest-cli churn interrupts it → use a stable production server (next build+start) for pipeline runs
metadata: 
  node_type: memory
  type: project
  originSessionId: 7d820433-a44e-4fe6-a209-ab31110dc060
---

EREF image generation (EXEC-EREF `execute-from-plan`, gpt-image-2 multi-ref) takes **~6 MINUTES per frame** end-to-end (SH03 ran 11:03:28→11:09:37 = 6m9s). The provider call itself is fine (direct gpt-image-2 1024×1536 → HTTP 200), the wall-clock is just long.

**Why frames "never generated" in dev (2026-06-09 day-long debug):** the `next dev --turbopack` + `inngest-cli dev` stack has a **continuous `PUT /api/inngest` re-sync churn** that re-registers functions and **interrupts in-flight Inngest functions before they finish**. A 6-minute generation never survives to completion → artist "started" repeatedly (10:46, 10:52, 11:03…) but never "completed", produced no IMG, left plan DRAFT. Restarting next-dev mid-run (for code edits) compounds it — each restart kills in-flight functions. This masquerades as "update doesn't persist" / "artist produces no IMG" / "environment wall".

**Why:** dev-mode HMR + Turbopack recompilation churn is fundamentally hostile to long-running (minutes) Inngest steps. Confirmed: the SAME code, SAME event, on a **stable `next start`** completed cleanly and produced the APPROVED frame.

**How to apply — for ANY pipeline work with long generations (EREF/VGEN/animatic/stitch):**
1. Stop all preview/dev servers (`preview_stop`); kill stray node on 3000/8288/50052/50053.
2. `cd webapp; npx next build --no-lint` (the repo has 2 pre-existing ESLint *errors* — `any` in approve/route.ts:615, unescaped `'` in VGENPilotPillbar.tsx:315 — that fail strict `next build`; `--no-lint` skips them; tsc is already green so code is safe).
3. `npm start` (next start, port 3000, stable — no HMR churn) + `npm run inngest:dev` (8288) in background.
4. Warm `curl -X PUT localhost:3000/api/inngest` (registers functions; expect `function_count: N`).
5. Fire events; **wait the full ~6 min/frame** — don't assume failure from short (150s) monitors. Check the Inngest run status directly: `curl localhost:8288/v1/events/<eventId>/runs` → `status:"Completed"` + `output.assetId`.
6. **Do NOT edit code / restart the server mid-generation** — a rebuild+restart kills all in-flight functions. Batch code changes, rebuild once, then run.

Links: [[verify_real_results_not_logs]] (the 150s monitors lied — the real signal was the Inngest run output), [[backlog_observability_failures_not_surfaced]] (artist interruption surfaced to nobody), [[dev_workflow_no_build_during_dev]] (never `next build` while turbopack dev is up — stop it first).
