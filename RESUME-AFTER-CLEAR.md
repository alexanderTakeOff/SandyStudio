# RESUME-AFTER-CLEAR — read first after `Clear this session`

**Session ended:** 2026-05-02
**Branch:** `claude/agitated-lederberg-a292d3` (auto-sync hook commits frequently — check `git log -20 --oneline`)
**Latest master commit:** `39c83db` — feat: EXEC-BIBLE-AUTHOR + prompt edit + provenance (PR #5 squash-merged)

---

## TL;DR — Where we are

We just finished **4 slices (A+B+C+D)** of a major upgrade. All code in working tree, **NOT yet in a PR**. Tests + tsc green. Director chose to **start a brand-new clean series ("флакон духов" / perfume bottle)** to walk through the new system manually. He had not yet provided the q1-q5 inputs (name/premise/hero/location/style) before clearing the session.

When session resumes — **first ask Director for the q1-q5 inputs to seed the new series**, then unblock him as he walks through the UI.

---

## State of the worktree

- `npx tsc --noEmit` clean
- `npm test` 110/110
- `npm run replay-pilot` 29/29
- Both dev servers (next-dev :3000, inngest-dev :8288) **must be started** via `preview_start` MCP

### Slices A+B+C+D — coded, not committed

Auto-sync hook commits locally on `claude/agitated-lederberg-a292d3`. Director said "коммит/PR только по моей команде" so nothing is in a PR yet.

| Slice | What | Files |
|---|---|---|
| **A** | Generic Mode-aware Asset Drawer + Upload | `lib/api/series-bible.ts` (provenance + mode_at_time + history.source += director_upload), `lib/governance.ts` rewritten (`{allowed, requiresDirector, autoFireAllowed, modeAtTime, category}` + action-category map A/B/C), `lib/api/asset-prompt-builder.ts` NEW, `app/api/assets/[id]/{regenerate-image,enrich,upload}/route.ts` NEW, `components/assets/{AssetCollapsibleSection,AssetProvenanceChip,AssetImagePromptSection}.tsx` NEW, `components/series-bible/AssetDetailDrawer.tsx` refactored, `components/series-bible/AddAssetModal.tsx` (regex → bibleSlug DRY) |
| **B** | Generic AssetGrid + Episode References Gallery | `components/assets/{AssetGrid,AssetThumb,EpisodeAssetDrawer}.tsx` NEW, `components/episode/EpisodeReferencesGallery.tsx` NEW, `app/(studio)/episodes/[id]/page.tsx` (renders gallery when stage=episode_references). Tile size = 1/8 Bible card (~36px). Drawer has ←back link. |
| **C** | Style Guardian (EXEC-STYLE-CHECK) | `lib/agents/runners/style-check.ts` NEW (Sonnet ~$0.005/check), `app/api/style-check/route.ts` NEW, `lib/api/style-guardian-config.ts` NEW (reads `app_config.style_guardian_mode`, default `warn`), wired into `regenerate-image` (warn/strict/auto_rewrite), `components/assets/StyleGuardianBadge.tsx` NEW (debounced inline chip) |
| **D** | EREF v2 (per-shot + image-to-image) | `lib/agents/providers/openai-image-edit.ts` NEW, `lib/agents/runners/episode-references.ts` rewritten — `pickShotsToReference` per-shot capped at 49, image2image via Bible LOCKED character/location ref, fallback text-only, per-shot Style Guardian pre-flight, writes `metadata.image_prompt` v01 + `source_bible_refs[]` |

### Cross-cutting (baked in for future EXEC-ORCH)

- All new endpoints call `enforceMode(action, episode, context)` returning `{allowed, requiresDirector, autoFireAllowed, modeAtTime, category}`.
- All mutating actions stamp `mode_at_time` in `provenance` + `activity_events.metadata`.
- Action category map: PUBLISH/LOCK/BUDGET/MODE_CHANGE = A; REGENERATE_IMAGE/ENRICH_ASSET = B; AGENT_RUN/UPLOAD_ASSET/EDIT_DESCRIPTION = C.

### Plan + cross-project rule files

- Plan: `C:\Users\NAVIA VISION ONE\.claude\plans\snuggly-crunching-raven.md`
- **PARTNERSHIP RULE** (new this session, applies to ALL future projects): `C:\Users\NAVIA VISION ONE\.claude\rules\common\partnership.md` — read before responding to any non-trivial request.

---

## Verified browser smoke (Slices A+B+C)

| Slice | Verified |
|---|---|
| A | Bible Drawer: provenance chip with mode_at_time, collapsible sections, Upload button (legacy + standard), prompt edit + Regenerate + History + Restore |
| B | Episode page: click EREF row → 12-thumb gallery (existing v1 IMG-episode_ref_*) renders; click thumb → EpisodeAssetDrawer with ←back link works |
| C | Style Guardian badge fetches via `/api/style-check`, displays verdict + score + tooltip with issues (verified WARN 71/100 on City Systems, real Sonnet) |
| D | tsc + tests pass; **NOT** browser-tested end-to-end (would cost ~$0.50 on real EREF v2 trigger) |

---

## What Director chose for next step

**New clean series — "флакон духов" (perfume bottle)** — manual walkthrough through UI.

Plan was: create series → enrich Bible (general_idea + 1 character `Flacon` + 1-2 locations + 1 style LOCKED, ~$0.20) → episode E01 → manual approve through pipeline (SW → SREV → SB → Continuity → EREF v2 → Animatic → Copy → Thumbnail → Publish). **Total ~$1.00**.

I asked these questions, got NO answer before clear:
- q1: Series name + code (e.g. `Flacon` / `SS-FL`)
- q2: Premise (one line — what's the show about?)
- q3: Hero description (1-2 line seed for `Flacon`)
- q4: Location seed (1 location, e.g. "antique perfumery")
- q5: Style direction one-liner (Art Deco? watercolor? noir?)

**Director will manually walk through UI**. My role = unblock if pipeline fails, diagnose errors, write small fixes if regression caught. **Bible enrichment expects only short seed text** — EXEC-BIBLE-AUTHOR expands it into full canonical entry + generates ref image.

---

## Dev servers — how to start (REQUIRED)

`launch.json` has both configs:
```
next-dev    → npm --prefix webapp run dev          (port 3000)
inngest-dev → npm --prefix webapp run inngest:dev  (port 8288)
```

Use Claude Preview MCP `preview_start` with name `next-dev` then `inngest-dev`. **Both required** — Inngest dev runs all agent functions, without it triggers fail with "401 Event key not found" because empty INNGEST_EVENT_KEY falls through to prod.

---

## Open follow-ups (post-Slice D)

| ID | What | Priority |
|---|---|---|
| q3-of-original | Brief/SW/SB/Copywriter runners emit `proposed_canon_extensions[]` like Continuity does | medium |
| q4-of-original | NotificationDot detect `decision_requested/input_requested/blocker_raised` types | small |
| q5-of-original | Real Thumbnail provider (gpt-image-1) + real YouTube Publish (OAuth) | large |
| EXEC-ORCH | Proactive orchestrator (event-driven, decides next action per Mode 1-4) | large, deferred |
| Settings UI | Toggle for Style Guardian strictness; currently via direct `app_config` UPDATE | small |
| Migration 0021 | `app_config style_guardian_mode='warn'` row insert (skipped — code falls back to `warn` default if missing) | small |

---

## Important context (gotchas)

1. **Inngest dev MUST be running** — webapp/.env.local has empty `INNGEST_EVENT_KEY=` which falls through to prod cloud (401). Local dev requires Inngest dev server on :8288.
2. **DO NOT `npm run build` while dev is running** — corrupts `.next/` chunks → 500 on every API route. Recovery: kill+rm -rf .next+restart.
3. **Bible slug regex** — `lib/api/series-bible.bibleSlug()` is single source of truth for `SBL-*` slug parsing. Never re-introduce inline regex (compound slugs like `city_systems` collapsed to `systems` in old greedy regex — fixed in this session).
4. **Verify real results, not just logs** — Director's rule: open the artifact (Drive file, content excerpt, DB row) before reporting "done".
5. **PROCESS RULE**: "коммит/PR только по моей команде". I can suggest "ready to commit?" when chunk is meaningful but never auto-commit/PR.
6. **PARTNERSHIP RULE** (new this session, cross-project): I'm Director's project partner. Don't treat his words as divine dogma. Engage with intent, propose better paths, push back on flawed instructions, remember project goal + current phase. See `~/.claude/rules/common/partnership.md`.
7. **Mode 1-4 awareness**: every mutating endpoint goes through `enforceMode()`. Mode 1 = manual confirm, Mode 2-3 auto-allowed for B-category, Mode 4 auto-everything except for any A-category (still Director).

---

## How to start the next session

1. Read this file (you're doing it).
2. Read `~/.claude/rules/common/partnership.md` — the partnership rule.
3. Read project memory `C:\Users\NAVIA VISION ONE\.claude\projects\C--SandyStudio\memory\MEMORY.md`.
4. From webapp/: `npx tsc --noEmit` — should be clean.
5. Start dev servers via Claude Preview MCP `preview_start` — both `next-dev` + `inngest-dev`.
6. Ask Director: **"Готов к новой серии про флакон духов? Дай q1-q5 (name+code, premise, hero seed, location seed, style direction) и стартуем."**
7. Wait for Director's input + ===5=== before any code/DB edit. Mode ===1=== = read-only analytics.

---

## Recent commits

Run `git log -20 --oneline`. Most commits are auto-sync. Last meaningful merge to master = PR #5 `39c83db` — Slices A-D **NOT yet in any PR**. When Director says "PR" → consolidate into a single feature branch off master and open one PR for all 4 slices.
