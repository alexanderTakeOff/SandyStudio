# Visual progress during agent runs — sprint candidate

**Filed:** 2026-05-15 (during q1 auto-react sprint)
**Source:** Director observation during E21 σ.1 γ-validation

## Problem

Director repeatedly reports that after a gate transitions and the next agent starts (orange dot on the agent card), there's no visible signal that the agent is actually doing work. Activity feed shows nothing between `agent_started` and `agent_completed`. From the Director's POV:

> "Я вижу что артист вроде бы как работает но Activity показывают что ничего... для меня это раздражитель. Потому что я не понимаю действительно работает то ли это просто какой-то статус поменялся."

This has come up multiple times.

## What we have now

- `activity_events` table only emits at boundary moments: `agent_started`, `agent_completed`, `agent_failed`.
- The orange dot is a status indicator on the agent card — it tells you the agent is in `RUNNING` state but not what it's doing.
- For long-running agents (Sonnet 4.6 STB = 60-300s, Veo = 30-90s, Suno = 60-180s, Anthropic image gen = 10-30s) this leaves a "dead zone" 1-5 minutes long.

## Sprint candidate — visible progress signal

Three options of increasing complexity:

### A. Heartbeat events (smallest)
Inngest function emits `agent_progress` activity_events every 5-10s while running. Content: "EXEC-SB · waiting on Anthropic", "EXEC-VGEN · queueing shot 3/22", etc. Frontend already renders activity_events — bubble shape can be smaller / muted for `agent_progress` severity.

Cost: ~30 extra rows per agent run. Cheap.
Effort: ~2-3h. Each runner needs a heartbeat emitter.

### B. Streaming token counter (mid)
For Anthropic / OpenAI calls, the runner reads chunks (we use `stream:false` today). Switching to streaming gives a live token count we can echo as "EXEC-SB · 4823 tokens written" updating every couple of seconds.

Cost: refactor each runner. ~4-6h. Cancellation gets more complex.
Effort: medium.

### C. Per-shot card updates (UX-led, biggest)
For multi-shot fan-out (EXEC-VGEN × 22 shots), show a card with 22 mini-tiles, each filling green as the shot completes. Same for STITCH, music, animatic.

Cost: new UI components per agent type.
Effort: ~1-2 days for the agent types where it matters most (VGEN, STITCH).

## Recommendation

Start with **A** when this sprint comes up — it solves the "is anything happening?" problem for $30 of effort. **B** + **C** layer on top if A isn't enough signal.

## Linked
- This memo: `~/.claude/projects/C--SandyStudio/memory/visual_progress_during_agent_run_sprint_candidate.md`
- Original raised: 2026-05-15 chat during q1 auto-react implementation.
