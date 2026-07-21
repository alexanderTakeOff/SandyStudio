# Close the feedback loop — collection arm, honest board, correction arc

## Context

Planet (`PLANET.md`, ratified today): the machine reads how the product landed and turns
its own knobs. Today it cannot, for three verified reasons:

- **Collection has NEVER run.** DB: `REV-analytics` assets = **0**. `EXEC-ANAL` jobs = **2,
  both FAILED**, same error — `requires collectionPoint and youtubeVideoId in event payload`.
  `EXEC-PUB` has **20 COMPLETED**. We publish fine; we have never measured. Two causes:
  the manual trigger route injects only `episodeId`, and the deferred `ts` fan-out has never
  produced a run on self-hosted Inngest.
- **The board is a constant.** `route.ts:111` passes `shippedCategories: []` — hardcoded, no
  writer anywhere. `holeCards()` therefore emits all 10 taxonomy categories at `rank 0..9`
  every request, forever, pushing data-derived cards (`rank 50/100+`) below the fold.
- **The correction arc does not exist.** `buildAdvice()` has exactly one caller; its output is
  rendered to React and discarded. `BOARD-MKT` = 0 hits in `registry.ts`.
  `analytics_interpretation` = 0 occurrences in `webapp/`. The theme-selection skills contain
  **zero** mentions of audience/views/retention.

Plus two holes in today's `b4c7b9d7` that the review caught — mine, and real.

Director's decisions: correction arc = **machine proposes, Director decides** (not auto-apply
yet). Hole cards = **remove until tagging exists**. The `&list=` backlink change = **separate**,
after the incognito check.

Outcome: measurements start accumulating from today, the board stops inventing analysis, and
the machine's own advice reaches the machine's own creative decision.

---

## Part 1 — fix the two holes in `b4c7b9d7`

**`webapp/app/api/audience/route.ts`**

- `getVideoStatistics` is now the sole source of BOTH views and `publicationState`, but the call
  is wrapped `.catch(() => [])`. On a 403 / expired token every video silently becomes
  `'private-draft'`, `publicMetrics` empties, and the page renders zeros as if the channel were
  empty. **Remove the catch — let it throw.** Absence of a datum must not be encoded as a fact
  (CLAUDE.md §11 rule 5, FAIL FAST). The route's `withApiHandler` already surfaces errors.
- Retention gate at `route.ts:80` still reads the lagging clock: `if (kind === 'longform' && a &&
  a.views > 0)`. A video published this week has `a === null`, so no curve is pulled exactly when
  it matters. **Gate on the live counter + public state** instead: `s.viewCount > 0 &&
  s.publicationState === 'public'`. `getRetentionCurve` already returns null harmlessly when
  Analytics has nothing.

---

## Part 2 — repair the collection arm

### 2a. Manual trigger stops failing deterministically

`webapp/app/api/episodes/[id]/trigger/route.ts` builds `eventPayload = { episodeId, ...body.payload }`
(line ~186). VGEN / EREF / THUMB each have a special case above it; EXEC-ANAL never got one, and
unlike the others it cannot derive its own inputs.

Add an EXEC-ANAL branch beside the existing ones: read `episodes.metadata.youtube_video_id`
(same lookup `short-linkage.ts:43` `readParentVideoId` already does — reuse it), and default
`collectionPoint` to `'T+24h'` when the caller did not pass one. If there is no
`youtube_video_id`, throw a `ValidationError` naming the reason — never dispatch a job that is
guaranteed to fail.

### 2b. Replace the deferred fan-out with an hourly reconciling cron

**Delete `webapp/inngest/functions/schedule-analytics.ts`** and its registration in
`webapp/inngest/index.ts`. It fans out four events with a future `ts` (up to 30 days). Its own
header reasons about "Cloud Inngest" and "the dev server" — we run neither since 2026-07-11.
Zero runs have ever come out of it, and we cannot distinguish "held" from "dropped".

Add `webapp/inngest/functions/analytics-collect-cron.ts`, modelled directly on
`reconcile-cron.ts` (same shape: cron trigger → one `step.run` → service-role client → bounded
scan → emit events, never call the runner directly):

- Trigger `{ cron: '17 * * * *' }` — hourly, off the :00 mark. Hourly (not daily) so the `T+1h`
  point is reachable with one mechanism.
- Scan episodes with a `youtube_video_id` in metadata, bounded (`SCAN_LIMIT`, mirror the
  reconciler's 20).
- Resolve each video's **`liveAt`** via `getVideoStatistics` — the field added in `b4c7b9d7`.
  This fixes a bug that would otherwise bite the moment collection worked: `runner.ts:3239/3303/3331`
  set `publishTimestamp: Date.now()` at **upload** time, so with videos uploaded private and
  scheduled days later, T+1h/T+24h/T+7d would all sample a video nobody could see.
- A point is **due** when `now >= liveAt + delay` and **not yet collected** — check for an existing
  `REV-analytics` asset for that episode + `collectionPoint` (idempotent by construction, so a
  missed tick self-heals on the next hour).
- Emit `sandystudio/exec-anal/collect` with the full payload for each due point.
- Skip anything whose `publicationState !== 'public'` — a scheduled video has no audience.

The four points (`T+1h / T+24h / T+7d / T+30d`) move out of `schedule-analytics.ts` into a
`POINTS` const in the new file. Net: one durable mechanism replaces one that never fired, and
the `liveAt` bug dies with it.

**Also retire** `webapp/scripts/daily-yt-snapshot.ps1` + the Windows scheduled task once the
cron is proven — the server-side path supersedes the desktop one.

---

## Part 3 — the board stops inventing analysis

`webapp/lib/agents/analytics-advisor.ts`

- Remove the `holeCards(...)` call at `:154`, the `shippedCategories` field from `AdviceInput`
  (`:84`), and the `holeCards` function itself (`:118-130`). Recoverable from git; nothing else
  calls it.
- Drop the now-unused `SANDY_TAXONOMY` const and the `taxonomy` argument from
  `webapp/app/api/audience/route.ts`.
- Delete the `holeCards` cases in `webapp/__tests__/lib/agents/analytics-advisor.test.ts`.
- `confidenceNote` must state plainly when there are no cards, e.g. *"no readable signal yet —
  N public videos, M past the exposure gate"*. Silence is the honest output at our sample size;
  an empty board is a correct board.

**Doctrine, same commit** (`skill-creation.md`: a skill must not assert what is not there) —
`.claude/skills/audience-quality-sensor/SKILL.md`: mark the *holes / untested-space* axis as
**not implemented, pending per-gag tagging**, and name the tagging as its precondition. The
skill currently presents it as a live axis; it is not.

---

## Part 4 — the correction arc: machine proposes, Director decides

Two moves. Neither auto-applies anything.

### 4a. Persist the advice so it has history

`buildAdvice()` output currently lives only inside one HTTP response. In the new cron, after
emitting the due collections, run `buildAdvice` over the public metrics and write the report as
a **series-scoped asset** — `file_type = 'REV-analytics_advice'`, `series_id` set,
`episode_id = null` — exactly the storage model `lib/api/series-themes.ts` already uses for
`SPC-theme_*` (documented there: series-scoped asset, `content` = the body, `metadata` = the
structured bits; no migration needed because it reuses an allowed prefix).

Write only when the report differs from the latest stored one, so history is a change log, not
an hourly duplicate.

### 4b. Make the creative stage SEE it

`webapp/lib/agents/runner.ts` → `loadAgentInputs` (`:242`) is episode-scoped by construction, so
cross-episode audience data is currently unloadable by any agent. Add one series-scoped read:
for the authoring agents that choose what gets made (theme selection and the brief/script
stage), load the latest `REV-analytics_advice` for the episode's `series_id` and pass it in
`AgentInputs`.

Then, in the **same commit** (`train_personnel_doctrine`: a change touching `loadAgentInputs`
MUST touch the agent instructions):

- `agents/exec/*.md` for the affected agents — state that audience advice is now an input, and
  that the agent must say in its output what it did with it, including *"ignored, because…"*.
- `.claude/skills/series-episode-theme-generation/SKILL.md` and
  `series-episode-theme-selection/SKILL.md` — add the audience-advice input by **role**, not by
  value (the skill must stay project-agnostic per `skill-creation.md`). Note the live tension:
  `CLAUDE.md §6` says legacy episodes are "not ground truth for calibration" while these ARE the
  only videos we have data on. Flag it for the Director; do not silently reconcile it.

---

## Verification

**Static** — `npx tsc --noEmit`, `npm test -- --run` (baseline 1430; expect a small net change
from deleted `holeCards` tests plus new ones), `npm run replay-pilot`.

**New unit tests**
- due-point computation: a point is due only after `liveAt + delay`; a non-public video yields
  no due points; an already-collected point is not re-emitted.
- trigger route: EXEC-ANAL with no `youtube_video_id` raises `ValidationError` rather than
  dispatching.

**Runtime — this is the one that counts.** Static green proves nothing here; the whole defect
class today was code that read correctly and behaved wrongly.
1. Rebuild + restart the stack, `PUT /api/inngest` → `"Successfully registered"`, confirm
   `analytics-collect-cron` appears and `schedule-analytics` is gone.
2. Manually trigger EXEC-ANAL on a published episode (e.g. SS-S15-E25 / `PHRbzx1qAHg`).
   **Expect: a COMPLETED `EXEC-ANAL` job and the first-ever `REV-analytics` asset.** Verify by
   querying the DB — the count must go 0 → 1. Then open the asset and check `views` matches the
   live public counter, not the Analytics number.
3. Wait one cron tick (≤1h) and confirm it emitted only *due, uncollected, public* points —
   check the Inngest run and the resulting job rows.
4. Open the Audience tab: no ten constant "Untested territory" cards; either data-derived cards
   or an explicit "no readable signal yet" note.
5. Confirm a `REV-analytics_advice` asset exists for the series, and that a theme-stage agent
   run receives it in its inputs.

**Out of scope, log to backlog**
- `&list=` in the Short backlink — separate, pending the incognito check on `PLVJB9rPJ6q2g`.
- `persistShortId` stores ONE Short per episode (scalar `youtube_short_id`), while the doctrine
  mandates 3–5; the four Vending Shorts are absent from the ledger entirely, and nine episodes
  have a Short but no recorded parent. Per-gag attribution is blocked by the data model.
- `isShortTitle` decides format by title regex; `durationSeconds` is now available and unused.
- `impressions` / `impression_ctr` / `subscribers_gained` / `traffic_sources` are hardcoded `0`
  in `collectAudienceSnapshot`, which makes the `head-of-growth` diagnostic ladder unwalkable
  past step 1.
- `loops` is likely not obtainable from the API at all, yet the quality-sensor doctrine names it
  the primary short-form virality signal. `shares` IS available and simply not requested.
- `docs/distribution/strategy.md` contradicts the `shorts-longform-distribution` skill on
  cadence, Shorts-per-episode, and reframing — and carries the centre-crop advice the skill
  later disproved.
