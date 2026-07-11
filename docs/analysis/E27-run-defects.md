# E27 «Эскалатор» — run defects & observations log

> Smoke run started 2026-07-11 by Director. Series SS-S15, Mode 2, reconciler OFF
> (`MECHANICS_AUTO_ADVANCE=false`) — first smoke with REAL distribution, manual gates.
> Prod deployed from master `e2142ea` (fresh rebuild ~09:30). Episode created + brief
> approved ~06:00 on the PRE-redeploy build.
>
> Format mirrors `docs/analysis/E16-run-defects.md`: one entry per observation, with
> evidence, suspected root cause, and whether it's design vs bug.

---

## D1 — Brief approved, но каст-нудж не появился (DAG замолчал)

- **Symptom (Director):** «утвердил бриф, но ни кастинг ни писатель не автостартовали».
- **What SHOULD happen (code, `next-events.ts:352-374`):** on `SPC-brief` APPROVED in a
  Director mode (not AUTOTEST), while no `SPC-episode_cast` exists yet, the pipeline logs a
  `decision_requested` MUST-WAKE event: **«Бриф одобрен — кастуй эпизод»** (castEpisode →
  SPC-episode_cast → approve). Casting is **TOOL-ONLY** (no Inngest executor) — it never
  auto-runs by design; the Writer (EXEC-SW) then fires on cast APPROVAL (`next-events.ts:376`).
- **Evidence (DB, E27):** `activity_events` for E27 = only `episode_created | asset_updated |
  approval_granted`. **No `decision_requested`.** Brief v1 APPROVED, no cast asset, Mode 2 —
  the nudge branch condition is satisfied, yet nothing fired.
- **Caveat:** brief approved ~06:00 on the pre-redeploy build (before `e2142ea` went live
  ~09:30). Could be an old-build issue already fixed, OR a real Mode-2 wiring gap where the
  brief-approval path doesn't invoke `computeNextEvents`/next-events.
- **Status:** OPEN — needs repro on the current build. Suspect: brief-approval (Mode 2) does
  not run the next-events pass, so the D1/D2 (2026-07-09) casting nudge never emits.
- **Unblock for E27 now:** casting is manual regardless — run `castEpisode` (Polina/Director) →
  approve `SPC-episode_cast` → Writer auto-fires.

---

## D2 — Header model label stale after on-the-fly provider switch (COSMETIC)

- **Symptom (Director):** header shows **`OpenAI · gpt-5.5`** but he already switched Polina back
  to Sonnet 5, and Polina confirms in chat: «Модель: claude-sonnet-5». Header lies; behaviour is
  correct.
- **Root cause (two layers):**
  1. **GET not authoritative.** `GET /api/concierge/chat` (`route.ts:74`) returns
     `conciergeModelLabel()` from the llm.ts **process-level cache**, but — unlike POST
     (`route.ts:171`) — it does **NOT** call `applyConciergeProviderOverride(supabase)`. The
     Settings switch (`setConciergeProviderOverride`) writes `app_config` and only busts the TTL;
     the process cache is refreshed only on the NEXT POST. So GET reflects the pre-switch model
     until a message is sent.
  2. **Frontend fetches once.** `ConciergePanel` reads the label in a mount-only
     `useEffect(…, [])` (`ConciergePanel.tsx:373-386`) and never re-fetches after a switch.
- **Impact:** cosmetic only — the POST path applies the override correctly (Polina answered as
  sonnet-5). Only the header badge is wrong until a full page reload.
- **Fix (SHIPPED):** (a) GET is now `async` and calls `applyConciergeProviderOverride(...)` before
  reading the label → badge is authoritative (`route.ts:74`). (b) `ConciergePanel` extracts the
  status fetch into `refreshStatus` and re-runs it after every turn's `finally` → the badge
  self-corrects after the next message following a switch (`ConciergePanel.tsx`).
- **Status:** FIXED (2026-07-11).

---

## D5 — Mode 3 critic-PASS did NOT auto-generate images (NESTING_STEPS drops the executor event) — FIXED

- **Symptom (Director):** Mode 3, ref Plans have critic PASS, but no image generation starts
  automatically (expected: PASS → image auto; problems → Polina). 26/28 Plans APPROVED, only
  **2 images** (the 2 manually-fired pilots).
- **Runtime evidence (decisive):** prod log has **72× `NESTING_STEPS`** warnings on
  `plan-critic-autofire-events`. DB: SH05 Plan APPROVED with **no `approvals` row** (in-code
  promotion) + critic verdict `PASS`. Inngest log: `exec-eref/execute-from-plan` (Artist)
  published only **6×, last for SH01/SH02** — zero Artist events for the 24 auto-promoted Plans.
- **Root cause (`factory.ts` `isPlanCritic`):** the Mode-2/3 auto-advance called
  `step.sendEvent` **inside** a `step.run('plan-critic-autofire')` callback. Inngest forbids
  nesting step.* tooling (`NESTING_STEPS`) and drops it → the Plan flipped APPROVED (a plain
  supabase update runs fine inside step.run) but the follow-on Artist/VGEN event was **silently
  lost**. So Mode 3 "auto-advance" promoted Plans but never generated images.
- **Process note:** a code-review subagent read this same block and concluded it "already does
  Mode 2/3" — true that the CODE exists, but it was broken at RUNTIME. The prod log settled it
  in one grep. Lesson banked: always overlay agent reports on the server logs (now a global rule).
- **Fix (SHIPPED to master `87caecf`, deploy DEFERRED — live run):** the step.run now only does
  the DB work and RETURNS the events; `step.sendEvent` runs at the function top level.
- **⚠️ E27 recovery caveat:** the 24 already-PASSED Plans will NOT auto-re-fire after deploy
  (`isPlanCritic` fires on critic completion, which already happened). They need a MANUAL Artist
  re-fire (Generate button / re-trigger) once deployed in a quiet window.
- **Status:** FIXED in code (2026-07-11); deploy pending Director's quiet-window OK.

## D6 — Critic tail hangs ~10 min (finishTimeout), + fanout throughput capped by designer cap 3

- **Symptom (Director):** critics crawl (one/small batches); SH25/SH27 RUNNING 10+ min without
  completing (SH27 job started 07:35, still RUNNING).
- **Findings (agent + logs):** (1) **throughput ceiling = `exec-eref-designer: 3`** (not the
  critic cap 5) — critics are fed one-per-designer so arrive in cohorts of 3; ~100 s/shot is
  orchestration overhead (~18 inngest→app round-trips/shot + `loadAgentInputs` loaded TWICE per
  run), not the Sonnet call. (2) The tail-hang is a provider-fetch-no-timeout stall that rides
  to the `finishTimeout: '10m'` on exec-eprev, then cancels — the classic
  [[provider_fetch_no_timeout_root_cause]] not-yet-swapped-everywhere issue.
- **Recommended (deferred, Director OK'd raising the cap):** `exec-eref-designer` 3→5/6;
  de-duplicate the double `loadAgentInputs`; collapse cheap adjacent steps; finish the
  `fetchWithTimeout` swap on the critic provider call. Bundle into a throughput PR, deploy in a
  quiet window.
- **Fixed (2026-07-11, branch `teo/d6-throughput`):**
  1. **Throughput — de-duplicated the double `loadAgentInputs`.** `factory.ts`
     preflight ran the full episode-wide asset + Series-Bible + genre load only to
     DISCARD it (`validateAgentInputs` runs its own targeted count/canon/governance
     queries and never reads the loaded inputs). Removed → the heaviest per-run DB
     work now happens ONCE (execute-agent step), roughly halving the per-shot
     orchestration cost across the eref-designer/critic fanout. No behaviour change.
  2. **Tail-hang — bounded the Anthropic SDK call.** `anthropic-text.ts` did
     `new Anthropic({ apiKey })` with NO `timeout`, inheriting the SDK's 10-minute
     default — exactly the wedged-socket ride to `finishTimeout: '10m'`. Added a
     per-call `timeout` (+`maxRetries: 1`) SCALED to maxTokens via `anthropicTimeoutMs`
     (floor 60s + 30ms/token, capped 8m < the belt): the 4k critic aborts a wedged
     call at ~3m (retry → ~6m, fails clean) while the 16k Screenwriter never clips.
     The SDK `timeout` uses an AbortController — the SDK-native equivalent of the
     shared `fetchWithTimeout` the SDK bypasses. New seam unit-tested (4 cases).
  - Cap 3→5 already shipped separately (`4a36498`).
  - **Deferred:** "collapse cheap adjacent steps" — vague, risk-additive for modest
    gain now that the double-load (the real waste) is gone; revisit only if the
    per-shot round-trip count is still a bottleneck after this ships.
- **Status:** FIXED on branch — tsc·0 / vitest 1210 / replay 30. Deploy (rebuild +
  restart) in a quiet window with Director OK; NOT during a live E27 run.

## D3 — Storyboard fired TWICE (in-flight job not detected)

- **Symptom (Director):** «сториборд запущен дважды. возможно потому что я апрувнул writer before
  critic completed / stb started again after my approval critic». Rule he stated: **«no re-fire if
  the agent is already running»**.
- **Root cause (`next-events.ts`):** the three SB-fire branches (cast→SB `:415`, script→SB `:457`,
  review→SB `:474`) guard only with `hasJob(EXEC-SB, { since })`, where `since = asset.updated_at`
  of the CURRENT approval and `hasJob` filters `started_at >= since-5s`. A prior approval's EXEC-SB
  job is invisible to that filter — a **QUEUED** job has no `started_at`; a **RUNNING** job started
  before the window — so a LATER approval in the normal script→review→cast flow **re-dispatched**
  the storyboard. Two SB runs → duplicate STB assets / divergent shot numbering.
- **Fix (SHIPPED):** new `hasActiveJob(supabase, ep, agentId)` — a `since`-free QUEUED/RUNNING
  existence check — added to all three SB-fire guards. In-flight EXEC-SB always blocks a re-fire,
  regardless of the approval window. **Scoped to the single-instance storyboard stage only** — NOT
  applied to per-shot fan-out agents (EXEC-VGEN/VANIM/EREF), where concurrent jobs across shots are
  legitimate (a blanket guard would stall the pilot→full-fanout batch flow).
- **Broader class (noted, not changed):** the same narrow-`since` window affects other
  single-instance stage fires (COPY / WCHK / STITCH / THUMB / PUB / MGEN). Left as-is for now to
  keep the change surgical; the `hasActiveJob` guard can be extended to them later if a double-fire
  is observed. Per-shot agents must stay exempt.
- **Tests:** `hasActiveJob` unit (QUEUED/RUNNING→true, COMPLETED/none→false, agent-scoped) +
  storyboard single-fire behavioural lock (fires once / suppressed while EXEC-SB QUEUED/RUNNING).
- **Status:** FIXED (2026-07-11).

---
