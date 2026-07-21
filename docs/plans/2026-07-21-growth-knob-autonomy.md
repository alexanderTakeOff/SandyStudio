# Head of Growth — knob autonomy + changelog (delta plan) & session close

## Context

Director's answers this turn: **q1a** (build the growth loop, not the browser robot),
**q2y** (the growth role turns packaging / cadence / format knobs *itself*, **but reports
"what it turned"**), **q3 → backlog** (Studio-only browser tricks are parked, on-call only).
Director is switching desktop → laptop and wants this committed, pushed, and linked.

**Critical finding — a parallel session already landed most of q1a.** While this session was
exploring, commits `b4c7b9d7` and `35744888` appeared on `master` from another window:
`docs/plans/2026-07-21-feedback-loop-close.md` is an approved plan covering the collection arm
(EXEC-ANAL has never once run — 0 `REV-analytics` assets), the honest advice board, and the
correction arc. **Do not re-plan any of it.** This file is only the *delta* that plan does not
cover, plus the session-close chores.

**Conflict to resolve, not to silently reconcile** (`skill-creation.md` — escalate, don't pick a
winner alone): that plan records "the machine **PROPOSES** and the Director decides (no
auto-apply yet)". This session's **q2y** says the role turns knobs itself with a report. Both
are Director rulings, ~30 minutes apart, on different windows.

**Proposed resolution, carried into the plan below and to be confirmed in one line next
session:** split by reversibility, not by ambition.

| Knob | Who turns it | Why |
|---|---|---|
| Packaging of an already-live asset (title, description, tags, thumbnail) | **Machine, автономно** | Fully reversible, no spend, no new creative. This is what q2y bought. |
| Cadence + scheduled publish time (`publishAt` on an already-approved upload) | **Machine, автономно** | Moves a date, does not create or expose anything new. |
| Theme / format of the *next* episode | **Machine proposes, Director decides** | This is the creative gate and the parallel plan's explicit Director ruling. Costs money downstream. |
| Publish, unlist, spend | **Director only** | CLAUDE.md §6 hard limit, unchanged. |

Outcome: the machine starts turning the two cheap, reversible knobs on its own and leaves a
readable trail of every turn; the expensive knob stays a proposal until the Director lifts it.

---

## Part 1 — q2y: knob autonomy with a changelog

Reuse, do not invent, the storage the parallel plan is already introducing: a **series-scoped
asset** (`series_id` set, `episode_id = null`) following the model in `lib/api/series-themes.ts`.
The advice report lands there as `REV-analytics_advice`. **The changelog is the same asset, not a
second one** — each entry carries what was advised *and* what was actually done:

- `proposed` — the advice card (already produced by `buildAdvice()`,
  `webapp/lib/agents/analytics-advisor.ts`).
- `applied` — `null` (proposal only) or `{ knob, before, after, at, actor }`.
- `skipped_reason` — when the machine chose not to act. Silence is not an acceptable entry.

Acting muscles already exist — no new provider code:
- packaging → `updateVideoMetadata()` and `setThumbnail()`, `webapp/lib/agents/providers/youtube.ts`.
- scheduling → the `publishAt` path in `uploadVideo()` / the same metadata update, same file.

The one new thing is the **gate before the write**: only touch a video whose
`publicationState === 'public'`, only one knob per video per cron tick, and always write the
changelog entry in the same step as the mutation (never mutate, then fail to record).

**Report surface:** render the `applied` entries as a "что покрутили" strip on the **existing**
Audience tab (`webapp/app/(studio)/audience/page.tsx`) — no second page (`PLANET.md`:
"Audience tab sensor ALREADY BUILT … No second panel").

## Part 2 — the responsible role, without a 27th agent

The Director asked for "ответственный агент". The subtractive answer: the role needs an **owner
and a duty**, not new runtime. `.claude/skills/head-of-growth/SKILL.md` is already the playbook;
`EXEC-ANAL` (`agents/exec/analytics_collector.md`) already owns reading the audience and
`EXEC-PUB` (`agents/exec/publisher.md`) already owns acting on the platform. A third agent would
duplicate both.

So, per `train_personnel_doctrine` (a change touching agent inputs MUST touch the agent docs):
- `agents/exec/analytics_collector.md` — add the Head-of-Growth mandate: read the signal, decide
  the knob, and *state the decision including "did not turn, because…"*.
- `agents/exec/publisher.md` — add: packaging and scheduling changes may now originate from the
  growth loop, and every such change writes a changelog entry.

If the Director later wants a literally named Head of Growth, it is a *rename of EXEC-ANAL's
mandate*, not a new agent — decide that at Mode 9 / the Responsibility Matrix, not now.

## Part 3 — q3: park the browser trick

Backlog entry (PLAN.md `Open` + a memory note), explicitly **not built**:

> **Studio-only knobs via browser (parked, on-call).** No API exists for: channel banner
> (`channelBanners.insert` returned 404 live on 2026-07-16), Community posts, thumbnail
> A/B "Test & Compare", end screens/cards, Shorts sounds. Claude in Chrome can drive Studio,
> but only with the Director present in a live Chrome window — never headless, never on a cron.
> Rationale for parking: these are cosmetics, not levers (same class as playlists and publish
> time, both disproven 2026-07-21); automating a live channel's UI is also a ToS grey zone.

## Part 4 — session close (do-now, this turn after approval)

1. Update `PLAN.md ## CURRENT STATE` (Ritual 1): today's Director rulings q1a/q2y/q3, the
   knob-split table in one line, and the pointer to *both* plans — the parallel
   `docs/plans/2026-07-21-feedback-loop-close.md` and this delta.
2. Copy this plan into the repo as `docs/plans/2026-07-21-growth-knob-autonomy.md` so it
   travels to the laptop (the `~/.claude/plans/` copy does not).
3. Commit + **push to `master`** (`rules/common/git-workflow.md`: push on master is the default;
   this is docs-only, so no build gate).
4. Session-end memory note (Ritual 4) `session_2026-07-21_growth-knob-autonomy.md` +
   `MEMORY.md` index line, naming the propose-vs-autonomy conflict as the first thing to
   confirm next session.
5. Hand the Director the link:
   `https://github.com/alexanderTakeOff/SandyStudio/blob/master/docs/plans/2026-07-21-growth-knob-autonomy.md`

## Verification

Docs-only in this turn → per CLAUDE.md §12 Ritual 3, **the verify trio is skipped and that is
stated explicitly**; no code is touched here.

Before starting Part 1/2 code next session:
- confirm the knob-split table with the Director in one line (the conflict above);
- then the real gate is runtime, not static: after the first autonomous knob turn, open the
  video on YouTube and confirm the change is live **and** a matching `applied` entry exists —
  never trust a COMPLETED job (`verify_real_results_not_logs`).
