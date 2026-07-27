---
name: session_2026-07-09_e25-polina-noop-prod-server
description: "E25 smoke session — Polina updateWorkPlan no-op fix on master, reliable prod server, and the stale-branch discovery."
metadata: 
  node_type: memory
  type: project
  originSessionId: c627b410-a9a5-4482-aef9-af257678f787
---

# 2026-07-09 EVE — E25 smoke (Тео autonomous while Director at training)

**Landed on master `c66b1a8` (+ PLAN.md `7733564`):**
- `fix(concierge)`: `updateWorkPlan` empty call → **graceful no-op**, not a throw. Root cause of "Полину дёргают писать в план, а нечего": she was woken on ambient events, prompt said "each turn update the plan", nothing to record → called `updateWorkPlan` with empty content → `parse` threw `content is required` → model retried until the **6-round backstop** escalated to Director; the whole reasoning wake aborted, so she also stopped reconciling shot statuses / driving a stalled conveyor. Fix = parse no longer throws; execute returns ok no-op; prompt says call it ONLY on real change, but per-turn in-head status reconcile STAYS (called out as how she catches a stalled conveyor). +`work-plan.test.ts`. tsc·0 / vitest·266.

**Reliable prod server up:** `next build && next start` on :3000, inngest re-synced ("apps synced"). Needed `eslint: { ignoreDuringBuilds: true }` in `next.config.ts` **on the branch** because the branch predates master's `eef6662` (which fixed the 3 blocking ESLint errors). That eslint-ignore is branch-only — NOT merged to master (master's lint is clean). tsc stays the real gate.

## ⚠️ KEY DISCOVERY — E25 smoke ran on a STALE branch
`claude/e19-test-run-7000f9` is **8 commits behind `origin/master`**. It LACKS the E18 work: **D17 firehose curation** (fence 500→**40**, actionable set trimmed, fail-dedup → 438→30 injections, 14× cost cut) and the **E18 «Start Video» latch**. So the Director's live "Полину переваживают / budget" worry was **already fixed on master** — the smoke just wasn't running on it. Measured on the stale branch: Polina **$10 / 175 auto-react** on `anthropic`/`claude-sonnet-5`, fenced by the isolated **$30 concierge cap** (does NOT bleed into the $50 episode/video budget — see [[polina_cost_audit_CORRECTED_2026-06-26]]). Dev-router doesn't honor the 20s debounce → ~1 wake/event; prod server fixes that. [[inngest_dev_router_unreliable_no_selfheal]]

## Also diagnosed (not a bug): EREF didn't auto-start after Storyboard approve
Not a factory failure — the **D7 gate** (`factory.ts`: "WCHK APPROVED → EREF+MGEN") held EREF because on the approved storyboard **v02** the world_check re-ran and returned **REVISE**, unapproved. Real defect surfaced: **approval races ahead of the per-version gating critic** (same class as D5 "brief-approve races Writer") — Director approved v02 at 16:17 before world_check on v02 even started (16:17→16:19 REVISE). Fix direction (TD, not done): don't surface a version for approval until its critics ran, or bind approval to that version's verdict. Director unblocked via manual EREF trigger.

## RESOLVED — Director decision (q7/q8): "фабрика важнее прогона E25, ребэйз, приведи в порядок под новый смок"
- E25 as an episode **abandoned** (not finished). Factory correctness prioritized over the technical run.
- **D5/D6/D7 landed on master** (`3df4997` + `6bacf8b`) via cherry-pick onto E18. Auto-merge was CLEAN — E18 changed the video/animatic region of `next-events.ts`, NOT the storyboard→critics→EREF gating branches, so no semantic conflict. Invariant: a stage fires only when ALL preconditions approved, else a `pipeline/*-waiting-*` event instead of crashing on a `?? asset.id` fallback ("0 approved X"). Dropped the E19-run-defects.md analysis doc (branch-only, rationale lives in commit msgs + code comments).
- Verify on reconciled master: **tsc·0 / vitest·1182 / replay-pilot·30-30**.
- Prod server **rebuilt on master** (`next build && next start` :3000, inngest re-synced) — no eslint-ignore needed (master's `eef6662` fixed the lint). Ready for a fresh smoke.
- Branch `claude/e19-test-run-7000f9` is **superseded** (all unique code on master) — safe to delete.

master tip `71f40ae`. NEXT: new smoke from a clean episode on master — now carries D17 Polina curation (fence 40) + E18 «Start Video» latch + D5/D6/D7 gates. The «approval races ahead of the per-version critic» defect (EREF/world_check v02 REVISE, above) is still a TD — not fixed here.
