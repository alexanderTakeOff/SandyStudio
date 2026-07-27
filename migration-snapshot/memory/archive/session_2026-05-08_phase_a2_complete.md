# Session 2026-05-08 — Phase A.2 COMPLETE

## What landed in master (PR #22 merged)

**Phase A.2 = VGEN auto-COMPLETE + EXEC-STITCH + Audio reorg + Bug A/C + 5 STITCH iteration fixes.**

### End-to-end verified

- SS-S14-E01 13/13 APPROVED VID-shots stitched into `final-cut-...-f7c356accd9e.mp4` (3.99 MB, 0:32.75, H.264 720p + AAC stereo + Flacon Pop Loop music).
- Output path: `C:\SandyStudio\.claude\worktrees\agitated-lederberg-a292d3\webapp\public\staging\final-cut-4809684a-...mp4`

### Major changes

| Area | Files |
|---|---|
| Auto-COMPLETE | `app/api/assets/[id]/approve/route.ts` (VID-shot branch) |
| EXEC-STITCH agent | `lib/agents/providers/ffmpeg-stitch.ts`, `inngest/functions/exec-stitch.ts`, `lib/agents/{registry,gate,factory,types}.ts`, `lib/inngest/{client,concurrency}.ts`, `lib/agents/runner.ts` (EXEC-STITCH case) |
| Audio reorg | `app/api/assets/[id]/approve/route.ts` (MGEN→world_check, EDIT gate on EREF+music), `lib/agents/runners/animatic-slideshow.ts` (bake music_url into v1 contract), `app/api/episodes/[id]/eref/advance/route.ts`, NEW `app/api/episodes/[id]/skip-music/route.ts`, `inngest/functions/exec-edit.ts` (remove MGEN fan-out) |
| Bug A | `components/timeline/EpisodeTimelineSection.tsx` (`setPreviewAssetId(newAssetId)` in handleRegenerated) |
| Bug C | `components/animatic/AnimaticPlayer.tsx` (animaticStatus prop hides footer past REVIEW), wired in EpisodeTimelineSection + AssetPreview + EpisodeAssetDrawer |

### STITCH iteration fixes (in `lib/agents/providers/ffmpeg-stitch.ts`)

1. Backslash → forward slash in concat list
2. `os.tmpdir()` → `realpath()` to expand 8.3 short names
3. FS direct read (bypass /staging middleware auth)
4. Relative URL `/staging/` resolve to `webapp/public/`
5. `resolveFfmpegPath()` with `FFMPEG_PATH` env var + Windows winget fallback (`%USERPROFILE%\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_...\bin\ffmpeg.exe`)

## Director's setup state

- ffmpeg installed via `winget install ffmpeg` (Gyan.FFmpeg 8.1.1) → in User PATH.
- Dev servers managed by Claude Preview (`.claude/launch.json` — `autoPort: false`):
  - next-dev port 3000
  - inngest-dev port 8288
- His `npm run dev` runs from `C:\SandyStudio\.claude\worktrees\agitated-lederberg-a292d3\webapp\` (the same worktree as my work — HMR shares files).
- Master branch is canonical; `feat/phase-a2-rolling` deleted post-merge.
- Director's MAIN worktree `C:\SandyStudio\` was on stale `feat/bible-enrich-button` branch (381 commits behind) — needs `git pull` + checkout master if he wants to work there.

## Open backlog (not started)

- **Bug D (silence after 13/13)** — Videomatic toolbar should show STITCH running/completed status pill. Currently no visual indicator.
- **PHASE 1.5**: variants_per_generation (LT-07), regenerate auto-demote, vgen_defaults UI, buildShotPromptV2 enrichments (LT-14).
- **Storyboard arc-continuity checker** — root cause for Sandy emotion jumps. Deferred until next episode.
- **Mode 2.5** (LT-01) + Skill Editor (LT-05).
- **UI cleanup** (LT-10..13): scalable timeline 60+ shots, episode page cleanup, foldable Activity Feed, Activity Feed time filters.

## Director's UX rules (persistent)

1. No auto-merge — always wait for explicit "merge" command.
2. Smoke tests propose, don't auto-fire (CLAUDE.md §10).
3. Preferred workflow: rolling branch + HMR shared worktree, single PR at end (Variant C).

## Resume cmds

```
cd C:/SandyStudio/.claude/worktrees/agitated-lederberg-a292d3
git pull origin master
# dev servers via Claude Preview tools — preview_start name=next-dev / inngest-dev
```

## Director quote 2026-05-08 19:20

> "ты просто гений! ... можно мержить ! ПОЗДРАВЛЯЮ!"
