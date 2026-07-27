---
name: session-2026-07-17-e30-calibration-onmodel-gate
description: "E30 ref-image calibration run (30 shots) → discovered auto-approve is unconditional + critic can't see off-model; validated a focused on-model detector; plan to build identity gate + strictness slider"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0186d5ae-3c7a-48e2-b7f2-e43dbf29c1ac
---

# E30 calibration session (2026-07-17) — on-model gate plan

Long live-run session driving E30 reference images through Polina/direct triggers to
calibrate auto-approve. Landed several fixes + one big architectural finding + a
validated plan not yet built.

## Fixes SHIPPED (committed to master this session)
- `18382fd8` fix(eref+wchk): Generate button never rendered from an approved plan
  (EpisodeTimelineSection posted without required `reason` → 400; real cause of DEF-02
  "without Polina Director is stuck"). + CONT_MAX_TOKENS 6000→12000 (WCHK died on
  stop_reason=max_tokens; Russian prose + Motor-1 fields outgrew the budget).
- `a19f559c` fix(preview): in-drawer image now refreshes on variant pick. Two divergent
  resolvers; `previewFreshness` now folds `shot_reference.selected_version` into the
  `?t=` cache-bust. +3 regression tests.
- `00a63327` fix(ui): moved EREF AttemptsStrip up next to the reference image (was 5th,
  below TestPlan/Verdict/Scores/Issues).
- `7d6cdc32` authoring: ban double-meaning nouns brief→script→storyboard. SH05 rendered
  a literal dinner plate of gold goo because "plate" was bare (= floor slab). Rules in
  head_writer.md (brief), screenwriter.md (Step 3, loaded live), storyboarder skill
  (rules 7/8/9: bind ambiguous nouns per shot; non-canon prop → material+colour+geometry
  inline; canon transform → name the source).
- `b75d31e1` feat(eref): Designer now gets prev/next shot full prose as "Narrative
  context — reasoning only, DO NOT render". It had ZERO neighbour context in ref mode
  (anchor_chain is a different, lossy pixel-stitch mode the Director rejects). SH08
  correctly drew the flipped plate from SH07 after this.
- Storyboard prose patched in-place (DB, not git) for SH17/SH18: "Sky Blue crystal
  spire" — the plot spire rendered RED because colour was stated only in SH11, bare in
  SH17/18, and the efirium location master has red AMBIENT crystals. Re-gen → v02 blue. ✓

## THE BIG FINDING (q2) — auto-approve ignores the critic
- Artist inserts IMG-episode_ref at status=REVIEW ALWAYS (episode-references.ts:2699);
  finalVerdict goes to metadata only, not status.
- The **reconciler** (Фаза 2b) silently flips REVIEW→APPROVED ~17s later, NO activity
  event. Config: `reconcile.ts:32 STAGE_HAS_CRITIC = { ref_plan:true, ref_image:FALSE,
  shot_plan:true, video:FALSE }`. So generated ref images (and videos) auto-approve
  UNCONDITIONALLY — the AI visual critic's verdict is computed but wired to NOTHING.
  All 29 E30 IMGs APPROVED incl. SH15 (CRIT3 blob) and SH05 (gold-beak).
- The keep-first bar (KEEP_ATTEMPT_SCORE_THRESHOLD=85, shot-reference.ts) only controls
  WHICH attempt the artist keeps + retry count — NOT whether it auto-approves. Tuning the
  bar (Director floated 70/CRIT1) does nothing about the unconditional approve.

## Why no threshold works — the critic can't see off-model
Same defect (Sandy off-model), wildly different critic verdicts:
- SH05 opaque body / gold-beak: composite 75.4 / **CRIT1** / consistency_score **72**
- SH15 purple blob: 47.8 / CRIT3 / consistency **22**
- SH16 purple blob: ≥85 / **CRIT0** / consistency **100** (!!)
`consistency_score` (the dedicated 0-100 identity metric on EREFReview) is quantised —
~15 shots default to 72. Neither composite, CRIT-count, consistency_score, nor
`area:'character_identity'` CRITICAL separates junk from good. SH16 blob = identity 100.
pickBestAttempt ranks by composite ONLY → can ship a CRIT1 over a clean CRIT0 (SH13 did).

## VALIDATED detector (this is the greenlight)
Ran 5 blind subagents (no scores) applying a strict rubric — "recognisable Sandy =
double-bulb hourglass silhouette + TRANSPARENT glass body" — over all 29 shown frames.
Result: **both blobs SH15+SH16 → FAIL, near-identical reasons** (critic gave 22 vs 100).
Also caught SH25 (single opaque flask/beak, critic consistency 72). PASSes the good ones
incl. fixed SH17. It cleanly splits two failure classes:
- **Silhouette loss** (SH09,14,15,16,25) — "not Sandy at all"
- **Transparency drift** (SH01,04,06,08,12) — hourglass intact, body milky/opaque
SH05's Sandy PASSes → SH05 junk was the PROP (dinner plate), not the character.

## PLAN — build the on-model gate + strictness slider (NOT yet built)
1. **Detector runner** — vision call (anthropic-vision) with identity rubric BUILT FROM
   the Bible character canon (not hardcoded Sandy). Returns
   `{silhouette_ok, transparency_ok, verdict, reason}`; stored in IMG metadata
   `shot_reference.on_model`. Series-agnostic (read model-sheet by role).
2. **Wire the gate** into the reconciler approve path: replace the unconditional
   `ref_image:false` with a mode-aware decision. Bounce = keep REVIEW + EMIT an activity
   event (also fixes the silent-approve transparency gap).
3. **Strictness slider** in episode settings (metadata `on_model_strictness:
   loose|medium|strict`, like `reference_regen_cap`): loose=no gate (today);
   medium=bounce on silhouette-loss only (tolerate milky bodies); strict=silhouette OR
   transparency.
4. **Transformation-aware exception** — a silhouette-loss FAIL on a shot whose storyboard
   declares a transformation ("Gloop-<char>" / a flag) is EXPECTED → don't bounce
   (SH15/16 gloop shots pass as intended; the Director accepts gloop-blob).
5. **pickBestAttempt CRIT-first** — prefer CRIT0 over raw score (SH13 bug).
6. **Validate** — re-run the gate over E30's 30 frames per strictness level; confirm it
   bounces exactly the off-model set.

Director quote: "делай детальный план, потом save session and go ahead." Build was
authorised at end of session; started after this note. Episode = SS-S15-E30, id
85d37225-bd18-428b-a238-3ee9621b5e63, series 45351141-6334-4bf0-8a0f-4e00a994f670.
E30 refs done: SH01-29 (SH17 fixed to v02). SH30-44 not yet generated.

Verify baseline this session: tsc clean, 1355/1355 tests, replay-pilot 30/30.
Stack: app :3000 + inngest :8288 durable, both up. reference_regen_cap on E30 = 1.
