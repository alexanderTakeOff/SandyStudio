# Session 2026-07-12 — Inngest Free-tier verify + Cloud-fit verdict

> Split session. The 9:16/Shorts-stitch task that also ran here is OWNED BY A
> PARALLEL TERMINAL — deliberately excluded from this note (Director:
> «save session but without shorts discussion»). Do NOT re-open it from here.

## What landed (investigation only — zero git-tracked changes)

Verified exact **current Inngest Free (Hobby) limits** (cross-checked pricing page
+ docs/usage-limits, 2026-07-11/12):

| Limit | Free/Hobby | Pro (first paid) |
|---|---|---|
| Executions/mo | **50 000** | 1M+ (~$75–99/mo), overage ~$50/1M |
| Concurrency | **5** (account-wide) | 100 (+$25/25) |
| Steps per run | 1000 max | — |
| Events/mo | 500 000 | 5M |
| Queue depth | 100 000 | 1M+ |
| History retention | **24h** | 7d |
| Overage | **none — PAUSES on exhaustion** | metered |

## Verdict — Cloud Free does NOT fit us; but it's moot

Two hard walls if we ever moved to Inngest **Cloud** Free:
1. **Concurrency = 5 account-wide.** Our `lib/inngest/concurrency.ts` sets 5 *per
   agent* (exec-sw/srev/sb/cread/eref-designer/eprev/vprev all =5). A single
   fan-out lane already eats the whole account budget → factory serialises.
   We literally raised `exec-eref-designer 3→5` last week (`4a36498`) — moving
   AWAY from the Free cap.
2. **"Execution" = one STEP** (durable re-invocation per `step.run`), not one run.
   Step-heavy episodes burn ~2–8k executions each → ~6–25 episodes/mo before the
   Hobby plan hard-pauses (no overage).

**Moot because:** prod runs on **local dev / now self-hosted durable Inngest**, not
Cloud — Cloud metering/concurrency doesn't apply. Real pain was the dev router
dropping work silently, already addressed by the self-hosted durable setup
(see memory `inngest_selfhost_setup` added 2026-07-11) + the reconciler gap.

## Git / verify

- No tracked-file changes this session (read-only + a throwaway ffmpeg test in
  scratchpad). Nothing to commit. Did NOT touch git — parallel terminal owns the
  live task. No tsc/tests run (docs/investigation only).

## Open / next

- If Inngest **Cloud** ever gets reconsidered: Free is out, Pro (~$75–99) is the
  entry that fits our concurrency. Otherwise stay self-hosted durable.
- 9:16 stitch decision (crop vs blur-pad vs native/reframe) — parked to the other
  terminal, not here.
