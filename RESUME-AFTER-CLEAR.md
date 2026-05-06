# RESUME-AFTER-CLEAR — read first after `/clear` or `/strategic-compact`

**Session ended:** 2026-05-06 — context window almost full, manual clean break.
**Branch:** `feat/bible-enrich-cta` (auto-sync hook commits frequently — `git log -10 --oneline`)
**Master state:** PR #7 (EREF v2) + PR #8 (Animatic v1) MERGED. Two big epics live on master.
**In flight:** **VGEN real provider** — 2 background sub-agents working (Track A + Track B). See "VGEN status" section below.

---

## TL;DR — Where we are

Pipeline runs end-to-end on mocks all the way to Publish gate (Director hard-limit). Two real epics shipped to master today:

| | |
|---|---|
| **PR #7 (yesterday morning)** | EREF v2 — Pilot Pass + 1-shot-1-approved invariant + QC Console |
| **PR #8 (yesterday evening)** | Animatic v1 — browser-native player (no mp4 render) + Approve/Reject + transitions |

**In progress:** VGEN epic — Track A (backend) + Track B (UI) sub-agents running in background. **Plan file**: `C:\Users\NAVIA VISION ONE\.claude\plans\purrfect-stirring-hollerith.md`

---

## Critical foundation (read before responding)

| File | Purpose |
|---|---|
| `C:\SandyStudio\technology.md` | Production-tech theses. **Read EVERY response**. **NEW §0 added today**: Two production classes (viral factory CORE vs cinematic exception) — viral pipeline = Idea → Script → Refs → Animatic → Shot gen → Auto-stitch → Music → Auto-publish. NO compositing/VFX/color grading. |
| `C:\SandyStudio\CLAUDE.md` | §9 startup sequence — read after RESUME |
| `C:\SandyStudio\PLAN.md` | Live state of pipeline phase work |
| `C:\Users\NAVIA VISION ONE\.claude\plans\purrfect-stirring-hollerith.md` | **Current approved plan: VGEN — Universal Video Editor Surface + Veo 3 + Pilot Pass** |
| `C:\Users\NAVIA VISION ONE\.claude\projects\C--SandyStudio\memory\MEMORY.md` | Auto-memory across sessions |

---

## VGEN epic status (in flight)

**Plan approved 2026-05-06** by Director. Architectural decision: **Hybrid (Universal Core + ProviderManifest extensions)**. UI in **drawer + stage-level batch panel**.

### Background sub-agents

- **Track B — UI** ✅ **COMPLETED** (agent ID `a62e962435b35cead`). Files created:
  - `webapp/components/vgen/VGENShotPanel.tsx` (378 lines) — Universal Core controls
  - `webapp/components/vgen/VGENBatchPanel.tsx` (242 lines) — stage batch defaults (uses localStorage stub `sandystudio.vgen_batch_defaults.<episodeId>`; Track A may choose to upgrade to server PATCH later)
  - `webapp/components/vgen/VGENShotSection.tsx` (116 lines) — drawer↔panel glue extractor
  - `webapp/components/pipeline/VGENPilotPillbar.tsx` (397 lines)
  - Modified: `EpisodeAssetDrawer.tsx` (830 lines, net 0 — extracted glue), episode page (629→648)
  - tsc clean for Track B (110/110 tests pass)

- **Track A — Backend** ✅ **COMPLETED** (agent ID `af95e1ac14f22c8c3`). Files created (all under 800 except runner.ts which was already oversized):
  - `webapp/lib/api/vgen-pilot-state.ts` (89) — state machine via `app_config` (mirrors EREF pattern)
  - `webapp/lib/api/vgen-cancel.ts` (81)
  - `webapp/lib/api/vgen-defaults.ts` (73)
  - `webapp/lib/api/vgen-shot-helpers.ts` (328) — buildShotPromptV2, getApprovedEREFForShot, pickPilotVgenShots, getStoryboardShotById
  - `webapp/lib/agents/providers/video-gen-multi.ts` (141) — type abstraction + Veo 3 wrapper
  - `webapp/app/api/episodes/[id]/vgen/approve-pilots/route.ts` (128)
  - `webapp/app/api/episodes/[id]/vgen/cancel/route.ts` (67)
  - `webapp/app/api/assets/[id]/regenerate-video/route.ts` (322)
  - Modified: runner.ts EXEC-VGEN case (img2vid + buildShotPromptV2 + Universal Core args), exec-vgen.ts (3 new functions + legacy back-compat), inngest index/client, concurrency, /approve route fan-out fix
  - **All checks green**: tsc clean ✓, 110/110 tests ✓, **replay-pilot 29/29 ✓** (legacy 3-shot fallback verified)

### 🔴 Critical integration mismatch — must fix before live test

Track A stores `vgen_pilot_state` in **`app_config`** (mirror EREF). Track B reads from **`episode.metadata.vgen_pilot_state`**. Incompatible.

**Fix options:**
1. (Recommended) Create new `GET /api/episodes/[id]/vgen/state` endpoint (~30 lines) — reads app_config via `getVgenPilotState` + computes pilot/total counts. Track B's pillbar swaps SWR to this endpoint.
2. Or refactor Track A to store in episodes.metadata (requires schema migration since episodes table has no metadata column today).

Option 1 is faster — do that.

**Other Track A open items** (defer to Phase 1.5):
- `vgen_pilot_state=COMPLETE` not auto-flipped when last fanout shot finishes — UI computes from asset counts (acceptable pattern)
- `regenerate-video` does NOT auto-demote prior VID-shot — Director may want EREF-style 1-shot-1-approved invariant later

**Do NOT relaunch sub-agents** — both finished.

### After sub-agents finish

1. Integration step (~1h):
   - Resolve any Track A vs Track B contract mismatches
   - Run `tsc --noEmit` + `npm test` + `replay-pilot`
2. Verify `provider_assignments` table has row for `character_video` → `veo-3-img2vid` (use Supabase CLI or Settings → Providers)
3. Verify `GEMINI_API_KEY` set in `webapp/.env.local` (verified earlier today ✓)
4. Live test on SS-S14-E01:
   - Animatic v05 already approved → next stage Visual Generator
   - Pilot Pass: 2 shots, fast quality, ~$0.45
   - If pilots good → fanout 11 more, ~$2.50
   - Total ~$3 per episode

---

## Today's work summary (2026-05-06)

### Done

- ✅ **Animatic v1 ship** — browser-native player, Approve/Reject buttons, transitions to VGEN/MGEN events. PR #8 merged to master.
- ✅ **saveAgentOutput metadata persistence fix** — was dropping `animatic_v1` field. Now whitelist `PERSIST_METADATA_KEYS = ['animatic_v1']`.
- ✅ **AssetPreview integration** — Pipeline page activity feed Preview drawer also opens AnimaticPlayer (not just Inbox/episode drawer).
- ✅ **Bug fixes**: regen identity preservation (default to last-used provider), advance route body, ConfirmReplaceModal pointer-events.
- ✅ **Concierge voice in webapp** — set to `navigator.language` (auto-detects ru-RU). Working in webapp.
- ✅ **technology.md §0** — Two production classes architecture principle added (Director's directive 2026-05-06).
- ✅ **VGEN plan approved** — Universal Core + Pilot Pass + Hybrid arch. Sub-agents launched.

### Open / next-steps

| # | Task | Priority |
|---|---|---|
| 1 | **Wait for Track A + Track B completion**, then integrate + smoke test | high (in progress) |
| 2 | Apply real Veo 3 test on SS-S14-E01 (~$3) | high |
| 3 | **EXEC-STITCH** — next epic. Auto-assembly via ffmpeg: shots + music + transitions → final mp4. ~3-4h. Per technology.md §0 viral pipeline. | medium-high |
| 4 | **Audio block reorg** — Music/Voice/SFX as separate stage BEFORE Animatic (Director's directive 2026-05-05) | medium |
| 5 | Pillbar state-after-advance UX fix | low |
| 6 | markJobFailed reconciliation | medium |
| 7 | stale-cascade UI | low |
| 8 | Mode 4 Animatic gate decision | architectural |

### Closed without resolution (known limits)

- **Voice input в Russian для Claude Code Desktop** — feature-gated by cowork sandbox (`CLI returned: '/voice isn't available in this environment'`). Settings.json `language: russian` + `voice.enabled: true` + Desktop config.json `locale: ru-RU` set, but voice path is sandboxed-off. Not buggy, by design. Director switched to using English voice while practicing English. Webapp Concierge voice in Russian works fine (separate path via navigator.language).

---

## State of the worktree

- Branch: `feat/bible-enrich-cta`, ahead of master after Track A/B agents finish (auto-sync covers commits)
- Master synced after PR #8 merge — local branch merged master earlier this session
- Working tree mostly clean — sub-agents will create new files
- Both dev servers running:
  - **next-dev** id `1218670d-2a75-456f-bbc2-fb0d7d16050d`, port 3000
  - **inngest-dev** id `a426d6e9-4a5f-431d-9d66-581841a8d534`, port 8288
- Episode in active production: **SS-S14-E01 "Perfume Vial"**:
  - Pipeline reached Publish (Director hard-limit) on mocks
  - Animatic v05 has `metadata.animatic_v1` correctly written
  - 13 EREF v2 records all APPROVED
  - VGEN ran on mocks (3 fake shots), needs real run with proper fan-out

---

## Important context (gotchas)

1. **Inngest dev MUST be running** — `INNGEST_DEV=1` in webapp/.env.local routes events to local :8288
2. **DO NOT `npm run build` while dev is running** — corrupts `.next/` chunks
3. **Bible slug regex** — single source of truth in `lib/api/series-bible.bibleSlug()`
4. **Voice gated** — see "Closed without resolution" above
5. **Verify real results, not just logs** — Director's rule: open the artifact (Drive file, mp4 playback, DB row) before reporting "done"
6. **PROCESS RULE**: "коммит/PR только по моей команде" — auto-sync hook does local commits but PR to master needs Director approval
7. **PARTNERSHIP RULE** — `~/.claude/rules/common/partnership.md`. Engage with intent, propose better paths, push back on flawed instructions
8. **technology.md PROTOCOL** — read before every response, scan for production-tech theses, escalate contradictions
9. **Mode 1-4 governance** — every mutating endpoint goes through `enforceMode()`
10. **Plan mode workflow** — use Explore agents in Phase 1, Plan agents in Phase 2, AskUserQuestion for clarifications, ExitPlanMode for approval

---

## Director's last words (2026-05-06)

Two big architectural directives this morning:

1. **Voice input language** — couldn't fix in Claude Code Desktop (sandbox-gated). Director switching to English practice while we work.
2. **VGEN must be a real video editor surface** — not "dern API and forget". Hybrid Universal Core + Provider Manifests. UI in drawer + stage batch panel.
3. **Two production classes principle** — viral factory CORE vs cinematic exception. Pipeline auto-stitches, no DaVinci. Recorded in technology.md §0.

Director said "if it correlates with proposed plan it's OK" — yes, VGEN plan aligns with viral mode philosophy.

**Next session: complete VGEN integration → live test → ship → tackle EXEC-STITCH (auto-assembly).**
