# SandyStudio — Project State Spec
## specs/system/project_state.md | v0.2 | APPROVED

> Defines the schema and maintenance rules for PLAN.md as a machine-readable state file.
> PLAN.md is the solution to Claude Code's statelessness across sessions.
> Every session starts by reading CLAUDE.md then PLAN.md — nothing else is needed to resume.

---

## PURPOSE

Claude Code has no memory between sessions. Each session starts blank.
PLAN.md solves this by being the complete, current state of the studio.
When Claude Code reads PLAN.md at session start, it knows:
- What phase the studio is in
- What every file's current status is
- What is blocked and why
- What the next action is for every active asset
- Who owns what

PLAN.md is not a narrative document. It is a structured state machine.
It must be kept exactly current — stale state is as dangerous as no state.

---

## OWNERSHIP

**Writer:** EXEC-ORCH (the only agent that updates PLAN.md)
**Readers:** All agents, Director
**Frequency:** Updated after every state change to any tracked asset
**Format:** Markdown with structured tables — human-readable AND parseable by Claude Code

---

## PLAN.MD SECTIONS (required)

### Section 1: Current State Block

```markdown
## CURRENT STATE

\`\`\`
Phase:           [current sprint name]
Blocker:         [none | description of what is blocking]
Next:            [next sprint or next action]
File Edit Mode:  [===1=== | ===5===]
Governance Mode: [Mode 1 — MANUAL | Mode 2 — HYBRID | Mode 3 — DELEGATED | Mode 4 — AUTOTEST]
Date:            [ISO date of last update]
\`\`\`
```

This block is read first at every session start. If `Blocker` is not "none",
Claude Code asks Director for direction before proceeding.

---

### Section 2: Sprint Map

Full sprint list with statuses. Each sprint has:
- `✅ COMPLETE` with completion date
- `⏳ IN PROGRESS` with task table
- `🔒 BLOCKED` with blocker description

Sprint statuses update as work completes. Never delete completed sprints —
they form the audit trail.

---

### Section 3: Open Decisions

```markdown
## OPEN DECISIONS

| ID | Decision | Options | Owner | Due | Status |
|----|----------|---------|-------|-----|--------|
| D-001 | Character consistency | A1/A2/A3/A4 | Sandy | Before Sprint 4 | ⏳ OPEN |
| D-002 | Assembly tool | B1/B2/B3/B4 | Sandy | Before Sprint 4 | ⏳ OPEN |
```

When Director makes a decision: update Status to `✅ [choice made]` and fill in
the corresponding spec file.

---

### Section 4: Episode File Tracker

One table per episode in production. This is the most critical state section.

```markdown
## File Tracker — [Episode ID]

| Asset | File ID | Version | Status | QA | Owner | Next Action |
|-------|---------|---------|--------|-----|-------|-------------|
| Brief | SS-S01-E01-SPC-brief-v01 | v01 | APPROVED | — | — | → EXEC-SW |
| Script | SS-S01-E01-SCR-...-v01 | v01 | IN-PROGRESS | — | EXEC-SW | — |
| Script QA | — | — | PENDING | — | EXEC-SREV | Waiting on Script |
| Storyboard Act 1 | — | — | NOT STARTED | — | EXEC-SB | Waiting on Script |
| Shot S01E01-A1-SC01-SH01 | SS-S01-E01-PRO-video_...-v01 | v01 | GENERATED | PENDING | EXEC-WCHK | QA in progress |
| Shot S01E01-A1-SC01-SH02 | — | — | NOT STARTED | — | EXEC-VGEN | Waiting on SH01 QA |
```

**Status values for file tracker:**

| Status | Meaning |
|--------|---------|
| `NOT STARTED` | Asset not yet created |
| `IN-PROGRESS` | Agent actively working |
| `DRAFT` | File written, not yet submitted for review |
| `REVIEW` | Submitted for QA or Director review |
| `PASS-WITH-NOTES` | QA passed with minor issues logged |
| `APPROVED` | Director approved |
| `LOCKED` | Permanently frozen |
| `GENERATED` | Media file generated, awaiting QA |
| `QA FAIL (N/3)` | Failed QA, N attempts used |
| `ESCALATED` | Director review required (retry limit reached) |
| `INVALIDATED` | Upstream version changed — must be re-created |
| `BLOCKED` | Cannot proceed — see Next Action for reason |
| `SKIPPED` | Director decided to skip this asset |

---

### Section 5: Standing Approvals

```markdown
## Standing Approvals

| Asset Type | Scope | Condition | Granted | Revoked |
|-----------|-------|-----------|---------|---------|
| Storyboard shots | S01E02 onward | QA result = PASS (not PASS-WITH-NOTES) | 2026-05-01 | — |
```

---

### Section 6: Budget Tracker

```markdown
## Budget Tracker

| Episode | Budget | Spent | Remaining | Status |
|---------|--------|-------|-----------|--------|
| S01E01 | $50.00 | $12.30 | $37.70 | ✅ Within budget |

### API Spend Log — S01E01
| Date | Agent | API | Action | Cost |
|------|-------|-----|--------|------|
| 2026-05-01 | EXEC-VGEN | Veo3 | Shot S01E01-A1-SC01-SH01 | $1.20 |
```

---

### Section 7: Change Log

```markdown
## Change Log

| Date | Change | Agent |
|------|--------|-------|
| 2026-04-24 | governance.md APPROVED | Sandy |
| 2026-04-24 | Sprint 2 complete — 6 schemas created | Claude Code |
```

---

## STATE UPDATE RULES

1. **EXEC-ORCH updates PLAN.md after every state change.** No exceptions.
2. **Status values must be exact** — no freeform descriptions in Status column.
3. **File IDs must match naming convention exactly** — EXEC-ARCH validates.
4. **Completed sprints are never deleted** — mark `✅ COMPLETE` and leave in place.
5. **Budget Tracker is updated after every API call** — not in batches.
6. **If PLAN.md becomes stale** (not updated in a session where state changed):
   EXEC-ORCH flags this at next session start and reconciles from file system.

---

## SESSION START PROTOCOL (Claude Code)

At every session start, Claude Code:
```
1. Read CLAUDE.md
2. Read PLAN.md → Current State Block
3. If Blocker ≠ "none" → inform Director, ask for direction
4. If Mode = ===5=== in previous session → confirm with Director before writing
5. If open decisions exist → surface them to Director
6. Ask: "Ready to continue Sprint [N]? Or is there something specific you'd like to work on?"
```

Claude Code NEVER assumes the state from a previous session. Always reads PLAN.md.

---

*SandyStudio project_state.md | v0.1 | Status: DRAFT*
