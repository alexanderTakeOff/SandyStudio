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
