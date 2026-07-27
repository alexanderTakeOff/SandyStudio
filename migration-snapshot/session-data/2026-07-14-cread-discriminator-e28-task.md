# TASK BRIEF — CREAD churn discriminator (E28 forensic → slow-loop wiring → Factory page)

> Self-contained. A fresh session can execute this cold. Written 2026-07-14 by Тео for the Director, to run in a SEPARATE session (keep the main thread's context clean).
> Project: SandyStudio (`C:\SandyStudio`). Read `CLAUDE.md` + `PLAN.md` first (session-start ritual). Related memory: [[session_2026-07-13_e28-gold-autonomy-diagnosis]], [[critic_revision_cap_doctrine]], [[train_personnel_doctrine]], [[backlog_audience_quality_sensor]].

## Why this exists (North-Star context — 6 lines)

The factory has TWO nervous contours: **reflex** (get this episode done: code→retry→Polina→Director) and **adaptation** (the slow loop: every deviation TUNES the factory so it doesn't recur). CREAD (EXEC-CREAD, creative-readability critic) ran **2.45×/shot** on E28 — that churn is a **signal**, not just cost. Per Director: «2.45 CREAD means (cread too hard OR previous too weak == anyway fix, learn)». This task is the **first live firing of the adaptation contour** on real data.

## PART A — THE FORENSIC (do this first; READ-ONLY, no ===5=== needed)

**Question:** On E28, was the CREAD churn caused by the **critic being too hard / noisy** (false-rejects acceptable storyboards) or the **storyboarder (EXEC-SB) being too weak** (produced work that legitimately failed)? Or mixed — give proportions.

**Discriminator method** (classify each shot that got ≥2 CREAD runs):

| observed | diagnosis | fix (slow loop) |
|---|---|---|
| shot PASSes after **small/no** change to its storyboard between bounces | critic **noisy / too hard** | recalibrate CREAD rubric (threshold / wording) |
| PASSes only after **substantive** storyboard change | producer (EXEC-SB) **weak** | strengthen storyboarder skill/prompt/tier |
| critic bounces on the **same rubric point** (R01–R06) repeatedly | producer **capability gap** on that principle | targeted training [[train_personnel_doctrine]] |
| bounces on **varied / contradictory** points run-to-run | critic **inconsistent** | stabilize the critic |

**Compute, per shot with ≥2 CREAD runs:**
1. CREAD run count + verdict sequence (PASS/REVISE) — from `jobs` (agent_id `EXEC-CREAD`, `input_snapshot.shotId`, `created_at`, `status`) and the CREAD verdict artifacts.
2. Which rubric points R01–R06 each REVISE flagged (same point repeated vs varied). The rubric lives in skill `readability-comedy-slapstick` (R01–R06 definitions).
3. **Revision-delta size**: text-diff the shot's storyboard `action_prose` between the versions that existed at consecutive CREAD run times (did EXEC-SB substantively rewrite the shot, or did the critic flip on near-identical input?). Storyboard = `assets` `file_type='STB-storyboard'`, versioned; parse per-shot with `listStoryboardShots` (see `webapp/lib/api/vgen-shot-helpers.ts`).
4. Bucket the shot; aggregate proportions → **verdict**.

**Data access (reuse the established pattern):**
- Episode: `SS-S15-E28`, episode_id **`c06c721f-841c-4944-8dad-4590ca38a175`**.
- Write a throwaway `webapp/scripts/e28-cread.mjs`, run from `webapp/` via `node scripts/e28-cread.mjs`, delete after. Pattern: read `C:/SandyStudio/webapp/.env.local`, `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`. (Node ESM won't resolve `@supabase/...` outside `webapp/`, so the file MUST sit in `webapp/scripts/`.)
- CREAD verdict storage: DISCOVER first — check `assets` `file_type LIKE 'REV-%'` (readability report) and/or `activity_events` with `actor`/agent EXEC-CREAD. Don't assume; grep `runner.ts` for how EXEC-CREAD persists its verdict.
- **Lesson (mandatory):** verify against runtime rows, not static counts. Collapse tool-expanded events to real actions. (This session already got burned mis-reading manual_trigger counts — see [[session_2026-07-13_e28-gold-autonomy-diagnosis]].)

**Deliverable A:** verdict (critic-too-hard vs SB-weak vs mixed %), per-shot evidence table, and the ONE concrete fix it implies (recalibrate which CREAD rubric point, OR strengthen EXEC-SB on which principle). Read-only — propose the fix, don't apply without ===5===.

## PART B — WIRE THE DISCRIMINATOR INTO THE PIPELINE (needs ===5===; Director decision below)

**Director directive:** bake the discriminator as an **automatic step AFTER episode distribution** (post-ship), so every episode auto-feeds the adaptation contour.
- Reuse the scorecard infra — do NOT spawn a parallel system (anti-additivity). The discriminator is a natural sibling of `computeScorecard` (`webapp/lib/agents/scorecard/compute-scorecard.ts`, persisted to `episode_scorecard` via `persist-scorecard.ts`). Add a `computeCriticDiscriminator(episodeId)` deriver + persist its verdict (new columns on `episode_scorecard` or a small `critic_calibration` table — pick the smaller change).
- Trigger point: the post-distribution / episode-close hook (find where distribution completes — likely an Inngest fn or the scorecard `phase:'analytics'` refresh). Fire the discriminator there.
- Output feeds the slow loop: a persisted per-critic verdict + a proposed calibration action. **Trap to avoid (Director):** the calibration proposal must be **auto-applied in the safe/reversible zone** (rubric wording, prompt, tier) and only escalate to Director when irreversible/costly — otherwise «self-improvement» becomes a 7th human touch.

## PART C — FACTORY OVERVIEW PAGE (needs ===5===; Director directive)

**Director directive:** a dedicated page in the **left sidebar** (alongside Budget / Analytics / Episodes) showing the whole-factory adaptation picture — the slow-loop trends across episodes, not one run.
- Nav: add an entry to the StudioShell Sidebar (find it under `webapp/components/` / `webapp/app/(studio)/`; existing pages e.g. `webapp/app/(studio)/audience/page.tsx` are the template). New route `webapp/app/(studio)/factory/page.tsx` + `api/factory/route.ts`.
- Content = the North-Star scorecard v2 trends (source: `episode_scorecard` + the new discriminator verdicts):
  - Director touches/episode vs target **6** (Start · Brief · Script · Casting · Publish · Close); anything >6 = defect.
  - Creative touches AFTER Casting-lock → target **0** (Phase-1 leak count).
  - Polina invocations vs number of fail-caps.
  - `calls × price` and `$/shot` trend.
  - churn/shot trend + per-critic discriminator verdict per episode (too-hard vs producer-weak).
  - Emergencies (budget breach, unrecoverable fail) → target 0.
- Follow `specs/system/uiux.md` §7.5 (StudioShell, theme tokens — no hardcoded colors). Reuse the E28 dashboard's visual language if useful (artifact: https://claude.ai/code/artifact/49c6b96d-c827-42de-9d00-9d928365d967).

## Order & modes
1. **PART A** (read-only forensic) → report verdict to Director. Do NOT skip to build.
2. Director confirms the fix + arms **===5===** → **PART B** then **PART C** (or C then B — B is the data producer, so B first is cleaner).
3. Ritual 3 after any code change (tsc / vitest / replay-pilot) + update PLAN.md on master only.

## Key files / refs
- `webapp/lib/agents/scorecard/compute-scorecard.ts` · `persist-scorecard.ts` · table `episode_scorecard`
- `webapp/lib/api/vgen-shot-helpers.ts` (`listStoryboardShots`) · `webapp/lib/agents/runner.ts` (EXEC-CREAD persist)
- skill `readability-comedy-slapstick` (R01–R06) · `agents/exec/*.md` (EXEC-CREAD, EXEC-SB)
- `specs/system/uiux.md` §7.5 · `CLAUDE.md` §11 (Rule 8 pure-function gate) · governance.md §4 (Learning Loop)
- Memory: [[critic_revision_cap_doctrine]] (fail-cap = the discriminator's trigger) · [[train_personnel_doctrine]] · [[audience_quality_sensor]] (another slow-loop feed) · [[session_2026-07-13_e28-gold-autonomy-diagnosis]].
