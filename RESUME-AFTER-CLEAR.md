# RESUME-AFTER-CLEAR — read first after `Clear this session`

**Session ended:** 2026-05-04 evening
**Branch:** `claude/agitated-lederberg-a292d3` (auto-sync hook commits frequently — `git log -20 --oneline`)
**Latest meaningful master commit:** `39c83db` — pre-EREF v2 work
**All EREF v2 work auto-synced** to local branch — working tree clean.

---

## TL;DR — Where we are

The big architectural overhaul is **done in code, not yet stress-tested**:

**EREF v2 — full rewrite of Episode References as a quality-control station:**
- Storyboarder@v2 contract (per-character emotion/action/role/shot_role/expected_gag) — **proven end-to-end** with SS-S14-E01 v03
- Provider abstraction (MultiImageGenProvider) with two impls: `openai-edits-multi` (default) + `flux-pro-1.1-ultra` (fal.ai)
- AI reviewer (EXEC-EREF-CHECK, Sonnet vision) — scores 5 axes per shot, returns APPROVE/REGENERATE/HUMAN_REVIEW + suggested_prompt_v2
- Generate→review→regen loop (≤2 retries)
- 4K upscale via fal.ai clarity-upscaler (Phase E.5)
- All persisted to `assets.metadata.shot_reference` (contract `episode_references@v2`)

**First real run last night:** 10/13 v2 records produced before Director stopped it. Issues encountered:
- 2 EXEC-EREF jobs racing in parallel → duplicate-key collisions
- OpenAI Edits 502 hiccups → 1-2 shots skipped
- AI reviewer verdicts mostly `APPROVE` (consistency 88, emotion 82, action 85, gag 80, style 87)
- Director visual feedback: "уже гораздо лучше" — multi-anchor IS solving Vial drift

**Concurrency lock fix already applied** (`lib/inngest/concurrency.ts` set `exec-eref` from 3→1). Single clean run on next re-trigger should finish all 13 shots cleanly.

---

## Foundation files written this work cycle (persistent)

| File | Purpose |
|---|---|
| `C:\SandyStudio\technology.md` | NEW — production-technology theses ("how we make movies"). Read before responding. Append on every Director message about pipeline/format/quality/sequencing. Maintenance protocol §7. |
| `C:\SandyStudio\CLAUDE.md` | §9 startup sequence updated — read `technology.md` after `glossary.md`. |
| `C:\SandyStudio\PLAN.md` | New `## Pipeline philosophy` section before `CURRENT STATE` — Animatic role, EREF as QC, 4K, 5-action review set. |
| `~/.claude/projects/C--SandyStudio/memory/technology_md_protocol.md` | Memory rule: pre-read technology.md, scan Director messages, escalate contradictions. |

---

## State of the worktree (all auto-synced to local branch)

- `npx tsc --noEmit` — clean (verified this morning)
- `npm test` — 110/110 pass (last verified yesterday)
- `npm run replay-pilot` — 29/29 pass
- Both dev servers: **next-dev :3000 RUNNING; inngest-dev :8288 STOPPED** (need to restart it before triggering EREF)

### New files this cycle

| Area | File |
|---|---|
| Phase A (storyboarder@v2) | `webapp/lib/agents/runners/storyboarder.ts` (rewrite + post-validation) |
| Phase A parsers | `webapp/lib/agents/runners/episode-references.ts` (extractScenesFromStoryboard handles v1+v2), `webapp/lib/agents/runners/continuity-check.ts` (prompt hints v2-aware) |
| Phase B providers | `webapp/lib/agents/providers/image-gen-multi.ts` (interface), `openai-edits-multi.ts`, `flux-pro-ultra-fal.ts`, `image-gen-multi-registry.ts`, `upscale-fal.ts` |
| Phase B config | `webapp/lib/api/eref-config.ts` (`getEREFProvider`, `getEREFUpscaleEnabled`) |
| Phase C types | `webapp/lib/api/shot-reference.ts` (full v2 contract types) |
| Phase D reviewer | `webapp/lib/agents/providers/anthropic-vision.ts` (multimodal adapter), `webapp/lib/agents/runners/eref-check.ts` |
| Phase D registry | `webapp/lib/agents/types.ts` + `registry.ts` + `gate.ts` + `runner.ts` extended for `EXEC-EREF-CHECK` |
| Phase E loop | `webapp/lib/agents/runners/episode-references.ts` (full rewrite — generate→review→regen+upscale) |
| UX fixes | `webapp/components/pipeline/RetriggerStageModal.tsx` (NEW), `webapp/components/inbox/InboxNotePromptModal.tsx` (NEW), `webapp/components/ui/Modal.tsx` (stopPropagation), `webapp/components/pipeline/StageKebabMenu.tsx` (Re-trigger on approved + "View source" rename + relax running guard), `webapp/app/api/episodes/[id]/trigger/route.ts` (EXEC-EREF allowlist) |
| Bible refactor (earlier in cycle) | `webapp/lib/agents/bible-loader.ts` + 4 runner integrations |
| Concurrency fix (last action) | `webapp/lib/inngest/concurrency.ts` `exec-eref: 3 → 1` |

### Episode in active production

**SS-S14-E01 "Perfume Vial"** — Sandy series 14 ep 1.
- Brief: APPROVED, edited
- Script: APPROVED v01
- Script Reviewer: APPROVED v01
- Storyboarder: APPROVED v03 (storyboarder@v2 contract)
- Continuity Check: APPROVED v03 (PASS verdict, after Bible neon_cafe pink enrich)
- Episode References: **STOPPED mid-run**, 10/13 v2 records in DB (`metadata.shot_reference.contract='episode_references@v2'`), some duplicates from racing
- Animatic and beyond: not started

### Bible state for SS-S14

LOCKED entries: 1 general_idea, 2 characters (`sandy_hourglass`, `perfume_vial`), 1 location (`neon_cafe` — recently enriched with pink/magenta hue), 1 style (`episode_perfume_02`).

---

## What to do FIRST in next session

1. **Read this file** (you're doing it).
2. **Read `C:\SandyStudio\technology.md`** — production-tech theses (per CLAUDE.md §9 step 4).
3. **Read project memory** `C:\Users\NAVIA VISION ONE\.claude\projects\C--SandyStudio\memory\MEMORY.md`.
4. **Restart inngest-dev** via Claude Preview MCP `preview_start name=inngest-dev` (it was killed last night to stop the failing run).
5. From `webapp/`: `npx tsc --noEmit` — should be clean.
6. **Greet Director and propose first action.** Two options:
   - **A. Test clean EREF run** — Director re-triggers EREF on SS-S14-E01 from kebab on Episode references stage. With concurrency=1, it should run sequentially (no racing), 6-10 min wall clock, ~$1 spend. If 502 still hits 1-2 shots — add retry; if not — concurrency=1 alone solves the issue.
   - **B. Build Phase F (QC console UI)** — AssetDetailDrawer with 5 actions (APPROVE/EDIT PROMPT/SWITCH PROVIDER/REQUEST REVISION/REJECT) + score bars + history carousel. Director can't really USE the AI reviewer verdicts without this UI. ~3-4 hours code.

Recommend **A first** (proves the architectural fix), then **B** (unlocks Director's Day-2 workflow).

---

## Open architectural follow-ups

| ID | What | Priority |
|---|---|---|
| Phase F | QC Console UI — biggest remaining must-have for production EREF | high |
| Move-upscale-to-Director-approve | Currently upscale runs on AI APPROVE — wasteful (Director may REJECT). Per `technology.md §3`: only Director APPROVE triggers upscale. Per-asset opt-out toggle. | high |
| Hybrid parallelism | Pilot pass + Fan-out batch + Kill switch (`technology.md §4`). After Phase F. | medium |
| Stale-cascade | When SB regen → downstream APPROVED becomes semantically stale, UI must show `stale` state. Modal prompt on upstream APPROVE. | medium |
| markJobFailed reconciliation | Zombie RUNNING jobs from Inngest function.failed (PLAN.md long-debt #4) | medium |
| Cleanup | Delete S01-S13 episodes + duplicate v2 records from yesterday's racing run | small |
| 502 retry / idempotent insert | Conditional — only if clean EREF run still hits these | small |
| UX polish | Version badge in Inbox, smoke animation, per-version kebab actions, optimistic stage feedback, activity feed entries, per-series Inbox filter | small |

---

## Important context (gotchas)

1. **Inngest dev MUST be running** — webapp/.env.local has `INNGEST_DEV=1` so it routes to local :8288. Without dev server, events fail.
2. **DO NOT `npm run build` while dev is running** — corrupts `.next/` chunks → 500 on every API route.
3. **Bible slug regex** — single source of truth in `lib/api/series-bible.bibleSlug()`. Never re-introduce inline regex.
4. **Storyboarder@v2 post-validation** — runner throws if `bible_slug` not in canon, missing `expected_emotion`, etc. Will FAIL LOUD if Claude breaks contract.
5. **EREF concurrency fixed at 1** per episode (`lib/inngest/concurrency.ts`) — until hybrid parallelism lands.
6. **Verify real results, not just logs** — Director's rule: open the artifact (Drive file, content excerpt, DB row) before reporting "done".
7. **PROCESS RULE**: "коммит/PR только по моей команде". Suggest "ready to commit?" when chunk is meaningful but never auto-commit/PR. (Auto-sync hook does happen, but that's local; PR to master needs Director.)
8. **PARTNERSHIP RULE** — `~/.claude/rules/common/partnership.md`. Engage with intent, propose better paths, push back on flawed instructions.
9. **technology.md PROTOCOL** — `~/.claude/projects/C--SandyStudio/memory/technology_md_protocol.md`. Pre-read before responding; scan every Director message for production-tech theses; escalate contradictions.
10. **Mode 1-4 governance** — every mutating endpoint goes through `enforceMode()`. Mode 1 = manual confirm, Mode 2-3 auto-allowed for B-category, Mode 4 auto-everything except A-category.

---

## Director's last words (2026-05-04 evening)

> "пока хватит. до завтра. посмотрел картинки - уже гораздо лучше! ))"

Multi-anchor architecture is validated. Foundation works. Director happy. Next session: clean run + Phase F.
