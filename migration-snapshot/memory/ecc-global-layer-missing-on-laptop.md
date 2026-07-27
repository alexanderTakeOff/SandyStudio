---
name: ecc-global-layer-missing-on-laptop
description: The ECC global layer was lost in the laptop move and was RESTORED from the desktop on 2026-07-19 — what came back, what was deliberately skipped, and why the project key changed.
metadata: 
  node_type: memory
  type: project
  originSessionId: db82fb2e-10e2-40ba-abd3-828b2871c745
  modified: 2026-07-19T17:41:52.602Z
---

**RESOLVED 2026-07-19.** The ECC global layer never moved with the repo (the boundary is
git: everything under the repo's `.claude/` survived, everything user-global did not). It
was restored from the desktop machine (user profile `NAVIA VISION ONE`) via two zip
transfers.

Restored into `C:\Users\Alexander\.claude\`:

| Layer | Count |
|---|---|
| `skills/` | 72 |
| `commands/` | 65 (incl. `/save-session`, `/resume-session`) |
| `agents/` | 29 |
| `rules/common/` | 15 |
| `session-data/` | 94 `.tmp`/`.md` handoffs (2026-05-12 → 07-16) |
| memory | 130 files + 18 in `archive/` |

Also restored: `settings.json` (the three every-turn hooks — anti-additivity before/after
+ COMPASS re-anchor; `language: russian`; `model: opus[1m]`) and the
`codex@openai-codex` plugin (v1.0.5 cache + marketplace).

**Why:** three things do NOT transfer verbatim and will bite on the next move.

1. **The project key changed.** Memory lived under `~/.claude/projects/C--SandyStudio/`;
   the repo now resolves to `C--Users-Alexander-sandystudio`. Memory copied to the new
   key or it is invisible.
2. **Desktop paths are embedded in the plugin registry.** `known_marketplaces.json` and
   `installed_plugins.json` hardcode `C:\Users\NAVIA VISION ONE\...` — both were rewritten
   to `C:\Users\Alexander\...` by hand.
3. **Seven ECC entries were deliberately NOT installed**, because they now exist as
   BUILT-IN Claude Code skills and the user-level copy would shadow the newer built-in:
   skills `deep-research`, `claude-api`, `security-review`; commands `code-review.md`,
   `verify.md`. Plus `pa-recent.md` / `pa-summary.md`, which are already git-tracked in the
   repo's `.claude/commands/`. They remain available in the staged copy at `C:\_layer` if
   ever needed.

**How to apply:** the production pipeline does NOT depend on ECC — runners live in
`webapp/lib/agents/*` and `agents/*.md` are specs, not executable ECC code. A missing ECC
skill is never a pipeline failure; do not chase one as a bug. When adding a NEW command
the Director will rely on, prefer writing it as a PROJECT command in `.claude/commands/`
so git carries it through the next machine move. Staged copies kept as insurance:
`C:\_layer\`, `C:\Users\Alexander\claude-layer.zip`, and
`~/.claude/settings.json.bak-2026-07-19`. See
[[session_2026-07-18_19_pipeline-caps-viewer-rule]] and [[harness_trim_skills_library]].
