# Git Workflow

## Commit Message Format
```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Note: Attribution disabled globally via ~/.claude/settings.json.

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

> For the full development process (planning, TDD, code review) before git operations,
> see [development-workflow.md](./development-workflow.md).

## Pre-Save Checkpoint (MANDATORY)

> **Personal directive from the Director. Cross-project.** Established 2026-07-10.

Before running `/save-session` (or any session-ending handoff/`/clear`):

1. **ALWAYS commit first.** No save-session over uncommitted work — commit the working
   changes so the session state is reproducible from git, not just from the handoff note.
2. **Then remind + ask the Director** whether we also need to **push** and/or **merge**
   (e.g. feature branch → master, or push master to origin). Do not silently assume — surface
   the current git state (branch, unpushed commits, unmerged branch) and let the Director decide.

Commit = non-negotiable before save. Push/merge = confirm with the Director each time.
