# PLAN.md is a living anchor — update it in the same session as code

**Established:** 2026-05-10 after Director observed quality degradation.

## What happened

Between 2026-04-30 and 2026-05-10 the codebase shipped Phase A.1, Phase A.2
(VGEN auto-COMPLETE + EXEC-STITCH + Audio reorg + Bug A/C/D), and started
Mode 2.5 Phase 1 — **but PLAN.md `## CURRENT STATE` was not touched**.

Director's accurate diagnosis: «процесс стал не такой системный, как был
раньше». Quality degraded because every new session anchored on a 10-day-old
PLAN.md and had to reconstruct the real state from git log + user messages +
fragmented memory notes. Result: less ritualised verification, less reference
to CLAUDE.md rules, less "exit criteria" thinking.

## The rule (now in CLAUDE.md §12)

Four rituals make PLAN.md a **living anchor**:

1. **Update PLAN.md in the same session as code change.** Before push / PR
   create / task close. One paragraph in lines 11–24. Same session, not
   "later".
2. **Session start sanity check.** If PLAN.md `Date:` is more than 3 days
   old, flag the Director before starting — do not anchor on stale state.
3. **Verify trio published as numbers.** `npx tsc --noEmit` + `npm test --run`
   + `npm run replay-pilot` — counts visible in chat.
4. **Session-end summary note.** `session_YYYY-MM-DD_<title>.md` in memory,
   linked from `MEMORY.md` index. Covers landed work, commits, PLAN.md
   updates, verify result, what's open.

## Parallel-session rule

Only one active worktree owns PLAN.md updates per day. Default: whichever is
on master / merging next. Other sessions read PLAN.md, hand notes to the
PLAN-owner. Hard cap suggestion: 2 active parallel worktrees + main.

## Why this is non-negotiable

§9 CLAUDE.md says every session reads PLAN.md first. If PLAN.md lies, every
session starts wrong. Hooks can't fix this — it's a discipline ritual. The
ritual is now codified in CLAUDE.md §12 and surfaced in every session via
the §9 → §12 chain.

## Signal that the ritual is working

- PLAN.md `Date:` field rarely older than 24h
- `git log -- PLAN.md` shows non-`auto-sync` commits matching feature work
- Memory `session_*` notes exist for each completed task block
- Verify trio numbers appear in chat after code changes
