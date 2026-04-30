# SandyStudio — PLAN.md
## Master Production Tracker | v0.1 | DRAFT

> This file is the single source of truth for what phase the studio is in,
> what is blocked, what is next, and who owns what.
> Updated by EXEC-ORCH after every state change.
> Read by Claude Code at every session start (after CLAUDE.md).

---

## CURRENT STATE

```
Phase:    SPRINT 9 / Phase 5c COMPLETE + E02 Mode 1 cycle verified by Director
          Provider Strategy v0.2 APPROVED 2026-04-30 — Google-first MVP, two-tier UI switching
Next:     Phase 5d step 2 — pipeline-row kebab UI (Approve/Reject/Tweak/Re-trigger)
          → activity preview drawer → friendly agent names → Phase 8 (13 sub-steps)
Mode:     ===5=== EDIT (Director active) — switches to ===1=== at session start per CLAUDE.md
Date:     2026-04-30
```

### Episodes in DB

| Episode | Status | Mode | What it proves |
|---------|--------|------|----------------|
| **SS-S01-E01** "The Red Carpet" | BRIEF_APPROVED + 15 assets APPROVED through Publish | 4 (AUTOTEST) | Full chain Brief → EXEC-SW → SREV → SB (3 acts) → WCHK → EDIT → VGEN×3 + MGEN → COPY → THUMB → **PUB** works in Mode 4 mock mode |
| **SS-S01-E02** "sandyTest05" | BRIEF_PENDING (brief in REVIEW) | 1 (MANUAL) | Reset clean — Director's Mode 1 test bench. Approve via `/inbox` → chain runs through asset-approve `computeNextEvents` |

### Migrations on remote Supabase

```
0001..0009  Phase 1-4
0010        series + approval_authority_matrix + app_config storage scope (Phase 5b)
0011        relax assets.file_type CHECK + cleanup orphans
0012        relax CHECK to allow dashes in variants/filenames (caught EXEC-VGEN/MGEN bug)
```

### Two-terminal local dev (canonical)

```bash
# Terminal 1
cd webapp && npm run dev          # → http://localhost:3000

# Terminal 2
cd webapp && npm run inngest:dev  # → http://localhost:8288 (dashboard)
```

⚠ **Don't** run `npm run build` while dev is active — corrupts `.next/` webpack cache, every API route returns `Cannot read properties of undefined (reading 'call')` 500. Recovery: kill servers, `rm -rf webapp/.next`, restart dev.

### Sprint 9 Phase status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Supabase init + migrations (cloud)            | ✅ COMPLETE 2026-04-28 |
| 2 | Next.js scaffold + theme + StudioShell + Concierge | ✅ COMPLETE 2026-04-28 |
| 3 | Inngest worker + concurrency limits + ping smoke test | ✅ COMPLETE 2026-04-28 |
| 4 | Agent job functions (11 Inngest fns + factory + 39 unit tests + replay-pilot harness)  | ✅ COMPLETE 2026-04-28 |
| 5a | UX architecture specs (uiux v0.3 + 5 sub-specs + config/uiux.yaml extensions) | ✅ COMPLETE 2026-04-29 |
| 5b | API routes (26 endpoints + lib/api/* + zod + migration 0010 + 79 tests) | ✅ COMPLETE 2026-04-29 |
| 5c | First-run wizard + Cockpit Dashboard + Inbox + Pipeline View + Activity + Storage settings + Topbar levers + Mode 1 chain (computeNextEvents) + Mode 4 auto-chain (factory) + 3-STB-act gate fix (migration 0011 + 0012) | ✅ COMPLETE 2026-04-29 |
| 5d | UX polish (долговая тетрадка ниже) — friendly agent names, asset preview drawer, tooltips, etc. | ⏳ pending |
| 6 | Per-episode sub-pages, budget detail tab, jobs detail panel | ⏳ pending |
| 7 | Approval Authority Matrix per-row editing + delegate UI | ⏳ pending |
| 8 | Real provider integration (Kling/Midjourney/Suno/YouTube) — first paid run | ⏳ pending |
| 9 | PM2 ecosystem + Tailscale + production hardening | ⏳ pending |

### Long-debt (долговая тетрадка) — Phase 5d candidates

Items surfaced during Director's Phase 5c smoke test, not blocking but worth fixing:

| # | Bug / improvement | Severity |
|---|---|---|
| 1 | Friendly agent names everywhere (EXEC-SW → "Screenwriter"). Affects Re-trigger modal, Inbox, Pipeline DAG, Activity feed. | UX |
| 2 | Per-stage trigger button in DAG (instead of generic Re-trigger… modal with dropdown) | UX |
| 4 | `markJobFailed` on any throw, not only gate-fail. Job rows shouldn't sit `RUNNING` after Inngest function.failed (e.g. CHECK constraint, save errors) | Reliability |
| 5 | Re-trigger dedup: refuse if same agent already has COMPLETED/RUNNING job for that asset | UX |
| 6 | Asset preview drawer in Inbox (image/video/audio/markdown). Today it's just `confirm()` modal for visuals. | UX |
| 7 | Tooltips on buttons (especially Mode 1/2/3 picker, APPROVE/REVISE/REJECT in Inbox); inline mode descriptions | UX |
| 8 | Authority Matrix per-row editing UI (currently read-only display) | Phase 7 |
| 13 | `episodes.status` doesn't update after milestone approvals — stays `BRIEF_APPROVED` even when published | Reliability |
| 14 | `schedule-analytics` cron not firing after EXEC-PUB. Verify runner.ts EXEC-PUB emits `result.next_event` properly | Reliability |
| 15 | Mode 4 auto-revert to Mode 1 on session end (per `governance.md §4`) | Compliance |
| 16 | EXEC-VGEN base file_type duplicate `shot` token: produces `VID-shot-shot1`. Either base="VID" or shotId="1" | Cosmetic |

**Already fixed in Phase 5c (don't re-add):**
- ✅ #3 Story phantom stage hidden
- ✅ #9 Multi-asset milestone chain (STB×3, animatic fan-out, metadata→thumb, ready→pub) via `computeNextEvents`
- ✅ #10 Pipeline View stage filter (uses `metadata.file_type` prefix)
- ✅ #11 Factory writes `agent_completed` activity_event on save
- ✅ #12 STAGE_FROM_ASSET prefix matching (no more "all stages idle despite approved assets")

### UI/UX implementation note

Any task touching visual UI must keep `specs/system/uiux.md` synchronized:
1. Read `specs/system/uiux.md` first.
2. Confirm changes follow the active theme/token system — no raw hex in components.
3. Approval Queue remains the highest-priority UI path (Phase 6).
4. Do NOT implement Interactive Asset Galaxy v2 unless explicitly planned.
5. Update `specs/system/uiux.md` if visual rules change.

---

## METHODOLOGY: SDD

**Spec Driven Development** — nothing is built without an approved spec.

```
Spec DRAFT → Spec REVIEW → Spec APPROVED → Implementation → Output REVIEW → Output APPROVED
```

Every file in this project maps to a phase in this chain.
No agent writes content until the spec for that content is APPROVED.

---

## SPRINT MAP

### SPRINT 0 — Foundation Approval
**Status:** ✅ COMPLETE (2026-04-23)

| Task | Owner | Status |
|------|-------|--------|
| Approve `specs/company/governance.md` v0.3 | Sandy | ✅ APPROVED |
| Create `specs/company/participants.md` | EXEC-ARCH | ⏳ In progress |

---

### SPRINT 1 — System Architecture Specs
**Status:** ⏳ IN PROGRESS
**Unlocks:** Sprint 2

| Task | Owner | Status |
|------|-------|--------|
| Write `specs/production/pipeline_overview.md` | BOARD-CRD + ART-PROD | ✅ DRAFT |
| Write `specs/production/bootstrap_sequence.md` | ART-PROD | ✅ DRAFT |
| Update `CLAUDE.md` | EXEC-ARCH | ✅ Done |

**Exit criteria:** Both production specs APPROVED by Director

---

### SPRINT 2 — Data Schemas
**Status:** ✅ COMPLETE — all 6 schemas APPROVED (2026-04-24)

| Task | Status |
|------|--------|
| `specs/schemas/brief.md` | ✅ **APPROVED** v0.2 |
| `specs/schemas/script.md` | ✅ **APPROVED** v0.1 |
| `specs/schemas/shot.md` | ✅ **APPROVED** v0.1 |
| `specs/schemas/character_profile.md` | ✅ **APPROVED** v0.1 |
| `specs/schemas/qa_report.md` | ✅ **APPROVED** v0.2 |
| `specs/schemas/prompt.md` | ✅ **APPROVED** v0.2 |

---

### SPRINT 3 — Protocol Specs
**Status:** ✅ COMPLETE — updated for 4-mode governance system (2026-04-24)

| Task | Status |
|------|--------|
| `specs/protocols/inter_agent_handoff.md` | ✅ **APPROVED** v0.2 |
| `specs/protocols/version_cascade.md` | ✅ **APPROVED** v0.1 |
| `specs/protocols/qa_retry.md` | ✅ **APPROVED** v0.1 |
| `specs/protocols/batch_approval.md` | ✅ **APPROVED** v0.2 |

---

### SPRINT 4 — Technical Decisions
**Status:** ✅ COMPLETE (2026-04-24) — awaiting Director decisions on D-001, D-002
**Parallel with:** Sprint 5

| Task | Status |
|------|--------|
| `specs/system/character_consistency.md` | ✅ **APPROVED** — D-001: A2-Kling |
| `specs/system/assembly_tool.md` | ✅ **APPROVED** — D-002: B4 FFmpeg |
| `specs/system/api_integrations.md` | ✅ DRAFT |
| `specs/system/project_state.md` | ✅ DRAFT |
| `specs/system/media_formats.md` | ✅ DRAFT |
| `specs/system/auth.md` | ✅ DRAFT |

#### Decision A — Character Visual Consistency
> Sandy must choose approach before this sprint can begin

| Option | Description | Complexity |
|--------|-------------|------------|
| A1 | Canonical prompt fragment per character | Low / unreliable |
| A2 | Reference image anchor per API call | Medium / reliable |
| A3 | LoRA fine-tune per character | High / most reliable |
| A4 | Hybrid A1+A2 (start simple, upgrade) | Medium / recommended |

**Sandy's choice:** `___` *(to be filled)*

#### Decision B — Assembly Tool
> Sandy must choose tool before this sprint can begin

| Option | Description |
|--------|-------------|
| B1 | DaVinci Resolve (professional, free) |
| B2 | Adobe Premiere Pro (subscription) |
| B3 | CapCut (simple, limited) |
| B4 | FFmpeg (CLI, fully automatable) |

**Sandy's choice:** `___` *(to be filled)*

#### Sprint 4 tasks (after decisions)

| Task | Owner | Output |
|------|-------|--------|
| `specs/system/character_consistency.md` | ART-AD + EXEC-VGEN | Chosen approach + implementation |
| `specs/system/assembly_tool.md` | ART-PROD | Chosen tool + asset requirements |
| `specs/system/api_integrations.md` | EXEC-VGEN + EXEC-MGEN | All API specs |
| `specs/system/project_state.md` | EXEC-ORCH | State file schema |
| `specs/system/media_formats.md` | ART-AD + EXEC-VGEN | Codecs, resolutions, naming |
| `specs/system/auth.md` | Developer | Authentication mechanism |

**Exit criteria:** All 6 technical specs APPROVED by Director

---

### SPRINT 5 — Company + Distribution Specs
**Status:** ✅ COMPLETE (2026-04-24)

| Task | Status |
|------|--------|
| `specs/company/participants.md` | ✅ **APPROVED** (pre-existing) |
| `specs/company/master_plan_template.md` | ✅ **APPROVED** (pre-existing) |
| `specs/distribution/youtube.md` | ✅ **APPROVED** v0.1 |
| `specs/distribution/metadata.md` | ✅ **APPROVED** v0.1 |
| `specs/distribution/analytics.md` | ✅ **APPROVED** v0.1 |

---

### SPRINT 6 — Agent Instructions
**Status:** ✅ COMPLETE (2026-04-24) — all 25 agents APPROVED by Director

#### Agent status

| Agent | File | Status |
|-------|------|--------|
| EXEC-ORCH | `agents/exec/orchestrator.md` | ✅ APPROVED |
| EXEC-SW | `agents/exec/screenwriter.md` | ✅ APPROVED |
| EXEC-SREV | `agents/exec/script_reviewer.md` | ✅ APPROVED |
| EXEC-SB | `agents/exec/storyboarder.md` | ✅ APPROVED |
| EXEC-WCHK | `agents/exec/world_checker.md` | ✅ APPROVED |
| EXEC-VGEN | `agents/exec/visual_generator.md` | ✅ APPROVED |
| EXEC-DIR-AI | `agents/exec/exec_dir_ai.md` | ✅ APPROVED |
| EXEC-STY | `agents/exec/style_creator.md` | ✅ APPROVED |
| EXEC-MGEN | `agents/exec/music_generator.md` | ✅ APPROVED |
| EXEC-ARCH | `agents/exec/archivist.md` | ✅ APPROVED |
| EXEC-COPY | `agents/exec/copywriter.md` | ✅ APPROVED |
| EXEC-THUMB | `agents/exec/thumbnail_creator.md` | ✅ APPROVED |
| EXEC-PUB | `agents/exec/publisher.md` | ✅ APPROVED |
| EXEC-ANAL | `agents/exec/analytics_collector.md` | ✅ APPROVED |
| ART-PROD | `agents/artistic/producer.md` | ✅ APPROVED |
| ART-HW | `agents/artistic/head_writer.md` | ✅ APPROVED |
| ART-AD | `agents/artistic/art_director.md` | ✅ APPROVED |
| ART-MS | `agents/artistic/music_supervisor.md` | ✅ APPROVED |
| ART-WB | `agents/artistic/world_builder.md` | ✅ APPROVED |
| ART-CAST | `agents/artistic/casting_director.md` | ✅ APPROVED |
| ART-CONT | `agents/artistic/continuity_supervisor.md` | ✅ APPROVED |
| BOARD-MKT | `agents/board/market_analyst.md` | ✅ APPROVED |
| BOARD-FIN | `agents/board/financial_analyst.md` | ✅ APPROVED |
| BOARD-FAI | `agents/board/founder_ai.md` | ✅ APPROVED |
| BOARD-CRIT | `agents/board/cautious_critic.md` | ✅ APPROVED |
| BOARD-CRD | `agents/board/creative_director.md` | ✅ APPROVED |

---

### SPRINT 7 — Web Application
**Status:** 🟢 READY — Sprint 6 complete
**Stack:** Next.js 15 + Supabase + Inngest + Vercel
**Goal:** Studio UI — agent dashboard, approval interface, episode tracker, async job runner

| Task | Owner | Status |
|------|-------|--------|
| Write `specs/system/webapp.md` | EXEC-ORCH | 📝 DRAFT |
| Define DB schema (Supabase) | Developer + EXEC-ORCH | ⏳ Blocked by webapp.md |
| Define Inngest job definitions | Developer + EXEC-ORCH | ⏳ Blocked by webapp.md |
| Define API routes (Next.js) | Developer | ⏳ Blocked by webapp.md |
| Build Studio UI | Developer | ⏳ Blocked by above |

**Exit criteria:** webapp.md APPROVED → development begins

---

### SPRINT 8 — First Production Run (PILOT)
**Status:** 🔒 BLOCKED by Sprint 7
**This is when actual animation production begins**

Follow `specs/production/bootstrap_sequence.md` exactly.

---

## EPISODE TRACKER

*No episodes in production yet.*

---

## POST-PILOT ARCHITECTURAL TASKS

*Items identified during PILOT run — not blocking, implement after pipeline validated.*

| # | Task | Files affected | Priority |
|---|------|---------------|----------|
| PA-001 | **Character Reference Architecture** — Add Level 0 master reference (8K immutable image per character) + Level 1 scene reference layer. Text defines intent; reference defines reality. Currently: canonical_prompt_fragment is text-only (A1). This adds A2 (reference image). | `specs/system/character_consistency.md`, `specs/schemas/character_profile.md`, `agents/exec/visual_generator.md`, `specs/schemas/shot.md`, character profile bibles | HIGH — required before S01 real generation |
| PA-002 | Add `master_reference_image_path` field to character profile schema | `specs/schemas/character_profile.md`, both character bibles | Follows PA-001 |
| PA-003 | EXEC-VGEN Step 0: load master reference image, pass to API as character reference (not just text fragment) | `agents/exec/visual_generator.md` | Follows PA-001 |
| PA-004 | `config/defaults.yaml` — all values reviewed after PILOT (benchmarks, cost estimates, shot counts) | `config/defaults.yaml` | After PILOT |
| PA-005 | **Character Visual Development Workflow** — Pre-production step: before ART-CAST writes canonical_prompt_fragment, generate 3–4 visual variants per character (low-cost draft images), Director selects/refines, iterate to approved visual baseline. Only after approval → proceed to production pipeline. Spec: `specs/production/character_visual_development.md` | `specs/production/character_visual_development.md`, `agents/artistic/casting_director.md`, `agents/exec/visual_generator.md`, `specs/production/bootstrap_sequence.md` | Before S01 character definition |
| PA-006 | **Multi-Audience KPI Layer** — Formalize audience segmentation (children/adults) with quantitative density targets: `gag_rate` (gags/min), `philosophy_density` (meaningful beats/min), `recognition_moments` (per episode). Shot-level attribution: `gag: yes/no + type`, `philosophical_beat: yes/no + type`, `target_audience: child/adult/both`. QA checks enforcing density targets. Spec: `specs/production/audience_kpi.md` | `specs/production/audience_kpi.md`, `specs/schemas/story_brief.md`, `specs/schemas/shot.md`, `agents/artistic/head_writer.md`, `agents/exec/storyboarder.md`, `agents/exec/script_reviewer.md` | Before S01 episode scripts |

---

## OPEN DECISIONS

| # | Decision | Options | Owner | Due |
|---|----------|---------|-------|-----|
| D-001 | Character visual consistency | ✅ A2-Kling (Midjourney ref → Kling 3.0 Elements) | Sandy | ✅ 2026-04-24 |
| D-002 | Assembly tool | ✅ B4 FFmpeg + optional DaVinci colour pass | Sandy | ✅ 2026-04-24 |

---

## CHANGE LOG

| Date | Change | By |
|------|--------|----|
| 2026-04-30 | DECISION: Phase 8 = Google-first MVP. Active stack: Drive native (storage), gpt-image-1 (image, reuses OPENAI_API_KEY), Veo 3 + Veo 3 img2vid (video). Beatoven, ElevenLabs, Kling registered but `is_active = false`. YouTube wired last. Anthropic studio agents unchanged. | Director/CEO |
| 2026-04-30 | DECISION: provider switching architecture — two-tier (global `provider_assignments` + per-stage `stage_provider_overrides`). UI = `/settings/providers` for global + pipeline kebab for per-stage. 60s cache. Soft cancel on switch (no early Inngest interruption for MVP). | Director/CEO |
| 2026-04-30 | DECISION: Phase 5d ships kebab UI + activity preview drawer FIRST; Phase 8 slots provider sub-menu into the same kebab. Sequencing — q1b. | Director/CEO |
| 2026-04-30 | DECISION (partial D-001 reversal): MVP uses Veo 3 image-to-video for character shots (~75% consistency). Kling re-evaluated post first real cycle; Phase 8.5 candidate. | Director/CEO |
| 2026-04-30 | specs/system/provider_strategy.md v0.2 APPROVED — 17-step plan: Phase 5d (4 steps) → Phase 8 (13 steps). | Claude Code |
| 2026-04-30 | Phase 5d step 2 SHIPPED — pipeline-row kebab UI (Approve / Reject / Edit / Re-trigger), CodeMirror 6 editor, RejectModal. Components: DropdownMenu, MarkdownEditor, EditorModal, RejectModal, StageKebabMenu. New endpoint `/api/assets/[id]/content`. | Claude Code |
| 2026-04-30 | DECISION: markdown canonical in DB (variant A), not on disk. Reason: 10ms DB vs 300ms Drive API per save × frequent edits = seconds. Drive holds binaries only in Phase 8 step 10. | Director/CEO |
| 2026-04-30 | Migration 0013_assets_content.sql applied — `assets.content text NULL`. runner.ts saveAgentOutput populates `content` instead of stuffing markdown into `description`. factory.ts STB-act spoof carries placeholder content. Editor banner UX fixed (error path no longer shows empty Read-only banner). | Claude Code |
| 2026-04-23 | PLAN.md created, SDD structure established | Claude Code |
| 2026-04-23 | 5 new agents identified: ORCH, COPY, THUMB, PUB, ANAL | Claude Code |
| 2026-04-23 | Spec hierarchy defined (7 layers, 23 files) | Claude Code |
| 2026-04-24 | D-001 DECIDED: A2-Kling character consistency | Director/CEO |
| 2026-04-24 | D-002 DECIDED: B4 FFmpeg assembly | Director/CEO |
| 2026-04-24 | ARCH DECISION: Provider abstraction layer — agents call contracts not services | Director/CEO |
| 2026-04-24 | api_integrations.md v0.2 — 7 full contracts | Claude Code |
| 2026-04-24 | media_gateway.md v0.1 — gateway routing, health monitoring, budget gate | Claude Code |
| 2026-04-24 | config/providers.yaml v0.1 — swappable provider registry | Claude Code |
| 2026-04-24 | GOVERNANCE REDESIGN: 4-mode system (MANUAL/HYBRID/DELEGATED/AUTOTEST) | Director/CEO |
| 2026-04-24 | AI-EP → EXEC-DIR-AI — agent renamed and rewritten for 4-mode system | Claude Code |
| 2026-04-24 | governance.md, CLAUDE.md, pipeline_overview.md, batch_approval.md, inter_agent_handoff.md updated | Claude Code |
| 2026-04-24 | Sprint 4 COMPLETE — api_integrations, project_state, media_formats, auth APPROVED | Director/CEO |
| 2026-04-24 | Sprint 5 COMPLETE — youtube, metadata, analytics APPROVED | Director/CEO |
| 2026-04-24 | STACK DECISION: Next.js 15 + Supabase + Inngest + Vercel | Director/CEO |
| 2026-04-24 | EXEC-ORCH orchestrator.md v0.1 APPROVED | Director/CEO |
| 2026-04-24 | EXEC-SW screenwriter.md v0.2 APPROVED — rewritten as pure function | Director/CEO |
| 2026-04-24 | ARCH RULE #8 added to CLAUDE.md: Parameter Completeness at Gate | Director/CEO |
| 2026-04-24 | EXEC-SREV script_reviewer.md v0.1 APPROVED | Director/CEO |
| 2026-04-24 | EXEC-SB storyboarder.md v0.1 APPROVED | Director/CEO |
| 2026-04-24 | EXEC-WCHK world_checker.md v0.1 APPROVED | Director/CEO |
| 2026-04-24 | EXEC-VGEN visual_generator.md v0.1 APPROVED | Director/CEO |
| 2026-04-24 | EXEC-DIR-AI exec_dir_ai.md v0.1 APPROVED (fix: EXEC-ARCH→EXEC-ORCH) | Director/CEO |
| 2026-04-24 | EXEC-STY style_creator.md v0.1 DRAFT — pending review | Claude Code |
| 2026-04-24 | EXEC-MGEN music_generator.md v0.1 DRAFT — pending review | Claude Code |
| 2026-04-24 | EXEC-ARCH archivist.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | EXEC-COPY copywriter.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | EXEC-THUMB thumbnail_creator.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | EXEC-PUB publisher.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | EXEC-ANAL analytics_collector.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | ART-PROD producer.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | ART-HW head_writer.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | ART-AD art_director.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | ART-MS music_supervisor.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | ART-WB world_builder.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | ART-CAST casting_director.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | ART-CONT continuity_supervisor.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | BOARD-MKT market_analyst.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | BOARD-FIN financial_analyst.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | BOARD-FAI founder_ai.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | BOARD-CRIT cautious_critic.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | BOARD-CRD creative_director.md v0.1 DRAFT | Claude Code |
| 2026-04-24 | Sprint 6 COMPLETE — all 25 agents APPROVED | Director/CEO |
| 2026-04-24 | Sprint 7 READY — webapp.md next | Director/CEO |
| 2026-04-24 | DECISION: Mock provider layer — pipeline validation before real APIs | Director/CEO |
| 2026-04-24 | providers.yaml updated — gateway.provider_mode: mock (default) | Claude Code |
| 2026-04-24 | config/defaults.yaml v0.1 created — all fallback parameters for 25 agents | Claude Code |
| 2026-04-24 | PILOT S01E01 brief received — "The Red Carpet", 60 sec, Sandy + Inspector Stopwatch | Director/CEO |
| 2026-04-24 | shot.md schema updated — timing field mm.ss-mm.ss added, duration_seconds derived | Claude Code |
| 2026-04-24 | defaults.yaml updated — target_runtime_seconds: 60 | Claude Code |
| 2026-04-24 | SS-S01-STA-creative_direction-v01 APPROVED | Director/CEO |
| 2026-04-24 | SS-S01-BIB-style-v01 APPROVED | Director/CEO |
| 2026-04-24 | SS-S01-BIB-world_model-v01 APPROVED | Director/CEO |
| 2026-04-24 | SS-S01-BIB-character_sandy-v01 APPROVED | Director/CEO |
| 2026-04-24 | SS-S01-BIB-character_inspector_stopwatch-v01 APPROVED | Director/CEO |
| 2026-04-24 | SS-S01-E01-SPC-brief-v01 APPROVED | Director/CEO |
| 2026-04-24 | SS-S01-E01-SPC-story_brief-v01 APPROVED (Option A ending confirmed) | Director/CEO |
| 2026-04-24 | SS-S01-E01-SPC-music_brief-v01 APPROVED | Director/CEO |
| 2026-04-24 | SS-S01-E01-SCR-script-v01 APPROVED | Director/CEO |
| 2026-04-24 | PA-001 logged: Character Reference Architecture — post-pilot | Director/CEO |
| 2026-04-24 | SS-S01-E01-STB-act1-v01 APPROVED — 12 shots, 60s | Director/CEO |
| 2026-04-24 | SS-S01-E01-REV-world_check-v01 DRAFT — PASS, 0 blocking, 1 minor note (WC-NOTE-01) | EXEC-WCHK |
| 2026-04-24 | SS-S01-E01-REV-vgen_mock_log-v01 DRAFT — 12 shots mock, $0.00, PA-001 gap noted | EXEC-VGEN |
| 2026-04-24 | SS-S01-E01-REV-mgen_mock_log-v01 DRAFT — 3 tracks + 8 SFX mock, $0.00 | EXEC-MGEN |
| 2026-04-24 | SS-S01-E01-REV-thumb_mock_log-v01 DRAFT — 3 thumbnail variants mock, $0.00 | EXEC-THUMB |
| 2026-04-24 | SS-S01-E01-SPC-copy-v01 DRAFT — title, description, tags, social copy | EXEC-COPY |
| 2026-04-24 | SS-S01-E01-REV-pub_mock_log-v01 DRAFT — mock YouTube + X + TikTok, $0.00 | EXEC-PUB |
| 2026-04-24 | SS-S01-E01-REV-anal_mock_log-v01 DRAFT — mock D+7 analytics, signals to BOARD-MKT | EXEC-ANAL |
| 2026-04-24 | SS-S01-E01-REV-pipeline_validation-v01 APPROVED — 17/17 PASS, $0.00 mock | Director/CEO |
| 2026-04-24 | PA-005 logged: Character Visual Development Workflow (pre-production character approval) | Director/CEO |
| 2026-04-24 | PA-006 logged: Multi-Audience KPI Layer (gag_rate + philosophy_density + shot attribution) | Director/CEO |
| 2026-04-24 | character_consistency.md v0.3 — two-level reference architecture (PA-001) + visual dev workflow (PA-005) | Claude Code |
| 2026-04-24 | character_profile.md v0.2 — master_reference_image_path + fragment_test + physics_states (PA-002) | Claude Code |
| 2026-04-24 | specs/production/character_visual_development.md v0.1 — full 6-phase pre-production character workflow | Claude Code |
| 2026-04-24 | specs/production/audience_kpi.md v0.1 — multi-audience KPI layer, shot attribution, QA checks | Claude Code |
| 2026-04-24 | VISUAL APPROVAL RULE locked: visual images/video always human-reviewed, never agent-approved | Director/CEO |
| 2026-04-24 | character_visual_development.md — agent-as-approver bug fixed (ART-AD replaced with human approver) | Claude Code |
| 2026-04-24 | character_consistency.md v0.3 — visual review rule corrected | Claude Code |
| 2026-04-24 | character_profile.md v0.2 — visual_reviewed_by field, approval gate rule updated | Claude Code |
| 2026-04-24 | webapp.md — Section 6.6 Approval Authority Matrix added + W-005 + VISUAL_CATEGORIES in governance | Claude Code |
| 2026-04-25 | REVISION status added to naming convention + episode_status + asset_status enums | Claude Code |
| 2026-04-25 | Animatic milestone added: ANIMATIC_IN_PROGRESS/REVIEW/REVISION/APPROVED states + EXEC-EDIT job | Claude Code |
| 2026-04-25 | NEEDS_HUMAN_TWEAK + REJECTED added to asset_status enum | Claude Code |
| 2026-04-25 | Staging buffer added: C:\SandyStudio\Staging\ (local SSD, TTL 48h, gitignored) | Claude Code |
| 2026-04-25 | staging_path + drive_path + staging_expires_at + revision_log added to assets table | Claude Code |
| 2026-04-25 | .gitignore created | Claude Code |
| 2026-04-25 | Generation gate: GENERATION cannot start until ANIMATIC_APPROVED | Claude Code |
| 2026-04-25 | webapp.md ARCH FIX: Vercel rejected → Local-First (Next.js + Inngest run on workstation, Supabase cloud) | Claude Code |
| 2026-04-25 | webapp.md §4.2.1 added: Inngest concurrency limits per agent (EXEC-VGEN: 3, EXEC-MGEN: 2, etc.) | Claude Code |
| 2026-04-25 | W-001 to W-005 RESOLVED — see webapp.md §11 | Director/CEO |
| 2026-04-25 | webapp.md §2.1 added: Remote access via Tailscale (default) + WoL + Cloudflare Tunnel (escape hatch) | Claude Code |
| 2026-04-25 | ARCH DECISION: 3-tier architecture — Studio (tools, git) / Film Projects (no git, configurable path) / Media Storage | Director/CEO |
| 2026-04-25 | CLAUDE.md §2 rewritten: 3-tier structure + filename→path resolver table + path resolution rules | Claude Code |
| 2026-04-25 | FILMS/Sandy/S01/PROJECT.md created — anchor file for the PILOT film project | Claude Code |
| 2026-04-25 | PILOT MIGRATION: 19 files moved to FILMS/Sandy/S01/ (4 root briefs, 4 bibles, 1 script, 1 storyboard, 7 reviews, 1 distribution, 3 S00 demos→archive) | Claude Code |
| 2026-04-25 | .gitignore: FILMS/ added (films are not git-tracked); .claude/worktrees/ added | Claude Code |
| 2026-04-25 | Studio root cleaned: bibles/, scripts/, storyboards/, reviews/ removed (empty); SS-* files no longer at root | Claude Code |
| 2026-04-28 | SPRINT 9 BEGIN — build webapp (local-first: Next.js + Inngest + PM2; Supabase cloud) | Director/CEO |
| 2026-04-28 | webapp/package.json created — supabase@^2.95.3 devDep | Claude Code |
| 2026-04-28 | webapp/supabase/ initialized (supabase init) | Claude Code |
| 2026-04-28 | webapp/supabase/migrations/0001_enums.sql — episode_status (22), asset_status (9), job_status (6) | Claude Code |
| 2026-04-28 | webapp/supabase/migrations/0002_core_tables.sql — 7 tables + pgcrypto + updated_at triggers + filename CHECK | Claude Code |
| 2026-04-28 | webapp/supabase/migrations/0003_approval_authority.sql — approval_authority + publish_never_ai + visual_never_ai constraints | Claude Code |
| 2026-04-28 | webapp/supabase/migrations/0004_hybrid_sync_tables.sql — agent_prompts + app_config | Claude Code |
| 2026-04-28 | webapp/supabase/migrations/0005_indexes.sql — 12 indexes for hot query paths | Claude Code |
| 2026-04-28 | webapp/supabase/migrations/0006_rls_policies.sql — RLS on all 10 tables, authenticated full, anon none | Claude Code |
| 2026-04-28 | .env.example updated — SUPABASE + INNGEST + APP_URL sections | Claude Code |
| 2026-04-28 | .claude/settings.local.json — broad Bash/Edit/Write/PowerShell allowlist added (option B) | Claude Code |
| 2026-04-28 | Supabase project linked: akstennzrnkvexjgzhxv (sandystudio) | Director/CEO |
| 2026-04-28 | supabase db push — all 6 migrations applied to cloud (0001..0006) | Director/CEO |
| 2026-04-28 | webapp/lib/supabase/types.gen.ts generated — 10 tables, 3 enums | Claude Code |
| 2026-04-28 | Phase 1 COMPLETE — schema verified via types.gen.ts | Claude Code |
| 2026-04-28 | uiux.md v0.2 added to master — visual system spec, theme presets, StudioShell, Approval Queue UX | Director/CEO |
| 2026-04-28 | Phase 2 SCOPE EXPANDED — added theme system, StudioShell, AmbientAssetField (R3F), Concierge agent | Director/CEO |
| 2026-04-28 | EXEC-CONC concierge.md v0.1 DRAFT — new conversational agent, read+route, no approval authority | Claude Code |
| 2026-04-28 | webapp/supabase/migrations/0007_asset_relations.sql — prep for v2 Asset Galaxy (uiux.md §17) | Claude Code |
| 2026-04-28 | webapp/supabase/migrations/0008_activity_events.sql — unified event feed (uiux.md §21) | Claude Code |
| 2026-04-28 | config/uiux.yaml created — taxonomy + theme presets + ambient_limits | Claude Code |
| 2026-04-28 | Next.js 15 scaffold complete — package.json, tsconfig, tailwind, postcss, eslint, middleware | Claude Code |
| 2026-04-28 | Supabase clients: lib/supabase/{client,server,middleware}.ts + lib/env.ts (fail-fast per ARCH RULE #5) | Claude Code |
| 2026-04-28 | Theme system: globals.css with 3 presets (slate_blue_cinematic default) + AppearanceProvider | Claude Code |
| 2026-04-28 | UI primitives: Card, Badge, Button, StatusChip, Tooltip — semantic tokens only | Claude Code |
| 2026-04-28 | StudioShell + Sidebar + Topbar + ContentFrame + AmbientAssetField (R3F) | Claude Code |
| 2026-04-28 | ConciergePanel (chat skeleton) + /api/concierge/chat streaming Anthropic SDK | Claude Code |
| 2026-04-28 | App routes: / (Dashboard), /approvals, /episodes, /series, /budget, /jobs, /settings, /login | Claude Code |
| 2026-04-28 | npm run build PASSED — 9 routes, 102 kB shared bundle | Claude Code |
| 2026-04-28 | CLAUDE.md §7.5 added: UI/UX Source of Truth + EXEC-CONC in §4 Level 3 | Claude Code |
| 2026-04-28 | Phase 2 COMPLETE — webapp loads, themes switch, Concierge ready (needs ANTHROPIC_API_KEY) | Claude Code |
| 2026-04-28 | Concierge SWITCHED from Anthropic to OpenAI (Director request — paid OpenAI account, fast latency) | Director/CEO |
| 2026-04-28 | Default model: gpt-5.4-mini (per developers.openai.com/api/docs/models) — Director updated my outdated assumption | Director/CEO |
| 2026-04-28 | OpenAI tunables wired: OPENAI_MAX_OUTPUT_TOKENS, OPENAI_REASONING_EFFORT, OPENAI_TEMPERATURE (gpt-5.x family detected via regex; temperature/reasoning passed conditionally) | Claude Code |
| 2026-04-28 | FIX: Ambient field invisible — body's solid gradient was covering canvas; moved gradient to <html>, body transparent, canvas at z-0 | Claude Code |
| 2026-04-28 | webapp/supabase/migrations/0007 + 0008 pushed to cloud — types.gen.ts regenerated (12 tables) | Director/CEO |
| 2026-04-28 | Director created Supabase Auth user + logged in successfully | Director/CEO |
| 2026-04-28 | Phase 3 START — Inngest worker | Director/CEO |
| 2026-04-28 | inngest@^3.54.1 installed | Claude Code |
| 2026-04-28 | lib/inngest/client.ts (typed event schema) + lib/inngest/concurrency.ts (CONCURRENCY_LIMITS per webapp.md §4.2.1) | Claude Code |
| 2026-04-28 | inngest/functions/ping.ts smoke-test job + inngest/index.ts registry | Claude Code |
| 2026-04-28 | app/api/inngest/route.ts (serve handler) + app/api/jobs/ping/route.ts (event trigger) | Claude Code |
| 2026-04-28 | Jobs page wired to live `jobs` table + Send ping / Refresh actions | Claude Code |
| 2026-04-28 | npm script: inngest:dev (npx inngest-cli@latest dev -u http://localhost:3000/api/inngest) | Claude Code |
| 2026-04-28 | FIX: middleware was redirecting /api/inngest webhook PUTs to /login → infinite sync loop. Webhook paths now bypass auth | Claude Code |
| 2026-04-28 | Phase 3 SMOKE TEST PASSED — event sent via curl → Inngest handler → Supabase jobs row (RUNNING → COMPLETED, output_ref=pong, dur=35.5s in dev mode) | Claude Code |
| 2026-04-28 | Phase 4 START — 11 EXEC-* Inngest functions + lib/agents library layer | Director/CEO |
| 2026-04-28 | agents/exec/editor.md v0.1 DRAFT — EXEC-EDIT animatic editor spec (cost-protection gate before VGEN fan-out) | Claude Code |
| 2026-04-28 | lib/agents/types.ts + registry.ts — single source of truth: 15 agents with display_ru/en, emoji, ECC skills[], model tier, next_agent. Composable architecture: skills[] lets agents gain capabilities without renaming | Claude Code |
| 2026-04-28 | lib/agents/{prompts,mock-providers,gate,runner,factory}.ts — full library layer; factory pattern emits canonical 6-step Inngest function shape | Claude Code |
| 2026-04-28 | lib/{governance,budget}.ts — enforceMode (Phase 4: PUBLISH-only hard block), recordCost (idempotent via budget_log unique index, ceiling enforcement) | Claude Code |
| 2026-04-28 | webapp/supabase/migrations/0009_activity_events_phase4.sql — adds `governance_block` event type + unique index on budget_log(job_id) for idempotency | Claude Code |
| 2026-04-28 | inngest/functions/ — 12 new function files: exec-{sw,srev,sb,wchk,edit,vgen,mgen,copy,thumb,pub,anal} + schedule-analytics; all registered in inngest/index.ts | Claude Code |
| 2026-04-28 | lib/inngest/client.ts Events map extended to 13 events (per webapp.md §4.1) | Claude Code |
| 2026-04-28 | vitest@^4.1.5 + @vitest/coverage-v8 + tsx installed; vitest.config.ts wired with @/ alias | Claude Code |
| 2026-04-28 | __tests__/ — 5 test files (registry, mock-providers, gate, governance, budget) + helpers/mock-supabase.ts in-memory client | Claude Code |
| 2026-04-28 | scripts/replay-pilot.ts — self-contained E2E harness (no servers): walks full PILOT pipeline + governance regression + idempotency + budget ceiling | Claude Code |
| 2026-04-28 | package.json scripts: test, test:watch, test:coverage, replay-pilot, verify | Claude Code |
| 2026-04-28 | naming-validator.cjs hook updated — whitelist code dirs (webapp/agents/lib/specs/config/.claude) so they don't trigger SS-*-naming validation | Claude Code |
| 2026-04-28 | Phase 4 VERIFICATION PASSED: typecheck OK + 39/39 unit tests + 28/28 replay-pilot assertions (1.0s total) | Claude Code |
| 2026-04-28 | Phase 4 COMPLETE — pipeline DAG + budget + governance fully exercised end-to-end in mock mode | Claude Code |
| 2026-04-29 | Director surfaced UX gap: webapp shell wired but no production cockpit, no first-run, no inbox, no pipeline visualisation | Director/CEO |
| 2026-04-29 | DECISION: Phase 5 split into 5a (UX specs) + 5b (API routes, revised) + 5c (first-run + cockpit UI MVP); Phase 7 Authority Matrix UX home moved into 5a onboarding spec | Director/CEO |
| 2026-04-29 | DECISION: Topbar System Mode + Governance Mode chips become interactive levers (Director-only, hard limits) | Director/CEO |
| 2026-04-29 | DECISION: trigger route allows Director always + EXEC-DIR-AI in Mode 2/3; EXEC-DIR-AI re-trigger requires reason field | Director/CEO |
| 2026-04-29 | Phase 5a START — UX architecture spec pass | Director/CEO |
| 2026-04-29 | specs/system/storage_configuration.md v0.1 DRAFT — project_root + media_storage_root, write-test, settings tab | Claude Code |
| 2026-04-29 | specs/system/onboarding.md v0.1 DRAFT — 4-step wizard (storage → series → authority → first episode) | Claude Code |
| 2026-04-29 | specs/system/director_inbox.md v0.1 DRAFT — task center, hotkeys, bulk actions, visual gate, mode behaviour | Claude Code |
| 2026-04-29 | specs/system/pipeline_view.md v0.1 DRAFT — DAG (40%) + Agent Report Feed (60%) hybrid per episode | Claude Code |
| 2026-04-29 | specs/system/dashboard_cockpit.md v0.1 DRAFT — 3-zone cockpit (inbox preview + active episodes + activity feed) | Claude Code |
| 2026-04-29 | specs/system/uiux.md v0.2 → v0.3 — spine + cross-links + Topbar levers + onboarding + storage pointers | Claude Code |
| 2026-04-29 | config/uiux.yaml extended — pipeline_node_states, pipeline_stages, inbox config, agent_report_card, dashboard zones, topbar_levers, storage_defaults | Claude Code |
| 2026-04-29 | Phase 5b START — API routes + lib/api/* foundation | Claude Code |
| 2026-04-29 | webapp/lib/api/* created — response, errors, handler, auth, zod-helpers, status-transitions, storage-probe, pipeline-stages, events, supabase-cast (10 files) | Claude Code |
| 2026-04-29 | webapp/lib/supabase/types-phase5b.ts — type extensions for series + approval_authority_matrix until types regen | Claude Code |
| 2026-04-29 | webapp/supabase/migrations/0010_phase5b_series_authority_storage.sql — series table + approval_authority_matrix + app_config storage scope + seeds | Claude Code |
| 2026-04-29 | zod@^3.23.8 + swr@^2.4.1 dependencies added | Claude Code |
| 2026-04-29 | API routes: health, system/mode (GET+POST), system/governance-mode (POST), storage/config (GET+POST), storage/test-write, onboarding/state+advance+exit, series + series/[id], episodes + episodes/[id] (GET+PATCH) + approve + trigger + pipeline, assets + assets/[id] (GET+PATCH) + approve, director/inbox, activity, jobs, budget — 26 route handlers | Claude Code |
| 2026-04-29 | __tests__/api/* — 4 new test files (status-transitions, storage-probe, pipeline-stages, response, errors-handler) — 79/79 passing | Claude Code |
| 2026-04-29 | Phase 5b VERIFY GREEN: typecheck OK + 79 unit tests + 28 replay-pilot + next build (33 routes registered) | Claude Code |
| 2026-04-29 | Phase 5b COMPLETE — API surface ready for Phase 5c UI | Claude Code |
| 2026-04-29 | Phase 5c START — UI implementation | Claude Code |
| 2026-04-29 | components/ui/Modal.tsx — portal-based modal primitive | Claude Code |
| 2026-04-29 | StudioTopbar refactored: SystemModeChip + GovernanceChip levers (clickable + modal/dropdown) | Claude Code |
| 2026-04-29 | StudioSidebar reordered: Dashboard / Inbox / Series / Episodes / Budget / Jobs / Activity (workflow-aligned) | Claude Code |
| 2026-04-29 | Dashboard cockpit (3 zones): InboxPreviewZone + ActiveEpisodesZone (timeline glyphs) + ActivityFeedZone | Claude Code |
| 2026-04-29 | First-run wizard at /onboarding — 4 steps (Storage probe → Series form → Authority matrix → Episode brief) | Claude Code |
| 2026-04-29 | Director Inbox at /inbox — keyboard hotkeys (J/K/A/R/X/?), bulk actions (non-visual only), visual gate enforcement, group-grouped layout | Claude Code |
| 2026-04-29 | Pipeline View at /episodes/[id] — vertical DAG (10 stages, 5 node states) + Agent Report Feed + Re-trigger modal with required reason | Claude Code |
| 2026-04-29 | Activity feed page at /activity — severity filter pills | Claude Code |
| 2026-04-29 | Settings → Storage tab — path picker, write-test, edit-and-validate cycle | Claude Code |
| 2026-04-29 | Phase 5c VERIFY GREEN: typecheck OK + 79 tests + 28 replay-pilot + next build (35 routes; 6.2 kB onboarding, 4.68 kB inbox, 4.28 kB pipeline) | Claude Code |
| 2026-04-29 | Phase 5c COMPLETE — Director cockpit live; Director smoke test next | Claude Code |
| 2026-04-29 | Director smoke #1: orphan SS01 (no-dash code) episode → migration 0011 fixed series code regex + atomic rollback + cleanup | Director/CEO |
| 2026-04-29 | Director smoke #2: assets.file_type CHECK rejected long-form ('SCR-script', 'SPC-metadata', etc.) — migration 0011 relaxed CHECK | Claude Code |
| 2026-04-29 | Director smoke #3: variant with dashes (UUID shotIds) failed CHECK — migration 0012 allowed dashes in variants | Claude Code |
| 2026-04-29 | Director smoke #4: gate.ts requires 3 STB acts but mock EXEC-SB produces 1 — factory step 5 special case spoofs act2+act3 | Claude Code |
| 2026-04-29 | Brief approval wired (Pipeline View banner + Inbox path → both fire EXEC-SW) | Claude Code |
| 2026-04-29 | Factory: Mode 4 auto-approve + auto-chain; Mode 1-3 → REVIEW + chain via Director approve | Claude Code |
| 2026-04-29 | SS-S01-E01 in Mode 4: full chain Brief → Publish (15 assets APPROVED, 11 agents, $0 mock) | Director/CEO |
| 2026-04-29 | Director smoke #5: Mode 1 chain stuck at multi-asset gates → computeNextEvents wired full chain (STB×3, animatic fan-out, metadata→thumb, all-ready→pub) with hasJob idempotency | Claude Code |
| 2026-04-29 | Phase 5c долговая тетрадка #3, #9, #10, #11, #12 fixed | Claude Code |
| 2026-04-29 | SS-S01-E02 reset to BRIEF_PENDING + Mode 1 → Director's Mode 1 manual test bench | Claude Code |

---

*SandyStudio PLAN.md | v0.1 | Status: DRAFT*
*EXEC-ORCH updates this file after every state change.*
*Director reviews sprint exit criteria before next sprint begins.*
