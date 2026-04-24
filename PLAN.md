# SandyStudio — PLAN.md
## Master Production Tracker | v0.1 | DRAFT

> This file is the single source of truth for what phase the studio is in,
> what is blocked, what is next, and who owns what.
> Updated by EXEC-ORCH after every state change.
> Read by Claude Code at every session start (after CLAUDE.md).

---

## CURRENT STATE

```
Phase:    SPRINT 8 — Mock Pipeline Validation COMPLETE
Blocker:  none
Next:     Director reviews 9 DRAFT files → PA-001 implementation → real generation
Mode:     ===1=== ANALYTICS (default)
Date:     2026-04-24
```

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
| 2026-04-24 | SS-S01-E01-REV-pipeline_validation-v01 DRAFT — 17/17 steps PASS, real est. $12.32/ep | EXEC-ORCH |

---

*SandyStudio PLAN.md | v0.1 | Status: DRAFT*
*EXEC-ORCH updates this file after every state change.*
*Director reviews sprint exit criteria before next sprint begins.*
