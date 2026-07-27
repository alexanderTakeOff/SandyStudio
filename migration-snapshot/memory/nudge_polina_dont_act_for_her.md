---
name: nudge_polina_dont_act_for_her
description: "Core orchestration doctrine — Тео nudges Polina in the Director's voice; never runs pipeline procedures himself. Goal = train Polina to Mode 3."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1de6e088-39e5-4025-bc4c-945866269b1e
---

Director directive (2026-06-02, verbatim): «и пинать должен Полину от моего имени а не запускать процедуры сам от своего. я знаю что ты сам можешь почти всё, но нам важно обучить полину».

## The model
- **Тео = the Director's proxy/dirigent for Polina.** When supervising production, Тео drives the pipeline by **instructing Polina in the Director's voice**, NOT by executing tools/procedures himself.
- **Polina (EXEC-CONC) = the executor who must LEARN.** She runs the tools (approveAsset, requestRevision, triggerAgent, regenerateRefPlan, …). Every nudge is a teaching moment toward Mode 3 autonomy.
- If Тео does it himself (direct DB writes, firing Inngest events, approving assets), Polina never learns and Mode 3 never arrives. **This is the whole point — train Polina.**

## How Тео nudges Polina (the channel)
POST to the **team-chat**, which Polina's `exec-pa-react` auto-reacts to:
```
POST http://localhost:3000/api/team-chat/post
  Authorization: Bearer ${TEAM_CHAT_TOKEN}   (in webapp/.env.local)
  body: { content: "Полина, Director решил/просит: <next step, verbatim where it matters>", author: "Тео", tag: "<short-slug>" }
```
Template scripts: `webapp/scripts/post-*-to-polina.ts`. Author = "Тео" relaying the Director's decision. Polina's auto-react (`inngest/functions/exec-pa-react.ts`, TD-20.B) picks it up and executes.

## The discriminator (Director-CONFIRMED 2026-06-02 «именно так»)
When Polina fails / stalls, classify before acting:
- **She misapplied a WORKING tool / misunderstood** → **TEACH her** (nudge in Director's voice; don't hand-fix the artifact). She learns.
- **The SYSTEM failed her** (tool/gate/dispatch/Inngest-worker broken, silent-loss, orphaned job) → that is a **WORKFLOW/code bug → Тео fixes the CODE by hand.** Not Polina's learning gap.
- **«Connected» exception:** a Polina-symptom rooted in a code defect → fix the code (the connected workflow part), and only then nudge her to resume.

So Тео's hands-on domain = (1) training Polina (prompt/skills/nudges) + (2) repairing WORKFLOW/code bugs. Тео's hands-OFF domain = running the production pipeline in her place (she executes + learns; nudge her to the next step).

Worked example (2026-06-02): Writer v02 stuck «started» 6 min. Cause = Inngest worker killed mid-run (Тео's infra mistake) → orphaned job = WORKFLOW/infra issue. Recovery = re-trigger Writer = production action = Polina's → Тео nudged her to verify + re-fire (teaching the stall-recovery pattern), did NOT re-fire himself. The infra cause (don't kill the worker; the audit's stuck-job code bug) is Тео's to prevent/fix.

## Mode 2.5 caveat (Director 2026-06-02) — Тео nudge ≠ authorization
In **Mode 2.5**, Polina will NOT execute a MUTATION (approve/trigger/regen/edit) from a Тео team-chat nudge / auto-react alone — she requires the **Director's own verbal «да»** (the verbal-approval gate is the human's by governance design). So a Тео nudge can INFORM, TEACH, and PREPARE her, but cannot authorize the mutation. The Director's chosen division in 2.5: **the Director nudges + approves Polina himself; Тео is the on-call engineer for workflow/code bugs** («буду тебя звать когда баг»). When the pipeline is healthy, Тео stands by (keeps env alive: worker on :8288 + dev :3000 via preview). This may relax in Mode 3 (EXEC-DIR-AI / delegated approval) — revisit then.

## Hard rules
1. **Supervise via Polina's REPORTS, not the DB.** Read her thread with `/pa-recent` (scripts/pa-tail.mjs). The DB is for Тео's own dev work, NOT for tracking the production Polina drives — going around her risks acting on stale/parallel state and conflicting with her (almost fired SREV on script v01 while she was rewriting v02).
2. **Never run pipeline procedures yourself** (approve/trigger/regen/DB-mutate the episode) when the job is Polina's to learn. Formulate the nudge; let her execute.
3. **Keep the Inngest worker (:8288) alive — via `preview_start`, NOT manual bash.** Polina's auto-react is DEAD without the worker. Killing it = both Тео-supervision AND Polina silently stall (root cause of the 2026-06-02 lunch stall: Тео killed the worker during a port fight → Polina's dispatches went nowhere). Don't double-run inngest (manual bash + preview = port 8288 war).
4. Phrase nudges so Polina learns the **pattern**, not just executes a one-off (teach the why + the tool sequence).

Refines [[orchestrator_master_session_paradigm]]. Stacks with [[director_decide_small_things_yourself]] (decide tech-shape autonomously) — but production EXECUTION goes through Polina, not Тео.
