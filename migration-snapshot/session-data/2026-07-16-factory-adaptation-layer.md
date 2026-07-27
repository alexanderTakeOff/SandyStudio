# Session 2026-07-16 — Factory Adaptation Layer (Critic Discriminator + Factory page)

> Resume context. Substantive work only. Master is green + pushed; laptop now runs prod.

## North-Star

First live firing of the factory's **slow (adaptation) loop** — the contour that TUNES
the factory from every deviation, sibling of the reflex loop that just ships the episode.
Built the sensor (critic discriminator), the dashboard (Factory page), and iterated it to
the Director's mental model.

## What landed (all on master, pushed)

1. **Critic Churn Discriminator** — the slow-loop sensor (`webapp/lib/agents/scorecard/
   critic-discriminator.ts`). Per critic, per episode: is churn the CRITIC too hard/noisy
   or the PRODUCER weak? 3 axes: critic churn (REVISE/artifact-version), producer
   first-pass reject rate, paid regens. Rides existing `episode_scorecard.metrics` JSONB +
   the existing `exec-pub/published` trigger (0 migrations, 0 new hook). escalate-zone
   proposals → Director Inbox (`rule_proposal`, idempotent, published-only); auto_safe stays
   in metrics (no 7th human touch). Memory: [[critic_churn_discriminator]].
   - **E28 forensic finding:** "CREAD 2.45×/shot" was a MEASUREMENT ARTIFACT (54 runs, 3
     REVISE, 94.5% first-pass PASS) — churn was Director-driven manual ref regeneration, not
     critic hardness. Sensor also surfaced a bigger gap the hand-forensic missed:
     **EXEC-VPREV 13 REVISE on V04/V11/V12** (producer gap on the animator).

2. **Factory page** `/factory` + `/api/factory` + sidebar (`app/(studio)/factory/page.tsx`).
   Then a full **v2 redesign** to the Director's 7 requirements + his factory model:
   - Filter checkboxes (exclude-archived default · show-all · pick exact episodes).
   - **Touches split 3-way: Director / Polina (Prod Assistant, keyed on `[Prod Assistant]`
     in event.description) / AI-EP.** The raw scorecard folded Polina into "Director touches".
   - **Leadership model (Director's frame):** agents/code = free base (~10 touches/shot, not
     counted); L1 = Polina, L2 = Director → both drive to 0, especially in production. AI-EP =
     autonomy. Headline metric = production-phase leadership touches/shot → 0.
   - **Pre/post boundary = production-start (ref artist EXEC-EREF first job)**, NOT casting-lock
     (casting locks early → dumped all authoring into "post"). DESIGN (brief/script/storyboard/
     critics/casting) vs PRODUCTION (refs/video/stitch).
   - **Budget:** total = itemized `budget_log` sum (so total = design + production, consistent);
     `budget_spent` shown apart as "reserved" (it misses Polina/concierge spend). $/shot,
     folded per-agent/per-endpoint. Verified E29 DESIGN $8.11 + PRODUCTION $36.80 = $44.91.
   - Charts: hand-rolled inline SVG small-multiples + series-toggle checkboxes (no chart lib).
   - Pure helpers `factory-metrics.ts` (touchClass, splitTouches, productionStartFromJobs,
     foldCost) with 14 unit tests.
   - **RLS fix (migration 0044):** episode_scorecard was granted to service_role only → the
     Director's authenticated browser client read 0 rows → "No scorecards yet" while the table
     was full. `requireDirector()` browser path uses the RLS-scoped cookie client, NOT
     service_role. Fixed + `supabase db push`. Backfilled all 25 episodes' discriminator.

3. **R02 producer self-check** — the "false-success beat is its own shot" hard-rule existed
   but wasn't in the pre-submit self-check → added a self-check step + QA row so EXEC-SB catches
   R02 before the critic (`storyboarder-situational-comedy` skill + `agents/exec/storyboarder.md`).

4. **`/nav-orch*` global commands** (`~/.claude/commands/`) — release orchestrator: one canonical
   `nav-orch <commit|merge|deploy>` + 3 named shims. Autonomous through the stage, halts only on
   danger (live run / red verify / conflict / sibling collision). SandyStudio-tuned.

5. **Multi-machine launcher** — `start-stack.ps1` made path-agnostic (`$PSScriptRoot`) + ASCII-only
   (Windows PowerShell 5.1 choked on non-ASCII) + `start-stack-build.cmd` (rebuild) beside
   `start-stack.cmd` (plain). Laptop now runs prod (health 200×3). Desktop stack stopped (one
   Inngest worker per prod DB).

## Key commits (master, latest → older)
`1bf39d88` ASCII launcher · `90f2133c` path-agnostic launcher · `7e970b3c` production-boundary ·
`a5fa5d90` consistent budget · `966419fd` leadership reframe · `44e2e1c5` Factory v2 ·
`9758ceef` RLS 0044 · (earlier) discriminator + Factory page + inbox `rule_proposal` filter.

## Verify (last full run)
tsc 0 · vitest **1345** · replay-pilot **30/30**.

## Open / next
- **VPREV V04/V11/V12 forensic** — producer-weak vs critic-too-hard on the animator (sensor gave
  a hypothesis, not a verdict). Separate session.
- **Budget reconciliation** — `episodes.budget_spent` systematically undercounts Polina (concierge
  writes budget_log but not budget_spent); recent episodes' budget_log is under-populated
  (reservation path without recordCost). Itemized-cost backfill (`tools/backfill-direct-costs.ts`)
  would light up design/production + per-agent for recent episodes.
- **Scorecard SSOT actor-count fix** — `compute-scorecard.ts::codeableTouchesHuman` still folds in
  Polina; fix at source + re-backfill. [[backlog_scorecard_polina_mislabel]]
- **safe-auto-applier** deferred (nothing qualifies — critics are precise, gaps are producer-side).
- **Housekeeping:** stray untracked secret files in `webapp/` (`.env — копия.local/.zip`) — remove
  or gitignore (not ignored, could get committed).

## Ops
Prod runs on the **laptop** now (`C:\Users\Alexander\sandystudio`, master `1bf39d88`). Factory live
at http://localhost:3000/factory. Desktop stopped. Restart after code: `git pull` +
`start-stack-build.cmd`. Governance ===5=== was active this session.
