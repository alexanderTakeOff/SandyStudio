# Polina (EXEC-CONC) Over-Nudging — Design Analysis (E18)

> Отчёт суб-агента (general-purpose), 2026-07-08. Read-only анализ. Задача D17:
> как срезать нуджи Полины ~300→~30 БЕЗ потери активности/реактивности.
> Пара: `docs/analysis/E18-fix-plan.md` (§БАКЕТ 2 D17), `E18-run-defects.md` (D17).

---

## Verified E18 numbers (read-only DB, service key)

Measured now (window `>=2026-07-08T13:00`, `concierge_turns role=system`) — the episode kept running past the 325-snapshot, so totals grew but proportions are identical:

| event_type | system-turn injections | actor split | paid-notify path today |
|---|---|---|---|
| `agent_started` | **150** (34%) | agents | 0 (already excluded) |
| `agent_completed` | **136** (31%) | VPREV 31, VANIM 31, VGEN 18, EREF 13, EREF-DESIGNER 12, EPREV 12, … | **136** |
| `approval_granted` | **74** (17%) | **68 Director-UUID** + 6 exec-dir-ai | **68** |
| `manual_trigger` | **60** (14%) | **46 Director-UUID** + 14 exec-dir-ai | **46** |
| `agent_failed` | **16** (4%) | VANIM 9, STITCH 2, VGEN/SW/MGEN/EREF/ANAL 1 each | **16** |
| `approval_revision` | **2** | director | **2** |
| **total** | **438** | | **~268 events → 378 paid completions** |

Paid path: `budget_log agent_id=EXEC-CONC` today = **378 rows, all `claude-sonnet-5` / anthropic, Σ $18.82** (~$0.0498/call). Multi-round tool loops explain 378 completions from ~268 notify-eligible events (each wake runs up to 6 rounds — `auto-react-loop.ts:23`, each round is a separately-billed completion at `chat-internal/route.ts:548-560`).

**Why the fence didn't save them:** `.env.local` has `CONCIERGE_AUTO_REACT_MAX_CALLS=500` (the count-fence was deliberately neutered) and `CONCIERGE_DAILY_CAP_USD=30` / E18 `metadata.concierge_cap_usd=30` — so $18.82 never reached the $30 dollar cap and the 40-call default was overridden to 500. The cost fence is a backstop, not curation; it was set non-binding.

---

## 1. Mechanism — how an event becomes a Polina call

There are **two independent gates**, and D17 conflates them:

**Gate A — INJECTION (cheap context turn, no LLM).** Postgres trigger `tg_inject_activity_event_into_concierge` (`supabase/migrations/0033_pa_actionable_asset_events.sql:26-121`) fires on **every** `activity_events` INSERT. If `NEW.event_type` is in its 15-type whitelist (`:33-42`) it INSERTs a `role:system` `concierge_turns` row (`:116-117`) with content `[ambient pipeline event · <type>] …`. Its only filter: skip a Director-own approval **iff** `concierge_threads.director_id = NEW.actor` (`:74-79`). The app-side mirror of this logic is `lib/concierge/ambient-events.ts:40-116`. **This gate produced all 438 system messages.**

**Gate B — PAID NOTIFY (LLM auto-react).** `logEvent` (`lib/api/events.ts:37-100`) after the insert checks the **narrower** allow-list `ACTIONABLE_EVENT_TYPES` in `lib/api/event-actionable.ts:22-40` (`:65`), then fires `sandystudio/pa/notify-needed` (`:84-93`). Two suppressors: self-caused AI approvals/triggers (`event-actionable.ts:65-70`, only `actorKind==='ai-director'`) and `metadata.auto_react===false` (`events.ts:77-79`). The Inngest consumer `exec-pa-react.ts:50-147` debounces 20s per thread-or-`:fail` bucket (`:67-77`), concurrency 1 (`:80-87`), then POSTs `/api/concierge/chat-internal` (`:120-143`), which runs the multi-round tool loop and bills each round (`route.ts:504-662`).

**Filtering that exists today:** `agent_started` already removed from Gate B (`event-actionable.ts:16-19`) — but it is **still injected 150×** by Gate A. AI-self approvals suppressed from Gate B. `auto_react=false` billing-wall suppression. **The Director-own-approval skip is effectively BROKEN** — 68 `approval_granted` and 46 `manual_trigger` carried the Director's UUID yet were both injected *and* paid-notified, because the thread's `director_id` does not equal that actor UUID (`0033…sql:74-79` predicate never matched). So the single largest paid category is **the Director's own clicks echoing back as ~114 paid wakes.**

---

## 2. Event taxonomy (grounded in the E18 counts)

**(a) MUST wake — genuine brain needed (~34 of 438):**
`agent_failed` (16), `approval_revision` (2), `approval_rejected`, `blocker_raised`, `decision_requested`, `input_requested`, `budget_threshold_reached`, `canon_extension_proposed`. Plus the existing non-event escalation paths (loop stall / round-backstop at `route.ts:674-710`; `pa-escalation-timer` re-ping on unresolved `awaiting_director_input`).

**(b) INFO-only telemetry — must NOT wake (~284 of 438):**
`agent_started` (150 — an agent starting needs no decision; the chain advances mechanically), `approval_granted` (74 — the Director/ AI just decided; echoing the decision back is pure noise), `manual_trigger` (60 — a dispatch already taken; the *outcome* is the signal, not the dispatch).

**(c) DIGEST-able — matters in aggregate, not per-event (~136):**
`agent_completed` (136). A single VANIM finishing is telemetry; "12 shots' VANIM done, 3 pending approval" is worth one glance. These advance the pipeline mechanically (`computeNextEvents`/factory), so no per-event wake is required.

---

## 3. Curation policy (438 → ~30)

**Reflex applied: subtract first.** The 10× cut is reached almost entirely by *removing* event_types from the two allow-lists — not by adding machinery.

**Phase 1 — pure subtraction (no new code, lands ~15-20 wakes):**

- **Gate B (paid) allow-list** → collapse `ACTIONABLE_EVENT_TYPES` to the MUST-WAKE set only:
  `{ agent_failed, approval_revision, approval_rejected, blocker_raised, decision_requested, input_requested, budget_threshold_reached, canon_extension_proposed }`.
  Removes `agent_completed`, `approval_granted`, `manual_trigger` from ever spending a model call.
- **Gate A (injection) whitelist** → drop `agent_started`, `approval_granted`, `manual_trigger` from the DB-trigger and the `ambient-events.ts` mirror. Keep `agent_completed` injected as **context only** (she reads it on her next real wake via the recent-turns window / her existing `getRecentActivityEvents` tool — the original pull design). This alone removes 150+74+60 = **284 injections**.
- **Failure dedup** → in `exec-pa-react.ts` debounce key, extend the `:fail` bucket to `:fail:<actor>:<asset_id>` so 9 repeated VANIM fetch-timeout failures collapse to ~3-4 distinct blockers instead of 9 wakes.

**Phase 2 — optional "feel-alive" digest (one small addition, net-negative):**
A scheduled Inngest function (reuse the `pa-escalation-timer` pattern; cron ~20 min) that rolls up suppressed telemetry since the last digest into **one** `role:system` turn — "since 14:00: 12 agents completed, 5 shots approved, 3 dispatched; 2 approvals pending" — and optionally lets her react once. This is justified under anti-additivity because it *enables the deletion* of ~284 per-event injections (net line-delta strongly negative) and guarantees a heartbeat even when the feed goes silent.

**Exact lists:**

```
WAKE (Gate B allow-list, paid):
  agent_failed, approval_revision, approval_rejected, blocker_raised,
  decision_requested, input_requested, budget_threshold_reached,
  canon_extension_proposed

INJECT-AS-CONTEXT ONLY (Gate A, no wake):
  agent_completed        (digest-rolled)

SUPPRESS ENTIRELY (drop from BOTH gates):
  agent_started, approval_granted, manual_trigger
```

---

## 4. Quantified projection (applied to the real E18 mix)

| category | inject now → after | paid-wake now → after |
|---|---|---|
| `agent_started` (150) | 150 → **0** | 0 → 0 |
| `agent_completed` (136) | 136 → **~8 digest** | 136 → **0** |
| `approval_granted` (74) | 74 → **0** | 68 → **0** |
| `manual_trigger` (60) | 60 → **0** | 46 → **0** |
| `agent_failed` (16) | 16 → **~6** (deduped) | 16 → **~6** |
| `approval_revision` (2) | 2 → **2** | 2 → **2** |
| reserved decision/blocker/input/budget/canon | 0 → **~4** headroom | 0 → **~4** |
| digest/heartbeat (Phase 2) | — → **~10** | — → **~8** |
| **TOTAL** | **438 → ~30** | **378 → ~20** paid wakes |

Paid **completions** (the $ driver): ~20 wakes × ~1.3 rounds ≈ **~26 completions ≈ $1.30** vs today's 378 / $18.82 — a **~14× cost cut**, comfortably past the 10× target, and ~30 feed injections.

---

## 5. Reactivity guarantees (nothing that needs a brain is dropped)

Every event that carries a *decision, block, or ambiguity* still wakes her **per-event, un-debounced**:
- `agent_failed` — always wakes (already bypasses the anti-cascade guard, `route.ts:240-247`); dedup only collapses *identical* repeats of the *same* stage, a *different* failing stage always wakes.
- `blocker_raised`, `decision_requested`, `input_requested`, `budget_threshold_reached`, `canon_extension_proposed`, `approval_revision`, `approval_rejected` — all retained on the wake list.
- Stuck-loop / HALT / round-backstop → the stall escalation (`route.ts:674-710`) and `pa-escalation-timer` re-ping remain untouched, so a silent stall still surfaces.

What she loses is only "an agent started", "an agent finished", "someone clicked Approve", "someone dispatched an agent" — four flavours of *already-happened* telemetry, still visible in her feed as context (completed) or on-demand via `getRecentActivityEvents`.

---

## 6. Change-points (propose only — no code written)

1. **`lib/api/event-actionable.ts:22-40`** — `ACTIONABLE_EVENT_TYPES` (the paid Gate B). Highest leverage; single source that gates `pa/notify-needed`. Remove `agent_completed`, `approval_granted`, `manual_trigger`, `asset_created`.
2. **`supabase/migrations/…` new migration replacing `tg_inject_activity_event_into_concierge`** (`0033…sql:33-42`) **+ `lib/concierge/ambient-events.ts:40-53`** (mirror) — the injection Gate A. Drop `agent_started`, `approval_granted`, `manual_trigger`; keep `agent_completed` as context.
3. **`inngest/functions/exec-pa-react.ts:67-77`** — extend the debounce `:fail` key with `actor`+`asset_id` for failure dedup; optionally add a significance floor reading `metadata.severity`.
4. **Phase 2 digest** — new scheduled Inngest fn beside `inngest/functions/pa-escalation-timer.ts` (reuse its cron/step shape), writing one rollup `concierge_turns` system turn.
5. **Composition with the cost fence** (`lib/concierge/cost.ts:117-158`): unchanged as a backstop, but **re-arm it** — `CONCIERGE_AUTO_REACT_MAX_CALLS=500` should drop back to ~40 and `concierge_cap_usd` per episode to ~$3, so curation is the primary control and the fence catches only a regression. Curation makes the fence rarely-if-ever trip instead of being the only thing standing between Polina and a $30 burn.

---

## 7. Risks / tradeoffs

- **A completion that should open an approval no longer per-event wakes her.** Mitigation: model gate-openings as explicit `decision_requested` / `input_requested` emits (which DO wake) rather than inferring them from `agent_completed`; the digest also surfaces a "pending approvals: N" line, and `listPendingApprovals` is a tool she already has. Audit which pipeline points relied on `agent_completed` to prompt an approve before shipping.
- **Silent stall (zero events).** Mitigation: the Phase-2 timer digest fires on a clock even when the feed is empty, plus the existing batch-stall watchdog — a stuck stage still surfaces within one digest interval.
- **Failure dedup masking a genuinely new failure.** Mitigation: key the dedup on `(actor, asset_id, error-class)`, never blanket-collapse; only true repeats of one stuck stage merge.
- **The 20s debounce already collapses bursts but not long runs.** The digest cadence (~20 min) is the tunable that trades "feels alive" vs cost — start at 20 min (~10 digests / 5h episode) and lengthen if still chatty.
- **Broken Director-own suppression is fixed as a side effect** of dropping `approval_granted` from both gates — no need to chase the `director_id≠actor` mismatch separately.

**Bottom line:** D17 is really *two* firehoses. Tightening the paid Gate B allow-list to the 8 MUST-WAKE types and dropping `agent_started`/`approval_granted`/`manual_trigger` from the injection Gate A — pure subtraction, ~3 small edits — takes E18 from 438 injections / 378 paid calls / $18.82 to **~30 injections / ~20 paid wakes / ~$1.30**, while every failure, decision, revision, and budget event still wakes her the instant it happens.
