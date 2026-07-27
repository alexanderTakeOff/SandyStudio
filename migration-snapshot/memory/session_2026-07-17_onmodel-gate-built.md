---
name: session-2026-07-17-onmodel-gate-built
description: "Built the on-model gate end-to-end (detector runner + decideOnModel + reconciler bounce + strictness slider + transformation field). tsc clean, 1381/1381, replay 30/30. Not yet committed; live E30 validation still owed."
metadata: 
  node_type: memory
  type: project
  originSessionId: 58991dcd-cfe3-4539-9fef-240c0592cd55
---

# On-model gate — BUILT (2026-07-17)

Implemented the full plan validated in [[session-2026-07-17-e30-calibration-onmodel-gate]].
Approved plan file: `~/.claude/plans/5-go-ahead-build-deep-hearth.md`. Mode ===5===.

## What landed (all 6 plan points)
1. **Detector runner** `webapp/lib/agents/runners/on-model-detector.ts` — a SEPARATE focused
   vision call (not the EREF critic, which can't see off-model). Two binary axes
   silhouette/transparency vs the Bible character canon; series-agnostic. Model via a new
   app_config scope `on_model` (env `ON_MODEL_DETECTOR_MODEL`, default `claude-opus-4-8`).
   Skip-fallback → PASS (no key / no character ref image) so an outage never bounces. Modeled
   1:1 on `eref-check.ts` (`generateAnthropicVision` + coercion + skip).
2. **Pure decision** `webapp/lib/api/on-model.ts` — `decideOnModel(raw, strictness, isTransformation)`:
   loose=always PASS; medium=FAIL on silhouette-loss (transparency tolerated); strict=silhouette OR
   transparency. Transformation exception suppresses ONLY the silhouette term (transparency still
   FAILs under strict — the load-bearing edge case, tested). Plus `readOnModelStrictness` +
   `OnModelResult` type. Verdict FROZEN into `shot_reference.on_model` at generation time.
3. **Reconciler wiring** — did NOT flip `STAGE_HAS_CRITIC.ref_image` (a FAIL must not enter the
   REVISE-loop). Instead a new `bounce` ReconcileAction in the creative else-branch of
   `reconcile.ts` (`stage==='ref_image' && verdicts.get(key)==='FAIL'` → bounce; PASS/missing →
   fall through to the existing creative gate = fail-open). New pure `collectOnModelSignals` folds
   IMG `on_model.verdict` into the same verdicts map (latest version wins). Executor
   (`reconcile-execute.ts`) queries `IMG-episode_ref%`, merges, and handles `bounce` like `halt`:
   keep REVIEW + `reconcile/bounce` event + `raiseBlockerOnce` to Director; new `bounced[]` in
   ReconcileResult (surfaced by the reconcile route). Also emits `on_model_fail` at generation time
   for dashboard visibility even in non-armed episodes.
4. **Transformation field** — structured `transformation: boolean` (Director chose structured over
   prose-parsing): added to `specs/schemas/shot.md`, the storyboarder JSON-schema prompt
   (`storyboarder.ts`), `ParsedShot` + the raw-shot parse in `episode-references.ts`, and the
   glossary (on-model gate / strictness / transformation terms in §7).
5. **pickBestAttempt CRIT-first** — already shipped (a87d4a83), no work.
6. **Strictness slider** `on_model_strictness` (loose default) — settings route zod Body + patch,
   episode-creation default seed, and a 3-value segmented control in `EpisodeSettingsCard.tsx`
   (mirrors `pipeline_mode`).

## Key decisions (Director, this session)
- **Rollout = enable immediately, no global kill-switch.** The per-episode strictness IS the switch:
  loose (default) = gate off = byte-identical to before; medium/strict enforce on merge. Dropped the
  Plan agent's `visualCriticEnforce` flag — unnecessary because a loose episode never writes a FAIL,
  so blast radius is zero until the Director opts an episode in. Reconciler reads only the frozen
  verdict; needs neither strictness nor an enforce flag.
- **Transformation = structured STB field**, not `Gloop-<char>` prose detection.

## Verify
tsc clean · **1381/1381** tests (+26: on-model truth table, reconcile bounce/pass/missing,
collectOnModelSignals, executor bounce+blocker+stays-REVIEW, detector skip-fallback) · replay-pilot **30/30**.

## Validation + calibration (committed after build)
- **Live validation ran** ($1.85, 29 frames, opus-4-8). MEDIUM = {14,15,16,26} (blobs + submerged +
  stretched), 0 false positives. STRICT first over-fired on transparency (11) — root cause: canon ref is
  DAY-lit, E30 is a NIGHT / purple-ambient scene, so transparent glass legitimately reads darker.
- **Recalibrated the transparency axis (`bb67913b`)** to judge MATERIAL (light passes through / internal
  depth), tolerant of scene lighting; FAIL only a flat opaque painted mass. Director reviewed the 6 strict
  flags: SH03/07/11/17/18 were false (night) → now PASS; **SH28 is a TRUE defect** (Director: "действительно
  плоско, перегенерил бы") — strict correctly holds it. So strict is now trustworthy.
- **+retry-once** on JSON parse flake (~2-3/29 calls emitted prose w/o the fenced block → fail-open let a real
  off-model slip). Second 10-frame run confirmed: the whole old transparency set {01,04,06,08,12} now PASSes
  (night artifacts, not drift); retry gave SH09 a clean verdict → FAIL on SILHOUETTE (extreme close-up, hourglass
  not in frame — an ECU-crop question like SH25, pending Director).

## Overnight (Director: q1 подними / q2 redo / ребилди / +10 / гаси сервера)
- **E30 → strict** (mode 3, armed). Prod build clean. Servers were brought up (health 200, functions synced)
  then **shut down** per instruction (app :3000 + inngest :8288 confirmed DOWN).
- **SH28 regen BLOCKED** by the `PLAN_ANCHOR_STALE` guard: SH28's plan (`e0c0b129`) references a superseded
  spatial anchor (`9e3c0c1f`; newer APPROVED at same location `479c1ca8`), so image-only regen is refused by
  design. Proper fix = re-author the plan (`regenerateRefPlan` — a concierge/Designer flow, NOT a simple REST
  call; it changes the continuity anchor) → approve → regen. Did NOT auto-run overnight (continuity change +
  Director approval gate). Left for the morning.

## Commits (all master)
d9f46405 feat · 68f29051 harness · bb67913b transparency recalibration+retry · caadf237/9c47496b PLAN.

## Open for Director (morning)
- (a) SH28: re-author plan + regen (2 commands) — blocked tonight by stale-anchor guard.
- (b) SH09 (and any ECU shot): silhouette FAIL because the full hourglass isn't in frame — real off-model or
  a legit tight crop? (parallel to SH25 jump-balance, which Director ruled OK).
- (c) confirm strict is right as E30's production tier.
- SH30-44 still not generated; they'll hit the strict gate when produced.
- One-off scripts left uncommitted (untracked): `onmodel-e30-set-strict.ts`, `find-sh28-plan.ts`,
  `onmodel-e30-medium-and-extract.ts`. The reusable harness `validate-onmodel-e30.ts` IS committed (SHOTS= filter).
