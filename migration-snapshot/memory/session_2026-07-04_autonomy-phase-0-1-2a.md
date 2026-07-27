---
name: session_2026-07-04_autonomy-phase-0-1-2a
description: Autonomous-factory build — ALL phases 0/1/1b/2a/2b(+loop)/3/4 built+tested+pushed, inert behind MECHANICS_AUTO_ADVANCE; only the paid live smoke remains (Director-gated).
metadata: 
  node_type: memory
  type: project
  originSessionId: 7df7b91a-8677-4f35-966b-fa181b666586
---

# Session 2026-07-04 — Autonomy build: ALL phases shipped (code-complete, awaits live smoke)

## FULL ARC (9 commits, all verify-green, pushed to claude/e13-thin-agent-run)
`0cc5b7e` Ф0 music-EDL staleness · `5eb74bc` Ф1 state-matrix · `7343035` Тир-A smoke + INVALIDATED-tombstone
fix (found on live E14) · `691c22a` Ф1b input_versions stamping · `abbc104` Ф2a reconciler brain ·
`1dbac58` Ф2b executor · `cf80dc1` Ф2b self-advance LOOP (factory emits reconcile after every completion,
flag-gated) · `e75f3ff` Ф3 surface stuck shots · `406d1fa` Ф4 conductor tools (getStateMatrix + reconcileEpisode).
Final verify: **tsc · vitest 1140/1140 (105 files, +40 new) · replay 30/30**.
New surface: `lib/agents/{state-matrix,production-plan,reconcile,reconcile-execute,input-versions,music}.ts`,
`inngest/functions/reconcile-episode.ts`, `lib/concierge/tools/conductor.ts`, routes
`/api/episodes/[id]/{state-matrix,reconcile}`, `scripts/smoke-state-matrix.ts`.

## THE ONE REMAINING STEP = live smoke (Director-gated, $)
INERT until `MECHANICS_AUTO_ADVANCE=true`. Certify "фабрика едет сама": flag on + reservedShots=pilots +
one paid episode. Needs explicit Director «go». Until then logic is proven by unit tests + shadow on live E14.
Тир-A shadow ($0): `npx tsx --env-file=.env.local scripts/smoke-state-matrix.ts [episodeId]`.

## ⚠️ Before flag-on live (safety)
- ✅ FIXED `0008615` — pilots auto-reserved from `episodes.metadata.eref_pilot_shot_ids` (reconcileEpisode
  self-derives reservedShots when 'pilots' is a reserved gate). Pilots stay Director-gated by default.
- STILL OPEN: provider-fail auto-retry→park NOT built; a stuck shot surfaces (Ф3) but isn't auto-parked —
  stitch still waits on it unless the Director excludes (as with E14 SH16). Tune retry-vs-park on the smoke.

---

## (Original mid-session notes — Фазы 0/1/2a detail)

Branch `claude/e13-thin-agent-run` · Mode 3 · ===5===. Director granted autonomy
(«делай по плану, вилки спорно-но-поправимо решай сам, ко мне только дедлок») then
went to sleep. Built by `docs/AUTONOMY-IMPLEMENTATION-PLAN.md`. All commits carry
verify trio green.

## What landed (3 commits)

- **`0cc5b7e` Фаза 0 — music in parallel EDL.** ⚠️ Plan's F8 root cause was WRONG:
  `ensureEpisodeAnimaticEDL` already baked music (inline duplicate). Real bug =
  ORDERING + idempotency: EDL materialized at pilot approval (before music), bakes
  null, idempotent early-return hands EXEC-STITCH the stale music-less contract →
  silent cut. Fix: new shared `lib/agents/music.ts` (`bakeApprovedMusic` +
  `contractHasMusic`, collapsed 2 dupes → 1); `ensureEpisodeAnimaticEDL` idempotent
  path now REFRESHES music into existing EDL when AUD-music approved later;
  `next-events.ts` stitch precondition surfaces `pipeline/stitch-blocked-no-music`
  for parallel Director runs (AUTOTEST/sequential untouched → replay unaffected).
- **`5eb74bc` Фаза 1 — Episode State Matrix.** `lib/agents/state-matrix.ts`
  (`getEpisodeStateMatrix` pure read-only projection; `downstreamCone`;
  `renderStateMatrixMarkdown`; `STAGE_ORDER`). API `GET /api/episodes/[id]/state-matrix`.
  Generic freshness reads `metadata.input_versions` (absent → fresh, graceful).
- **`abbc104` Фаза 2a — reconciler brain (pure, flag-gated).**
  `production-plan.ts` (ProductionPlan contract, reserved-gates centralized,
  `MECHANICS_AUTO_ADVANCE` flag default OFF); `reconcile.ts` (`planReconcileActions`
  pure decision + `collectCriticSignals`). NO mutation/IO — decision only.

Verify at last commit: **tsc clean · vitest 1123/1123 (102 files) · replay-pilot 30/30.**
New tests: ensure-animatic +7, state-matrix +7, reconcile +11.

## Key decision / architecture

- The old **factory-chain** (`computeNextEvents` push-DAG + `factory.ts` Mode-4
  auto-chain) is REUSED, not replaced. It worked on the happy edge, gl/och on
  deviations because narrow event-guards (e.g. stitch gate `next-events.ts:~1288`
  fires only on `VID-shot` → an exclude never re-fires it). New model: reconciler
  = idempotent converge layer OVER the same motor; delegates narrow gates to a
  full-matrix re-eval. `computeNextEvents` stays the muscle.
- Reserved-vs-mechanical: per-shot stages auto-advance; brief/script/canon/pilots/
  publish/lock/budget/mode stay with Director.

## What is NOT done (next session — ALL need live smoke, Director deferred smoke)

- **Фаза 1b:** generators must WRITE `metadata.input_versions` (upstream versions)
  so freshness catches stale live. Read-side ready; write-side not wired.
- **Фаза 2b (executor):** `reconcileEpisode(episodeId)` builds ReconcileContext +
  EXECUTES actions. Approve reuse = extract `/api/assets/[id]/approve` internals
  into `lib/api/approve-asset.ts` and call from code (NOT HTTP) → then
  `computeNextEvents`. provider-fail retry→PARK. Wire idempotent `reconcileEpisode`
  into approve-route/critic-runners/exclude-toggle behind `MECHANICS_AUTO_ADVANCE`;
  delegate the narrow stitch gate.
- **Фаза 3** (surface park/HALT in plain language) + **Фаза 4** (Полина→Opus conductor
  reads matrix + reconcile tools).

## Integration points confirmed (for 2b)

- approve tool → POST `/api/assets/[id]/approve` (`lib/concierge/tools/dispatch.ts:134`).
- Mode-4 auto-approve + cascade shape: `factory.ts:592` (approve flip via
  `demoteSiblingApproved`) + `factory.ts:817` (`computeNextEvents` fan-out).
- Stitch gate to delegate: `next-events.ts:~1288` (`ft.startsWith('VID-shot')` guard).
- Critic verdicts: REV-* assets `metadata.verdict` (PASS/REVISE/FAIL).
- Flags pattern: `lib/agents/chain-flags.ts`.

## Env / notes

- Auto-sync git hook did NOT fire — commits were manual. Watch for uncommitted work.
- Context was high by session end (~long build). Fresh session recommended for 2b.
- [[autonomous_factory_architecture_doctrine]] is the North-Star this executes.
- PLAN.md is master-only — NOT touched on branch. `AUTONOMY-IMPLEMENTATION-PLAN.md`
  (docs/) updated in-branch with per-phase SHIPPED markers + 2b integration points.
