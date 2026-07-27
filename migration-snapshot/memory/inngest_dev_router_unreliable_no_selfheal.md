---
name: inngest_dev_router_unreliable_no_selfheal
description: Local Inngest dev router drops burst tails + wedges concurrency lanes; pipeline has no reconciliation self-heal → shots strand silently.
metadata: 
  node_type: memory
  type: project
  originSessionId: 15eb3578-2d32-4541-bc5d-6013b2df8b99
---

Root-caused 2026-07-04/05 (E15 «критики не запускаются после дизайнеров»).

**Symptom:** during a fan-out, the local Inngest dev router (:8288) accepts events (HTTP 200) but silently fails to dispatch part of them — no job row, no activity. E15: designers finished all 26 shot-plans, but critics (EXEC-VPREV) ran for only ~SH01–10 then stopped dead; SH11–26 had zero critic job rows.

**Two failure modes of the dev router:**
1. Drops the TAIL of a large burst — processes first ~6 events, discards the rest; doesn't self-drain the queue.
2. Wedges a per-agent concurrency lane after ~6 runs — `exec-vprev` (cap 5, key=episodeId) stopped dispatching entirely (even a single event), while other lanes (VGEN, pa/notify) kept working. Likely ghost RUNNING leases from dropped runs. Symptom: endless `PUT /api/inngest 200` sync-loop.
   → clears only on a router restart.

**The real capability gap (ours, not the substrate):** the whole pipeline is fire-and-forget over event delivery with NO reconciliation. One dropped event = shot stranded forever. The reconciler exists (`lib/agents/reconcile.ts`, flag `MECHANICS_AUTO_ADVANCE`) but is inert AND only advances REVIEW cells — it does NOT gap-fill (fire critic for a plan-in-REVIEW-without-verdict, or VGEN for an APPROVED-plan-without-video), and has NO cron trigger + NO ingest pacing. Fix design + full evidence in session memo `session-data/2026-07-05-e15-inngest-router-rootcause-session.tmp`.

**Gotchas:** SDK `inngest.send()` from a standalone `tsx` script targets Inngest CLOUD (no NODE_ENV=development) → events vanish; use direct ingest `POST localhost:8288/e/dev` or force `INNGEST_DEV=1`. Do NOT hand-run a background re-drive loop against a wedged lane — it floods the Director's timeline with repeat launches (whack-a-mole, 2026-07-05 lesson) — see [[anti_additivity_principle]] / «вести≠чинить» [[autonomous_factory_architecture_doctrine]].
