# HANDOFF — Resurrect the Distiller (the dead half of the learning loop)

**For:** a separate feature-session with an audit brief.
**From:** HoG/distribution session, 2026-07-23.
**Project:** SandyStudio (`C:\Users\Alexander\sandystudio`).
**Mode note:** file writes to project content need `===5===` from the Director. Audit/read is `===1===`-safe.

---

## TL;DR

The studio's self-learning loop is **half-built and running write-only.** The *capture* half is
alive and aggressive; the *distill* half (raw signal → updated skills/rules) **was designed but
never built.** Six weeks of training signal — including today's HoG findings and two live HoG
code-bugs — sit unprocessed in a 535 KB append-only buffer that nothing ever reads back.

**The task is not to invent a new learning system. It is to build the missing distiller** — one
mechanism that serves every agent. HoG is merely the trigger case that exposed the gap. Do NOT
build a parallel HoG-specific journal (anti-additivity).

---

## Runtime evidence (verified 2026-07-23, not from a design doc)

| Fact | Proof |
|---|---|
| Capture hook is LIVE | `.claude/hooks/training-capture.cjs`, wired as UserPromptSubmit in `.claude/settings.json` (~line 99). Appends every Director message's training-signal RAW to the inbox. |
| Inbox is huge & fresh | `.claude/training-inbox.md` = **535 KB**, ~5,980+ lines, last modified during this very session (it captured today's prompts). |
| Distiller does NOT exist | No distiller script anywhere (`.claude/hooks/` holds only the capture hook; `find` for `*distil*`/`*skill-updat*` = empty). No cron/schedule reference in settings. `CronList` (session) empty. |
| Loop is write-only | Inbox has **171 `NEW` vs 2 `PROCESSED`**. Entries dated **2026-06-09 are still `NEW`** — ~6 weeks unprocessed. |
| Committed state | Inbox captured & committed at `67c5b084` (2026-07-23). |

**Conclusion:** the "daily 15:00 distiller" described in the inbox header is vaporware. Signal
goes in; nothing comes back to skills. This is the classic half-loop — and it silently blocks
ALL agent self-improvement, not just HoG.

---

## Existing pieces to REUSE (do not rebuild)

- **Capture hook + inbox format.** Entry schema is documented in the inbox header
  (`## <ISO date> · <source> · <status> · <tentative target skill/rule>` + raw snippet).
  Keep it. The distiller consumes this format.
- **`<skill>-history.md` convention** — pruned-from-skill detail goes here; info is never deleted.
- **The designed (deferred) spec — read before building:**
  - `specs/company/governance.md §4` — Skill Editor / Learning Loop (Mode 2.5 Phase B, DEFERRED).
  - `docs/skills-as-capabilities.md` — "Learning Loop — Director feedback default path".
  - `agents/exec/concierge.md` — `concierge_turns.event_type` enum already provisions
    `feedback | rejection | rule_proposal | ...` for the future Skill Editor (no schema migration needed to start).
  - Migration `0026_skill_rules.sql` referenced as the DB-backed Path B.
  These describe the HEAVY version. The MVP below is lighter — but align with them so the MVP can graduate.

---

## Audit scope for the feature-session

1. **The learning loop itself** — confirm what of the designed Skill Editor / Learning Loop exists
   in code vs is vaporware. Map capture → (missing) distill → skills.

2. **Inbox hygiene** — 535 KB unbounded append-only buffer is *itself* now the "catastrophic growth"
   the design warned against. The distiller must prune/size-cap and route detail to history.

3. **HoG analytics bugs ALREADY logged in the inbox — VERIFY AT RUNTIME (overlay-on-logs doctrine;
   these are inbox claims, not yet confirmed by me against the live code):**
   - `collectAudienceSnapshot` (in `youtube-stats.ts` return block) reportedly **hardcodes
     `impressions:0, ctr:0, subscribers_gained:0, traffic_sources:{}`**, and `/api/audience` never
     requests them → the **HoG diagnostic ladder is unexecutable** (its step 1 branches on impressions,
     which are always 0; `specs/distribution/analytics.md` Warning threshold `Impression CTR < 2%`
     would trip on every episode forever).
   - `biggestDrop` (`analytics-advisor.ts:211-221`) reportedly returns the **largest single
     sample-to-sample fall unsmoothed** → on every YouTube curve that's the universal opening-seconds
     bounce → the card blames a per-episode shot that isn't the problem and misdirects the Storyboarder.
   - `route.ts:75` — `if (kind === 'longform' && a && a.views > 0)` → **newly published videos never
     get a retention curve pulled, exactly when it matters.**
   These three are why HoG's *automated* diagnosis can't run today. Fixing them is what lets the
   distiller feed HoG real validated evidence instead of hardcoded zeros.

---

## Design requirements for the distiller

1. **Read the inbox, group entries by target skill/rule.**
2. **Rule-maturity ladder (each rule tagged with evidence + N + date):**
   - `HYPOTHESIS` (1 signal) → record, do NOT act.
   - `PROVISIONAL` (2-3 consistent, VALIDATED) → apply + feed production, flagged revisable.
   - `CANON` (sufficient N + survived a deliberate counter-test) → hard rule.
   - Demote on contradiction.
3. **Prune + size-cap skills**; move pruned detail to `<skill>-history.md` (never delete info).
4. **Mark processed entries `[PROCESSED]`.**
5. **Verify-the-measurer gate:** only distill metrics past the platform processing lag, cross-checked
   against an aged control. A number inside the lag window is noise, not evidence.
6. **NEW feature the original design lacks — delayed validation for metric-lagged evidence.**
   Growth experiments' outcomes are unknown at capture time (YouTube Analytics API lags ~2-3 days;
   a fresh upload reads as false-zero). Add a status `PENDING-VALIDATION <unlock-date>`: the distiller
   SKIPS it until the date, then pulls the validated metric and only then distills it (with N). This
   is the one genuinely new requirement HoG surfaces; without it, growth lessons distill on noise.

---

## Build options (recommend MVP = a)

- **(a) Assistant-ritual `/distill` [RECOMMENDED MVP].** A session/slash-command where the agent
  reads the inbox → matures + updates skills → marks `[PROCESSED]` → prunes to history. Zero new
  infra; the intelligence is already the agent. Unblocks the 6-week backlog immediately. Can run tonight.
- **(b) Automated script + schedule.** The designed daily-15:00 version (node script + Windows Task
  Scheduler / cron). Build after (a) proves the distill logic.
- **(c) Full DB-backed Skill Editor** (`governance.md §4`, migration `0026_skill_rules.sql`). The heavy,
  deferred version. Only if volume/UX demands it.

Recommendation: ship (a), graduate to (b) once the distill logic is trusted, (c) only if warranted.

---

## First payload for the resurrected distiller

1. **Today's HoG learnings** (already in inbox + summarized in memory
   `backlog_shorts_reach_no_sub_conversion_seriality.md`):
   - PROVISIONAL (N=2): shorter Shorts (≤~35s) retain better than long (52s > 75s). → already
     hand-distilled into `storyboarder-situational-comedy` "Shorts retention shape" (commit `5075b8df`)
     as the worked example of manual distillation done right.
   - HYPOTHESIS (N=2): below-median `relativeRetentionPerformance` caps escalation → 0 subs.
   - HYPOTHESIS (N=0, untested): seriality drives sub-conversion. Design Airport 1-4 as the counter-test.
2. **The two HoG code-bugs** above (impressions hardcoded 0; biggestDrop false-flag).
3. **~6 weeks of backlog** (162 NEW entries since 2026-06-09).

---

## Open questions for the Director (feature-session)

- **q(new)1 —** Build order: MVP ritual (a) first, or straight to automated (b)?
- **q(new)2 —** Fix the 3 HoG analytics bugs inside this feature-session (they block HoG automated
  diagnosis), or split into a separate ticket?
- **q(new)3 —** Inbox pruning policy: hard size-cap (e.g. keep last N KB + archive rest to
  `training-inbox-history.md`), or age-based (archive `[PROCESSED]` older than X)?

---

## File/path index

- Capture hook: `.claude/hooks/training-capture.cjs` · wired in `.claude/settings.json`
- Buffer: `.claude/training-inbox.md` (committed `67c5b084`)
- Designed spec: `specs/company/governance.md §4`, `docs/skills-as-capabilities.md`, `agents/exec/concierge.md`, migration `0026_skill_rules.sql`
- HoG skill: `.claude/skills/head-of-growth/SKILL.md`
- HoG analytics code to audit: `webapp/lib/agents/providers/youtube-stats.ts`, `webapp/lib/agents/analytics-advisor.ts`, `webapp/app/api/audience/route.ts`
- Today's memory: `backlog_shorts_reach_no_sub_conversion_seriality.md`
- Worked example of manual distillation: commit `5075b8df` (storyboarder Shorts-retention rule)
