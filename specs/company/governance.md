# Director/CEOStudio — Company Governance
## specs/company/governance.md | v0.2 | APPROVED

> This document defines who Director/CEOStudio is, how it makes decisions,
> and what authority each level holds. It is the highest-level document
> in the project. All other specs, plans, and agent instructions
> operate within the boundaries defined here.

---

## 1. COMPANY IDENTITY

| Field | Value |
|-------|-------|
| **Company name** | Director/CEOStudio |
| **Type** | AI-first animation production company |
| **Output** | Multi-episode animated comedy series |
| **First project** | Comedy series in the style of The Pink Panther |
| **Operating model** | Human leadership + AI agent workforce |

---

## 2. LEADERSHIP

### The Director / CEO (Showrunner / Executive Producer)
**Role:** Human founder and final authority of Director/CEOStudio.

The Director/CEO is the single point of ultimate authority in Director/CEOStudio.
In film industry terms, this role combines:
- **Showrunner** — ultimate creative authority over the series
- **Executive Producer (EP)** — final sign-off on all production decisions
- **CEO** — ultimate authority over company direction, investments, and operations

No output, decision, plan, or commitment is valid without the Director's explicit approval — unless authority has been formally delegated to EXEC-DIR-AI (see Section 2b).

### What the Director does
- Sets the strategic vector for the company and each project
- Reviews and approves pitches from the Board of Directors
- Approves the Master Plan before any production begins
- Signs off on APPROVED and LOCKED status for any file
- Grants and revokes access rights for all human and AI participants
- Switches system and agent operating modes
- Grants and revokes EXEC-DIR-AI delegation authority
- Can override any agent decision at any time, without explanation

### What the Director does NOT do
- Does not write scripts, prompts, or briefs directly
- Does not manage agent-to-agent communication
- Does not track file versions or naming conventions
- Does not search for market data or trends

These tasks belong to agents.

---

### 2b. EXEC-DIR-AI — AI Executive Producer (Delegated Proxy)

The AI Executive Producer (`EXEC-DIR-AI`) is a Level 0.5 agent that acts as the Director's proxy for production approvals when explicitly authorised.

**Default state:** No authority. Acts in PROPOSE MODE like all other agents.

**When delegated:** The Director grants EXEC-DIR-AI a specific scope:
```
Example: "EXEC-DIR-AI: I delegate approval of scripts and storyboards for S01."
→ governance.md updated with delegation scope and date
→ EXEC-DIR-AI may approve Category B items within that scope
→ Director receives a daily digest of all EXEC-DIR-AI approvals
```

**Delegation format (stored in this file under Section 2c):**
```
EXEC-DIR-AI.scope:    [list of file types / pipeline phases]
EXEC-DIR-AI.series:   [e.g. S01, PILOT, ALL]
EXEC-DIR-AI.granted:  [date]
EXEC-DIR-AI.expires:  [date or "until revoked"]
```

**Revocation:** The Director says "EXEC-DIR-AI: revoke delegation" at any time.
Effect is immediate. All pending approvals revert to Director queue.

**EXEC-DIR-AI must ALWAYS escalate to Director when:**
- Output conflicts with an APPROVED bible, style guide, or governance rule
- QA retry limit reached (3 attempts) with no passing output
- Decision involves Category A authority (publish, LOCKED, budget, access)
- Confidence in correct approval is below acceptable threshold
- The Vector Principle detects misalignment with Director's stated intent

---

### 2c. Current EXEC-DIR-AI Delegation

*No active delegation. EXEC-DIR-AI is in PROPOSE MODE.*

*(This section is updated by EXEC-ARCH when the Director grants or revokes delegation.)*

---

## 3. SYSTEM OPERATION MODES

The system has two global operation modes that govern whether file modifications are permitted.
The current mode must be visible in the project UI at all times.

### ===1=== ANALYTICS MODE (default)
```
Default state at the start of every session.
Read-only. Analysis, discussion, and planning only.
No files are created, modified, or deleted.
Agents may think, propose, and draft — but nothing is written to disk.
```

### ===5=== EDIT MODE
```
File modifications are permitted.
Activated explicitly by the Director by appending ===5=== to a command.
Returns to ===1=== automatically at session end, or when Director says ===1===.

Example:
  "Create the folder structure for Season 01 ===5==="
  → System switches to EDIT MODE, executes, confirms changes made.
```

### Rules
- Every session starts in ===1=== regardless of previous state
- Only the Director can activate ===5===
- Agents must refuse file write operations if mode is ===1===
- Agents must confirm: "Mode is ===1===. To apply changes, append ===5=== to your command."
- Mode state is logged in every session record

---

## 4. AGENT OPERATING MODES

Independent of the system mode above, agents operate in one of two modes
that govern how autonomous their execution is.

### PROPOSE MODE (default during development)
```
Agent completes its task and produces a full output.
Output is presented to the Director (or authorized human) for review.
Nothing is saved or passed to the next agent until explicitly accepted.

Flow:
  Agent → produces output → presents with summary → waits for ACCEPT / REJECT / REVISE
```

### AUTOPILOT MODE (production use)
```
Agent completes its task, saves output, and passes to the next agent
in the pipeline automatically.
Director receives a digest of completed actions, not individual approvals.

Flow:
  Agent → produces output → saves → triggers next agent → logs action
```

### Mode switching
- Default at project launch: **PROPOSE MODE** for all agents
- The Director switches individual agents or entire councils to AUTOPILOT
- Mode per agent is stored in that agent's instruction file under `## Operating Mode`
- During beta / debugging: all agents in PROPOSE MODE
- When stable: agents can be promoted to AUTOPILOT council by council

### When an agent in AUTOPILOT must stop and ask
Even in AUTOPILOT, an agent must pause and request Director input when:
- The task conflicts with an approved spec or bible
- A required input file is missing or has DRAFT status
- The output would affect a LOCKED file
- Confidence in the correct output is below acceptable threshold
- The Vector Principle detects a misalignment (see Section 8)

---

## 5. HUMAN PARTICIPANTS & ACCESS CONTROL

Director/CEOStudio supports multiple human participants. Each participant has an identity,
a role, and a defined set of permissions.

### Participant roles

| Role | Description |
|------|-------------|
| **Director** | Full access. All rights. Cannot be restricted. |
| **Producer** | Can approve REVIEW → APPROVED for production files (not LOCKED) |
| **Developer** | Can edit agent instruction files in `agents/`. Cannot touch content files. |
| **Reviewer** | Read access to all files. Can add comments. Cannot modify. |
| **Observer** | Read-only access to approved outputs only. |

### Permission matrix

| Action | Director | Producer | Developer | Reviewer | Observer |
|--------|----------|----------|-----------|----------|---------|
| Activate ===5=== | ✓ | — | — | — | — |
| Switch agent modes | ✓ | — | — | — | — |
| Grant / revoke access | ✓ | — | — | — | — |
| Approve → LOCKED | ✓ | — | — | — | — |
| Approve → APPROVED | ✓ | ✓ | — | — | — |
| Edit agent files | ✓ | — | ✓ | — | — |
| Edit content files | ✓ | ✓ | — | — | — |
| Add review comments | ✓ | ✓ | ✓ | ✓ | — |
| Read all files | ✓ | ✓ | ✓ | ✓ | — |
| Read approved only | ✓ | ✓ | ✓ | ✓ | ✓ |

### Access management rules
- Only the Director grants and revokes participant roles
- Access rights are stored in `specs/company/participants.md`
- Developers may edit agent logic but cannot change governance documents
- All participant actions are logged with identity and timestamp
- The Director may suspend any participant's access instantly, without process

### Authentication
- Authentication mechanism to be defined in `specs/system/auth.md`
- Until auth system is implemented: Director approval is required before
  any non-Director participant acts on the system

---

## 6. DECISION AUTHORITY MATRIX

Every decision in Director/CEOStudio falls into one of three categories:

### Category A — Director Approval Required
| Decision type | Examples |
|---------------|---------|
| Strategic direction | Choosing a new series, changing genre, pivoting |
| Master Plan approval | Before any production phase begins |
| Budget commitments | Any API spend above a defined threshold |
| File status: APPROVED | Moving any file to APPROVED status |
| File status: LOCKED | Locking any version permanently |
| Hiring / retiring agents | Adding or removing agents from any council |
| Publishing / releasing | Any content that leaves the studio system |
| Access rights | Granting or revoking human participant access |
| Mode changes | Switching ===5=== or AUTOPILOT for any agent |

### Category B — Council Recommendation, Director Approves
| Decision type | Prepared by |
|---------------|-------------|
| Series slate (title, format, audience) | Board of Directors |
| Master Plan draft | Planning Agent + Board |
| Style bible | Art Director + Style Creator |
| World bible | World Builder |
| Character profiles | Casting Director |
| Episode scripts | Head Writer |
| Season production plan | Producer |

### Category C — Agent Autonomous
| Decision type | Handled by |
|---------------|-----------|
| File naming and versioning | Archivist |
| DRAFT → REVIEW status change | Any producing agent |
| Internal QA checks | Script Reviewer, World Checker |
| Prompt generation (drafts) | Visual Generator, Music Generator |
| Cross-reference checks | Continuity Supervisor |

---

## 7. CHAIN OF COMMAND

```
DIRECTOR (Director/CEO)
    │
    │  Strategic vector + final approval
    │
    ▼
BOARD OF DIRECTORS  (AI agents — strategic level)
    │
    │  Pitches, recommendations, Master Plan drafts
    │  Nothing from the Board is executed without Director approval
    │
    ▼
ARTISTIC COUNCIL  (AI agents — creative management level)
    │
    │  Creative briefs, style decisions, world model
    │  Operates within Director-approved parameters only
    │
    ▼
EXECUTIVE AGENTS  (AI agents — production level)
    │
    │  Scripts, storyboards, prompts, QA reports
    │  Produce outputs → pass to Review → wait for approval
    │
    ▼
OUTPUT FILES
    (DRAFT → REVIEW → APPROVED → LOCKED)
```

---

## 8. THE VECTOR PRINCIPLE

> The Director's words are a vector of intent, not a direct command.

This principle governs how all agents must interpret Director input:

1. **Receive** the Director's stated intent
2. **Check** whether it aligns with the current approved Master Plan and project goals
3. **If aligned** — proceed with the task
4. **If misaligned** — surface the conflict to the Director before proceeding
5. **If unclear** — ask one clarifying question. Do not assume.

This principle applies to all agents at all levels.
Blind execution is a failure mode, not a success state.

---

## 9. THE MASTER PLAN

Before any production begins, a **Master Plan** must exist and be approved by the Director.
Prepared by a planning agent under direction from the Board of Directors. Contains:
- Project slate: title, genre, format, target audience, episode count
- Production phases and milestones
- Agent activation schedule
- Budget envelope
- Risk register (prepared by Cautious Critic)

**No episode enters production without an approved Master Plan.**

---

## 10. APPROVAL PROTOCOL

When an agent produces output requiring Director approval:

1. Agent sets file status to `REVIEW`
2. Agent produces a one-paragraph **summary** of what was created and why
3. Agent lists any **decisions made autonomously** during production
4. Agent flags any **open questions** or risks
5. Director responds:
   - **"approved"** → status moves to `APPROVED`
   - Gives feedback → agent revises, increments version, back to `REVIEW`
   - **"locked"** → status moves to `LOCKED`, file is permanently frozen

---

## 11. WHAT AGENTS CANNOT DO — EVER

Regardless of any instruction, prompt, mode, or context:

- Cannot mark a file `APPROVED` or `LOCKED` without Director confirmation
- Cannot spend real money or call paid APIs without an approved budget
- Cannot publish, post, or distribute any content externally
- Cannot modify a `LOCKED` file (create a new version instead)
- Cannot override another agent's `APPROVED` output without Director instruction
- Cannot claim to represent the Director or speak on Director/CEO's behalf
- Cannot write files to disk when system is in ===1=== ANALYTICS MODE
- Cannot switch their own operating mode from PROPOSE to AUTOPILOT

---

## 12. DOCUMENT STATUS

All specs follow SDD order. A spec cannot be built until its layer dependencies are approved.

### Layer 0 — Foundation
| Document | Status | Notes |
|----------|--------|-------|
| `specs/company/governance.md` | **APPROVED** | Approved by Director 2026-04-23 |

### Layer 1 — System Architecture (blocked by L0)
| Document | Status | Notes |
|----------|--------|-------|
| `PLAN.md` | NOT STARTED | Master production tracker |
| `specs/production/pipeline_overview.md` | NOT STARTED | Full lifecycle with all handoffs |
| `specs/production/bootstrap_sequence.md` | NOT STARTED | Order of first-run document creation |

### Layer 2 — Data Schemas (blocked by L1)
| Document | Status | Notes |
|----------|--------|-------|
| `specs/schemas/brief.md` | NOT STARTED | Creative brief format |
| `specs/schemas/script.md` | NOT STARTED | Script file format |
| `specs/schemas/shot.md` | NOT STARTED | Shot description format |
| `specs/schemas/character_profile.md` | NOT STARTED | Character profile format |
| `specs/schemas/qa_report.md` | NOT STARTED | QA report format |
| `specs/schemas/prompt.md` | NOT STARTED | Generation prompt format |

### Layer 3 — Protocols (blocked by L2)
| Document | Status | Notes |
|----------|--------|-------|
| `specs/protocols/inter_agent_handoff.md` | NOT STARTED | File-based handoff between agents |
| `specs/protocols/version_cascade.md` | NOT STARTED | Upstream change → downstream invalidation |
| `specs/protocols/qa_retry.md` | NOT STARTED | Retry loop: count, owner, escalation |
| `specs/protocols/batch_approval.md` | NOT STARTED | Batch review mechanism for Director |

### Layer 4 — Technical Decisions (blocked by L2, parallel with L3)
| Document | Status | Notes |
|----------|--------|-------|
| `specs/system/character_consistency.md` | NOT STARTED | **Requires Director decision: approach** |
| `specs/system/assembly_tool.md` | NOT STARTED | **Requires Director decision: tool** |
| `specs/system/api_integrations.md` | NOT STARTED | Veo3, Kling, Suno, Udio, YouTube |
| `specs/system/project_state.md` | NOT STARTED | State file schema (Claude Code memory) |
| `specs/system/media_formats.md` | NOT STARTED | Codecs, resolutions, naming |
| `specs/system/auth.md` | NOT STARTED | Authentication mechanism |

### Layer 5 — Company Specs (parallel with L2–L4)
| Document | Status | Notes |
|----------|--------|-------|
| `specs/company/participants.md` | NOT STARTED | Human access registry |
| `specs/company/master_plan_template.md` | NOT STARTED | Master Plan template |

### Layer 6 — Distribution (blocked by L4)
| Document | Status | Notes |
|----------|--------|-------|
| `specs/distribution/youtube.md` | NOT STARTED | YouTube API, upload, scheduling |
| `specs/distribution/metadata.md` | NOT STARTED | Title, description, tags templates |
| `specs/distribution/analytics.md` | NOT STARTED | Metrics collection and reporting |

### Layer 7 — Agent Instructions (blocked by L2+L3+L4)
| Document | Status | Notes |
|----------|--------|-------|
| All 20 existing agent files | STUB | Empty — awaiting schemas/protocols |
| `agents/exec/orchestrator.md` | NOT STARTED | New agent |
| `agents/exec/copywriter.md` | NOT STARTED | New agent |
| `agents/exec/thumbnail_creator.md` | NOT STARTED | New agent |
| `agents/exec/publisher.md` | NOT STARTED | New agent |
| `agents/exec/analytics_collector.md` | NOT STARTED | New agent |

---

*Director/CEOStudio governance.md | v0.3 | Status: APPROVED*
*Approved by Director (Director/CEO) on 2026-04-23.*
