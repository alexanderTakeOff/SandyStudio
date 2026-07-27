---
name: office-pickup-2026-07-17-ffmpeg-glob
description: Pick-up list for the office desktop after the 2026-07-17 laptop session — three hardcoded-path fixes pushed (ffmpeg glob, hook paths, .codex); restore settings.local.json after pulling, then re-trigger EXEC-VCRIT on E29/SH01.
metadata:
  node_type: memory
  type: project
  originSessionId: e6f4796b-cb36-4b4f-9854-14bad44c78f4
---

Laptop session 2026-07-17. Everything is pushed to `master`; the tree was clean at
the end. (The laptop rebooted on its own overnight — nothing was lost.) Three commits,
all the SAME root cause: **a hardcoded machine-specific path that rotted silently**.

## What landed

- **`d33d9dab` — ffmpeg glob.** EXEC-VCRIT failed "ffmpeg could not be launched" on
  E29/SH01 while ffmpeg 8.1.2 sat on disk working. The winget fallback was pinned to
  `ffmpeg-8.1.1-full_build` (ffprobe to `7.1`) — directories a winget upgrade had
  removed — so the fallback silently never fired. Now globs the winget tree, newest
  build wins. Five duplicated copies of the resolution dance collapsed into one
  (`runFfprobe` / `probeDurationSeconds` in `ffmpeg-stitch`). tsc clean · vitest 1350/1350.
- **`2824f606` — hook paths.** All 10 hooks were dead on any machine that isn't the
  desktop: `settings.json` (git-tracked, shared) pinned them to `C:/SandyStudio`. So
  governance — mode-validator's `===1===` gate, naming-validator, locked-status-guard,
  plan-md-update-guard — simply wasn't running off the desktop. Now exec form with
  `${CLAUDE_PROJECT_DIR}`; the scripts derive the repo root from `__dirname`.
- **`47b493c1` — .codex + untracking.** `.codex/hooks.json` is a real supported
  per-repo location (docs confirmed it; a web summary claiming otherwise was wrong).
  No `CODEX_PROJECT_DIR` exists, so its 10 commands use the documented
  `$(git rev-parse --show-toplevel)`. Plus settings.local.json untracked — see below.

**On the desktop the hooks worked before and still work** — `${CLAUDE_PROJECT_DIR}`
resolves to `C:/SandyStudio` there. Nothing to redo.

## REQUIRED on the desktop — restore settings.local.json after pulling

That file was committed, so both machines fought over one file whose entries are
machine-specific by nature (that fight was the recurring `local-claude-settings`
stash). It is now untracked + gitignored, so **pulling deletes the desktop's copy** —
the deletion is what got committed. Restore the desktop's own version, which still
has the `C:/SandyStudio/...` entries that are correct THERE:

```
git show 2f94b16e:.claude/settings.local.json > .claude/settings.local.json
```

Do NOT copy the laptop's copy over — its `C:/SandyStudio` entries were stripped
precisely because they are dead on the laptop and live on the desktop. After the
restore each machine keeps its own file and they stop colliding.

## Then

1. `git pull` on `master`.
2. Restore settings.local.json (above).
3. `start-stack.ps1 -Build` — these are **code** changes, a plain restart is not enough.
4. **Re-trigger the Visual Critic on E29 / SH01** — the one open thread. It never
   produced a verdict, it only ever skipped.

No ffmpeg setup needed: the office reported it installed and working, and the glob
resolves it without `FFMPEG_PATH` anyway (verified with PATH stripped and the env var
unset). `.env.local` is gitignored and never travels between machines — do not expect
the laptop's `FFMPEG_PATH` to exist there.

## Laptop-only, do not carry over

- The laptop's running stack is stale (pre-fix code). If the laptop is used again it
  needs `start-stack.ps1 -Build`, not just a restart.
- `git stash@{0}` "local-claude-settings" is now **obsolete** — it holds a diff against
  a file that is no longer tracked. It was kept while the file was still in git; that
  reason is gone. Safe to drop (`git stash drop`), pending the Director's OK.

## Done, no action needed

Dead worktree `claude/sandystudio-folder-git-sync-6e1096` deleted with the Director's
OK. Nothing lost — its commits were already in `origin/master` and its only diff was
machine-local settings plus `package-lock.json` churn re-syncing an already-declared
`sharp` dependency. Only `master` and the stale `claude/enhance-video-quality-AcRTn`
(untouched, from 2026-05-07) remain.

## The durable lesson

Never pin a machine path or a package-manager version string in code — winget bumps
versions silently, and a repo gets checked out at different absolute paths on
different machines. Both rot with no test noticing. A full sweep confirmed
`C:\SandyStudio` lived ONLY in hooks and stale permission entries; `.ps1`/`.cmd`/
`.ts`/`.yaml` are clean, so the launcher (`90f2133c`) really was path-agnostic.
Derive from `__dirname` / `${CLAUDE_PROJECT_DIR}` / git root instead. Duplication is
what let the rot spread unseen — the ffmpeg resolver had five copies, the hooks two.
