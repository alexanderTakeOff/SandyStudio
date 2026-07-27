---
name: backlog-observability-failures-not-surfaced
description: "DEBT (Director 2026-06-03): provider/agent failures (e.g. Seedance fal 422 'image_url missing') reach NOBODY — not Polina, not Director. They land in the dev-server console only. Polina is supposed to pick up on running/failing processes but didn't. Build the failure→Polina→Director surfacing channel."
metadata: 
  node_type: memory
  type: project
  originSessionId: e48f29ce-04b7-43a0-8224-f06849b8e1e8
---

**Director directive 2026-06-03 (E02 video-gen session). «В долг запиши.»**

## The gap

A real production failure — Seedance/fal returned **HTTP 422 `image_url required`** (img2vid called with no input frame) for SH01/SH02 video gen — was invisible to both Polina (EXEC-CONC) AND the Director. Тео only found it by reading the dev-server `preview_logs`. The pipeline UI showed the shots as "Video Artist started … долго" (running), not failed.

The Director's point: **someone (Polina) should be watching running processes and surface failures.** She didn't.

## Why it happened (root, 2026-06-03)

1. **Failures go to the dev-server console, not `activity_events`.** Polina monitors `activity_events` (agent_started/completed/failed); a provider-level rejection inside the runner didn't emit a clear, immediate `agent_failed` event Polina could see.
2. **Inngest retries mask terminal failure.** The 422 step is retried (we saw many identical errors); until retries exhaust there is no terminal `agent_failed`, so from the pipeline's view the job is "running", not "failed" — exactly the "долго" the Director saw.
3. **Polina's proactive watchdog/timer was DEAD.** The `chat-internal` zod schema rejected `source:'timer'` → escalation-timer + orphaned-awaiting-sweep 400'd silently (fixed `182d60e`). So her proactive pickup of long-running/stalled/failing jobs was non-functional. Fixed now, but the failure→Polina channel itself is still thin.

## Fix direction (folds into the q21 readiness-preflight audit)

- **Emit a real `agent_failed` activity_event** (with the provider error message + shot id) on agent/provider failure — including a distinct "failing/retrying" signal BEFORE retries exhaust, so a job stuck in a retry loop is visible, not silently "running".
- **Polina proactive monitoring:** her watchdog should surface (a) failed jobs, (b) jobs running abnormally long / stuck in retry, to the Director with the reason — not wait to be asked. (Depends on the timer fix `182d60e` being live.)
- **Best of all — catch it BEFORE dispatch:** the readiness preflight (`validateShotReadyForGeneration`, q21) would have rejected SH01/SH02 with "media not loadable / no image_url" before ever calling fal, turning an opaque 422 + silent retry into a clear, surfaced "shot not ready: <reason>". This observability gap and the preflight are two halves of the same Rule-8 enforcement story.

## Same gap, live again — E11 billing hard limit (2026-06-21)

During the full E11 reference batch, 2 shots (`a2_sc10_sh01`, `a4_sc01_sh01`) failed
because the OpenAI image API hit **`billing_hard_limit_reached`** («Billing hard
limit has been reached», HTTP 400) + Polина's OpenAI calls 429'd («exceeded your
quota»). The REAL reason appeared **only in `tmp-devserver.err.log`** (`[eref]
provider openai-edits-multi failed … billing hard limit`). The JOB error surfaced
to the Director was the generic **«EXEC-EREF: No episode reference assets
inserted»** — no mention of billing. Director had to guess «может финансы кончились»
and Тео found the truth by grepping the console log. Exactly this note's gap.

**Concrete fix to add:** when a provider call fails, propagate the provider's
error `message`/`code` (e.g. `billing_hard_limit_reached`, `429 quota`,
`content_policy`) into the `agent_failed` activity_event + the job `error_message`,
so Director/Polина see «billing limit reached», not «no assets inserted». Billing/
quota errors especially should raise a loud, distinct signal (the whole pipeline
stalls on them).

## Cross-references

- CLAUDE.md §11 Rule 8 (Parameter Completeness At Gate) — the preflight side.
- [[nudge_polina_dont_act_for_her]] — Polina's monitoring/learning loop.
- Timer fix commit `182d60e` (chat-internal accepts `source:'timer'`) — prerequisite for her proactive watchdog.
- Part of the same 2026-06-03 anchor/video cascade that produced ~15 fixes; the Director's «не плодить сущности / minimal changes» + Rule-8 preflight are the systemic cures.
