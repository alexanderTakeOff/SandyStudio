# SandyStudio — Inter-Agent Handoff Protocol
## specs/protocols/inter_agent_handoff.md | v0.1 | DRAFT

> Defines how one agent signals completion and hands work to the next.
> This protocol is the nervous system of the pipeline.
> Every agent must follow it. EXEC-ORCH enforces it.

---

## CORE PRINCIPLE

Agents do not call each other directly. There are no direct agent-to-agent messages.
All handoffs are **file-based**. An agent signals completion by:
1. Writing its output file with the correct status
2. Updating PLAN.md with the new state
3. EXEC-ORCH reads PLAN.md and determines what happens next

This design means the pipeline survives session breaks. Claude Code can always
resume by reading PLAN.md and CLAUDE.md — the state is in the files, not in memory.

---

## HANDOFF SEQUENCE

```
PRODUCING AGENT                    EXEC-ORCH                    NEXT AGENT
      │                                │                              │
      │ 1. Completes task              │                              │
      │ 2. Writes output file          │                              │
      │    status: DRAFT               │                              │
      │ 3. Writes QA request entry     │                              │
      │    to PLAN.md shot/file tracker│                              │
      ├──────────────────────────────► │                              │
      │                                │ 4. Reads PLAN.md             │
      │                                │ 5. Identifies next agent     │
      │                                │    per pipeline_overview     │
      │                                │ 6. Updates PLAN.md:          │
      │                                │    next agent = ACTIVE       │
      │                                ├────────────────────────────► │
      │                                │                              │ 7. Reads assigned file
      │                                │                              │ 8. Executes task
      │                                │                              │ 9. Handoff back
      │                                │ ◄────────────────────────────┤
      │                                │ 10. Routes output            │
      │                                │     (review, approval, next) │
```

---

## PLAN.MD AS THE HANDOFF MEDIUM

PLAN.md contains a file tracker section (per episode). Each row is one asset:

```markdown
## File Tracker — S01E01

| Asset | File | Version | Status | Owner | Next Action |
|-------|------|---------|--------|-------|-------------|
| Episode Brief | SS-S01-E01-SPC-brief-v01 | v01 | APPROVED | — | → EXEC-SW |
| Script | SS-S01-E01-SCR-...-v01 | v01 | IN PROGRESS | EXEC-SW | — |
| Script QA | — | — | PENDING | EXEC-SREV | waiting on Script |
```

EXEC-ORCH updates this table after every state change.
This table is the handoff signal — the next agent reads it to know they are activated.

---

## HANDOFF TRIGGER CONDITIONS

An agent is triggered when ALL of the following are true:
1. Its input file(s) exist in the correct path
2. Its input file(s) have status ≥ `APPROVED` (or `REVIEW` for QA agents)
3. PLAN.md file tracker shows `→ [AGENT-ID]` in the "Next Action" column
4. System is in `===5===` EDIT MODE (for write operations)

An agent must NOT begin if any input is still in `DRAFT` status.

---

## Mode 1 — MANUAL HANDOFF

In Mode 1 — MANUAL (default), the handoff includes a human checkpoint:

```
Agent completes task
    │
    ▼
Agent presents output to Director with:
  - One paragraph summary of what was produced
  - Autonomous decisions made (and why)
  - Open questions or risks flagged
    │
    ▼
Director responds:
  "approved"     → Agent writes file, updates PLAN.md, EXEC-ORCH routes next
  "revise: [X]"  → Agent revises and re-presents
  "escalate"     → Director takes direct control of this step
```

Agent must not write the file until Director says "approved".

---

## Mode 2/3 — DELEGATED HANDOFF

In Mode 2/3 — DELEGATED (Director-activated per agent):

```
Agent completes task
    │
    ▼
Agent writes output file (status: REVIEW)
    │
    ▼
Agent updates PLAN.md
    │
    ▼
EXEC-ORCH routes to next agent automatically
    │
    ▼
Director receives digest (not individual approval request)
```

Director receives a daily digest listing all AUTOPILOT actions taken.
Director may pause AUTOPILOT at any time by saying `===1===`.

---

## QA HANDOFF (special case)

When a QA agent (EXEC-SREV, EXEC-WCHK, ART-MS) completes a review:

```
QA Agent writes QA Report (specs/schemas/qa_report.md)
    │
    ├── overall_result: PASS ──────────────────────────────────────────► EXEC-ORCH
    │                                                                    routes to Director
    │                                                                    for APPROVED status
    │
    ├── overall_result: FAIL + retry_count < max ────────────────────► EXEC-ORCH
    │                                                                    routes back to
    │                                                                    producing agent
    │                                                                    with revision_instructions
    │
    └── overall_result: FAIL + retry_count ≥ max ──────────────────► EXEC-ORCH
                                                                       escalates to Director
                                                                       with escalation_reason
```

---

## HANDOFF CHECKLIST (every agent, every handoff)

Before completing a handoff, the producing agent must verify:

- [ ] Output file exists at correct path per CLAUDE.md naming convention
- [ ] Output file status field is correct (DRAFT for new work, REVIEW if submitting)
- [ ] `source_version` or `brief_version` fields reference the correct upstream version
- [ ] PLAN.md file tracker updated with new status
- [ ] If Mode 1 — MANUAL: summary prepared for Director
- [ ] If any input was INVALIDATED during this work: flag to EXEC-ORCH immediately

---

## BLOCKED STATE

If an agent cannot complete its task (missing input, INVALIDATED source, API failure):

1. Agent writes a `BLOCKED` entry to PLAN.md file tracker
2. Agent states the blocking reason clearly
3. EXEC-ORCH routes to Director for resolution
4. No silent failures — every block is visible in PLAN.md

---

*SandyStudio inter_agent_handoff.md | v0.1 | Status: DRAFT*
