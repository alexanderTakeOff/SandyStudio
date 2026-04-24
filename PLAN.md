# SandyStudio — PLAN.md
## Master Production Tracker | v0.1 | DRAFT

> This file is the single source of truth for what phase the studio is in,
> what is blocked, what is next, and who owns what.
> Updated by EXEC-ORCH after every state change.
> Read by Claude Code at every session start (after CLAUDE.md).

---

## CURRENT STATE

```
Phase:    SPRINT 6 — Agent Instructions (IN PROGRESS)
Blocker:  none
Next:     Sprint 7 — First Production Run (PILOT)
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
| `specs/distribution/youtube.md` | ✅ DRAFT |
| `specs/distribution/metadata.md` | ✅ DRAFT |
| `specs/distribution/analytics.md` | ✅ DRAFT |

---

### SPRINT 6 — Agent Instructions
**Status:** ⏳ IN PROGRESS
**This is the first "build" sprint — all prior sprints are spec-only**

#### New agents to create (5)
| File | Agent |
|------|-------|
| `agents/exec/orchestrator.md` | EXEC-ORCH |
| `agents/exec/copywriter.md` | EXEC-COPY |
| `agents/exec/thumbnail_creator.md` | EXEC-THUMB |
| `agents/exec/publisher.md` | EXEC-PUB |
| `agents/exec/analytics_collector.md` | EXEC-ANAL |

#### Existing agent stubs to fill (20)
All files in `agents/board/`, `agents/artistic/`, `agents/exec/`
Each file must contain: Role, Inputs, Outputs, Operating Mode, Step-by-step process, Edge cases

**Exit criteria:** All 25 agent files APPROVED by Director

---

### SPRINT 7 — First Production Run (PILOT)
**Status:** 🔒 BLOCKED by Sprint 6
**This is when actual animation production begins**

Follow `specs/production/bootstrap_sequence.md` exactly.

---

## EPISODE TRACKER

*No episodes in production yet.*

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

---

*SandyStudio PLAN.md | v0.1 | Status: DRAFT*
*EXEC-ORCH updates this file after every state change.*
*Director reviews sprint exit criteria before next sprint begins.*
