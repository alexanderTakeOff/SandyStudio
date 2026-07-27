---
name: Operational-Ritual hooks live
description: 5 hooks in `.claude/hooks/` enforce CLAUDE.md §12 rituals — soft-warn by default, Hook C blocks push on verify fail, kill-switch SANDY_HOOKS_OFF=1.
type: reference
originSessionId: c9349de9-9072-46cf-8c65-48068e3165d4
---
# Operational-Ritual hooks — live since 2026-05-12

Wired in `.claude/settings.json`. Sources in `.claude/hooks/`. All hooks read JSON
from stdin (PreToolUse / Stop) or take no input (SessionStart). All default to
exit 1 (soft-warn, message goes to stderr → Claude sees and surfaces to Director).
Hook C is the only blocker (exit 2) and only on actual verify failure.

| Hook | File | Trigger | Ritual | Default | Override |
|---|---|---|---|---|---|
| **A** | `plan-md-staleness-check.cjs` | SessionStart | 2 (session-start sanity) | exit 1 if PLAN.md `Date:` > 3 days | — |
| **E** | `parallel-session-warn.cjs` | SessionStart | parallel-session cap | exit 1 if > 3 worktrees | — |
| **B** | `plan-md-update-guard.cjs` | PreToolUse Bash matcher | 1 (PLAN.md update in same session) | exit 1 if `git commit*` on code but PLAN.md not staged | `# no-plan-update` in commit msg |
| **C** | `verify-trio-on-push.cjs` | PreToolUse Bash matcher | 3 (verify trio) | runs `npm run verify` on `git push*`, **exit 2 if tsc/tests fail** | `# no-verify` or `--no-verify` |
| **D** | `session-end-memo-check.cjs` | Stop | 4 (session-end memo) | exit 1 if meaningful work but no `session_YYYY-MM-DD_*.md` today | — |

Helper: `lib/git-changed.cjs` — shared file-categoriser (code/docs/tests/other), used by B + C.

## Kill-switch

`SANDY_HOOKS_OFF=1` env var → every hook exits 0 silently. For Director use
when emergency override needed.

## Worktree behavior

`.claude/` is git-tracked. Each worktree has its own copy. New hooks must be
copied to **both** main repo (`C:/SandyStudio/.claude/hooks/`) AND active
worktree (`<worktree>/.claude/hooks/`). They sync via merge to master.

settings.json paths point to main repo's `C:/SandyStudio/.claude/hooks/` —
this is the canonical location. Worktree-specific settings.json can override
but isn't necessary if main path is in sync.

## Activation timing

New hooks land on next SessionStart, NOT mid-session. Edits to
`.claude/settings.json` don't reload in current session. To verify new hooks
work, open a fresh Claude Code session and watch for stderr warnings on
session start.

## Where to find

- Worktree paths (this branch): `<worktree>/.claude/hooks/<file>.cjs`
- Canonical paths: `C:/SandyStudio/.claude/hooks/<file>.cjs`
- Settings: `C:/SandyStudio/.claude/settings.json` + worktree mirror
- Plan that birthed them: `~/.claude/plans/purrfect-stirring-hollerith.md` Task 2
- Session memo (full context): `session_2026-05-12_claude_md_slim_plus_5_hooks.md`

## Why this matters

CLAUDE.md §12 Operational Rituals were added 2026-05-10 as **manual discipline**
after quality degradation audit. Memory rules don't reliably survive `/clear` or
worktree switches. Hooks shift enforcement from "Claude remembers" to "harness
enforces". Director directive 2026-05-10: convert rituals from "discipline" →
"life support".
