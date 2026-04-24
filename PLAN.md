# SandyStudio — PLAN.md
## Master Production Tracker | v0.1 | DRAFT

> This file is the single source of truth for what phase the studio is in,
> what is blocked, what is next, and who owns what.
> Updated by EXEC-ORCH after every state change.
> Read by Claude Code at every session start (after CLAUDE.md).

---

## CURRENT STATE

```
Phase:    SPRINT 6 — Agent Instructions (blocked on 2 decisions + spec approvals)
Blocker:  D-001 (character consistency) and D-002 (assembly tool) — Director to decide
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
**Status:** ✅ COMPLETE (2026-04-24)

| Task | Status |
|------|--------|
| `specs/schemas/brief.md` | ✅ DRAFT |
| `specs/schemas/script.md` | ✅ DRAFT |
| `specs/schemas/shot.md` | ✅ DRAFT |
| `specs/schemas/character_profile.md` | ✅ DRAFT |
| `specs/schemas/qa_report.md` | ✅ DRAFT |
| `specs/schemas/prompt.md` | ✅ DRAFT |

---

### SPRINT 3 — Protocol Specs
**Status:** ✅ COMPLETE (2026-04-24)

| Task | Status |
|------|--------|
| `specs/protocols/inter_agent_handoff.md` | ✅ DRAFT |
| `specs/protocols/version_cascade.md` | ✅ DRAFT |
| `specs/protocols/qa_retry.md` | ✅ DRAFT |
| `specs/protocols/batch_approval.md` | ✅ DRAFT |

---

### SPRINT 4 — Technical Decisions
**Status:** ✅ COMPLETE (2026-04-24) — awaiting Director decisions on D-001, D-002
**Parallel with:** Sprint 5

| Task | Status |
|------|--------|
| `specs/system/character_consistency.md` | ✅ DRAFT — **⚠️ D-001 needed** |
| `specs/system/assembly_tool.md` | ✅ DRAFT — **⚠️ D-002 needed** |
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
**Status:** 🔒 BLOCKED — awaiting D-001, D-002 decisions + Director approval of DRAFT specs
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
| D-001 | Character visual consistency approach | A1 / A2 / A3 / A4 | Sandy | Before Sprint 4 |
| D-002 | Assembly tool | B1 / B2 / B3 / B4 | Sandy | Before Sprint 4 |

---

## CHANGE LOG

| Date | Change | By |
|------|--------|----|
| 2026-04-23 | PLAN.md created, SDD structure established | Claude Code |
| 2026-04-23 | 5 new agents identified: ORCH, COPY, THUMB, PUB, ANAL | Claude Code |
| 2026-04-23 | Spec hierarchy defined (7 layers, 23 files) | Claude Code |

---

*SandyStudio PLAN.md | v0.1 | Status: DRAFT*
*EXEC-ORCH updates this file after every state change.*
*Director reviews sprint exit criteria before next sprint begins.*
