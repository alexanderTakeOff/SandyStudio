# SandyStudio — Production Pipeline Overview
## specs/production/pipeline_overview.md | v0.2 | DRAFT

> Single authoritative map of the full SandyStudio lifecycle.
> Every agent, handoff, decision gate, and state transition in one place.
> When this conflicts with another document — this document wins.

---

## 1. THREE CYCLES

```
┌─────────────────────────────────────────────────────────────────────┐
│  CYCLE 1: COMPANY          CYCLE 2: PRODUCTION       CYCLE 3: DIST  │
│  Strategy, finance,        One episode: idea          Publish,       │
│  people, decisions         → final video file         analytics,     │
│                                                       feedback       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1b. APPROVAL AUTHORITY

Every gate in this pipeline requires approval. Two approvers exist:

| Approver | When active | What they can approve |
|----------|------------|----------------------|
| **Director/CEO** | Always | Everything — Category A, B, C |
| **AI-EP** | Only when Director/CEO has granted delegation | Category B only |

**Category A — Director/CEO only:**
Publish, LOCKED status, budget spend, access rights, Series Slate, Master Plan, final episode cut.

**Category B — AI-EP when delegated:**
Scripts, storyboards, shot QA escalations, music, style bible, world bible, character profiles.

**Category C — agents autonomous:**
DRAFT→REVIEW transitions, internal QA checks, prompt drafts, shot-level generation retries.

At every gate below: *"Director/CEO or AI-EP approves"* means Director/CEO directly,
OR AI-EP if delegation is active for that scope (see governance.md §2b–2c).

---

## 1c. EXEC-ORCH ROLE IN THE PIPELINE

`EXEC-ORCH` is active during **all** production phases. It is the pipeline's traffic controller.

**At every gate transition, EXEC-ORCH:**
1. Registers the approval in `PLAN.md`
2. Updates the file status (DRAFT → REVIEW → APPROVED)
3. Notifies the next agent in sequence
4. Logs: file path, version, approver identity, timestamp

EXEC-ORCH does not approve anything. It executes transitions after approval is given.

```
[Director/CEO or AI-EP says "approved"]
    │
    ▼
EXEC-ORCH
    ├── Updates file status in PLAN.md
    ├── Logs: file · version · approver · timestamp
    └── Triggers next agent in sequence
```

---

## 2. CYCLE 1 — COMPANY

```
DIRECTOR/CEO
    │  gives strategic vector
    ▼
BOARD OF DIRECTORS
    ├── BOARD-MKT  → Market research report
    ├── BOARD-FIN  → Budget envelope + cost projections
    ├── BOARD-CRIT → Risk register
    ├── BOARD-FAI  → Brand alignment check
    └── BOARD-CRD  → Creative direction pitch
    │
    │  All → combined PITCH document
    ▼
DIRECTOR/CEO approves → Series Slate            ← Category A
    │
    ▼
EXEC-ORCH logs Series Slate approval → triggers Master Plan phase
    │
    ▼
ART-PROD + BOARD → MASTER PLAN (specs/company/master_plan_template.md)
    │
    ▼
DIRECTOR/CEO approves Master Plan               ← Category A
    │
    ▼
EXEC-ORCH logs Master Plan approval → PRODUCTION UNLOCKED → activates Phase A agents
```

---

## 3. CYCLE 2 — PRODUCTION

### 3.1 Phase A — Creative Foundation (one-time per series)

```
EXEC-STY  →  Style Bible        (bibles/style/)
ART-WB    →  World Bible        (bibles/world/)
ART-CAST  →  Character Profiles (bibles/characters/)
    │
    ▼
ART-CONT  →  Continuity check across all three
    │
    ▼
DIRECTOR/CEO or AI-EP approves each bible      ← Category B
    │
    ▼
EXEC-ORCH logs each approval → updates PLAN.md → unlocks Phase B
```

**Dependencies:** Style Bible → World Bible → Character Profiles (strict order)

---

### 3.2 Phase B — Episode Development (per episode)

```
ART-HW  →  Season Arc Document  (one per season)
    │
    ▼
DIRECTOR/CEO or AI-EP approves Season Arc      ← Category B
    │
    ▼
EXEC-ORCH logs → triggers Episode Brief
    │
    ▼
ART-HW  →  Episode Brief  (specs/schemas/brief.md format)
    │
    ▼
DIRECTOR/CEO or AI-EP approves brief           ← Category B
    │
    ▼
EXEC-ORCH logs → triggers Screenwriter
    │
    ▼
EXEC-SW  →  Script  (scripts/s[NN]/ · specs/schemas/script.md)
    │
    ▼
EXEC-SREV  →  Script QA  (reviews/ · specs/schemas/qa_report.md)
    │
    ├── PASS →
    │         DIRECTOR/CEO or AI-EP approves script    ← Category B
    │             │
    │             ▼
    │         EXEC-ORCH logs → triggers Storyboard phase
    │
    └── FAIL → back to EXEC-SW  (max 3 iterations)
               3rd fail → EXEC-ORCH escalates to Director/CEO directly
               (AI-EP delegation suspended for this item)
```

---

### 3.3 Phase C — Storyboard (per episode)

```
EXEC-SB  →  Storyboard  (storyboards/s[NN]/ · specs/schemas/shot.md)
    │
    ▼
EXEC-WCHK  →  World Check  (reviews/ · specs/schemas/qa_report.md)
    │
    ├── PASS →
    │         ART-CONT  →  Continuity Check (cross-reference vs prior episodes)
    │             │
    │             ▼
    │         DIRECTOR/CEO or AI-EP approves storyboard   ← Category B
    │             │
    │             ▼
    │         EXEC-ORCH logs → triggers Phase D
    │
    └── FAIL → back to EXEC-SB for specific shots
```

---

### 3.4 Phase D — Visual Generation (per shot)

```
For each shot in approved storyboard:

EXEC-VGEN  reads shot (specs/schemas/shot.md)
    │
    ▼
EXEC-VGEN  writes prompt (specs/schemas/prompt.md)
    │  [injects character consistency fragment — specs/system/character_consistency.md]
    │
    ▼
EXEC-VGEN  calls API (specs/system/api_integrations.md)
    │
    ▼
Output → H:\My Drive\SandyStudio_Media\raw\video\
    │
    ▼
EXEC-WCHK  →  Shot QA  (specs/protocols/qa_retry.md)        ← Category C (autonomous)
    │
    ├── PASS → shot moves to reviewed/
    │           EXEC-ORCH logs shot completion → updates shot tracker in PLAN.md
    │
    └── FAIL → retry (max per specs/protocols/qa_retry.md)
              → retry exhausted → EXEC-ORCH escalates to Director/CEO
```

---

### 3.5 Phase E — Music Generation (per episode)

```
ART-MS  →  Music Brief  (mood · timing · instrumentation per scene)
    │
    ▼
DIRECTOR/CEO or AI-EP approves Music Brief     ← Category B
    │
    ▼
EXEC-ORCH logs → triggers Music Generator
    │
    ▼
EXEC-MGEN  writes prompt (specs/schemas/prompt.md)
    │
    ▼
EXEC-MGEN  calls API  (specs/system/api_integrations.md)
    │
    ▼
Output → H:\My Drive\SandyStudio_Media\raw\audio\
    │
    ▼
ART-MS  →  Music QA  (timing match · mood match · quality)
    │
    ├── PASS →
    │         DIRECTOR/CEO or AI-EP approves music         ← Category B
    │             │
    │             ▼
    │         EXEC-ORCH logs → marks music complete in PLAN.md
    │
    └── FAIL → retry or revise brief
```

**Timing rule:** Music must match scene duration ±2 seconds.
Shot timing (seconds) defined in storyboard. ART-MS owns duration contract.

---

### 3.6 Phase F — Assembly (per episode)

```
Inputs required (all must be in reviewed/ or approved/):
  ✓ All shots for episode (video files)
  ✓ Music track(s) for episode (audio files)
  ✓ Approved storyboard (for cut order and timing)

Assembly tool: FFmpeg  (specs/system/assembly_tool.md)

  1. Load shots in storyboard order
  2. Apply shot durations from storyboard
  3. Sync music to scene timing
  4. Export final episode file
  5. Output → H:\My Drive\SandyStudio_Media\raw\video\[episode_file]
    │
    ▼
DIRECTOR/CEO reviews assembled episode         ← Category A  (AI-EP cannot approve)
    │
    ├── APPROVED → episode moves to approved/
    │               EXEC-ORCH logs → marks episode APPROVED in PLAN.md
    │
    └── REVISION → specific shots or cuts flagged → back to relevant phase
                   EXEC-ORCH logs → marks affected assets INVALIDATED
    │
    ▼
DIRECTOR/CEO marks LOCKED → episode frozen     ← Category A only
    │
    ▼
EXEC-ORCH logs LOCKED → triggers Distribution phase
```

---

## 4. CYCLE 3 — DISTRIBUTION

```
Approved + LOCKED episode
    │
    ▼
EXEC-COPY  →  Metadata    (specs/distribution/metadata.md)
EXEC-THUMB →  Thumbnail   (image prompt → Midjourney → reviewed/)
    │
    ▼
DIRECTOR/CEO approves metadata + thumbnail     ← Category A
    │
    ▼
EXEC-ORCH logs → triggers Publisher
    │
    ▼
EXEC-PUB  →  Publish to YouTube                ← Category A: explicit Director/CEO command required
    │
    ▼
EXEC-ORCH logs publish event: URL · timestamp · platform
    │
    ▼
[48–72 hours post-publish]
    │
    ▼
EXEC-ANAL  →  Analytics Report  (specs/distribution/analytics.md)
    │
    ▼
BOARD-MKT  →  Interprets metrics → feeds back to Cycle 1
```

---

## 5. INTER-CYCLE FEEDBACK

```
Analytics (Cycle 3)
    │
    └──► BOARD-MKT analysis
              │
              └──► Director/CEO review
                        │
                        ├── Adjust: episode brief for next episode
                        ├── Adjust: style or tone direction
                        └── Strategic: new series decision
```

Full inter-agent spec: `specs/protocols/inter_agent_handoff.md`

---

## 6. STATE TRANSITIONS

```
[agent creates file]              →  DRAFT
[agent submits for review]        →  REVIEW
[Director/CEO or AI-EP approves]  →  APPROVED
[Director/CEO only]               →  LOCKED  (file frozen — new version for any change)
```

EXEC-ORCH tracks every file's state in PLAN.md.
State changes are never silent — EXEC-ORCH logs every transition with approver identity.

---

## 7. VERSION CASCADE RULE

When an upstream file changes version (e.g. script v01 → v02):

```
Script v02 approved
    │
    ▼
EXEC-ARCH identifies all downstream files derived from script v01:
    - Storyboard derived from script v01    → INVALIDATED
    - Shots derived from that storyboard    → INVALIDATED
    - Generated videos for those shots      → INVALIDATED
    │
    ▼
EXEC-ORCH updates PLAN.md: marks invalidated assets
    │
    ▼
Director/CEO reviews scope → approves re-production
```

Full spec: `specs/protocols/version_cascade.md`

---

## 8. AGENT ACTIVATION SEQUENCE

| Phase | Active Agents |
|-------|--------------|
| Company strategy | BOARD-MKT, BOARD-FIN, BOARD-CRIT, BOARD-FAI, BOARD-CRD |
| Creative foundation | EXEC-STY, ART-WB, ART-CAST, ART-CONT |
| Episode development | ART-HW, EXEC-SW, EXEC-SREV |
| Storyboard | EXEC-SB, EXEC-WCHK, ART-CONT |
| Generation | EXEC-VGEN, EXEC-MGEN, ART-MS |
| QA & state | EXEC-WCHK, EXEC-SREV, EXEC-ORCH, EXEC-ARCH |
| Distribution | EXEC-COPY, EXEC-THUMB, EXEC-PUB, EXEC-ANAL |
| Feedback | BOARD-MKT, BOARD-FIN |

**EXEC-ORCH** — active in ALL phases. Only agent that spans the full pipeline.
**EXEC-ARCH** — active at all times.
**AI-EP** — active only when Director/CEO has granted delegation.

---

## 9. DOCUMENT STATUS

| Document | Status | Notes |
|----------|--------|-------|
| `specs/production/pipeline_overview.md` | DRAFT | Awaiting Director/CEO approval |
| `specs/production/bootstrap_sequence.md` | **APPROVED** | Approved by Director/CEO 2026-04-24 |

---

*SandyStudio pipeline_overview.md | v0.2 | Status: DRAFT*
*Changes from v0.1: EXEC-ORCH shown at every gate transition · AI-EP approval authority added ·*
*Category A/B/C classification · "Sandy" replaced with "Director/CEO" · FFmpeg confirmed.*
