# SandyStudio — Production Pipeline Overview
## specs/production/pipeline_overview.md | v0.1 | DRAFT

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

## 2. CYCLE 1 — COMPANY

```
DIRECTOR 
    │
    │  Gives strategic vector
    ▼
BOARD OF DIRECTORS
    ├── BOARD-MKT  → Market research report
    ├── BOARD-FIN  → Budget envelope + cost projections
    ├── BOARD-CRIT → Risk register
    ├── BOARD-FAI  → Brand alignment check
    └── BOARD-CRD  → Creative direction pitch
    │
    │  All → combined PITCH document → Director
    ▼
DIRECTOR approves → Series Slate (title, format, audience, episode count)
    │
    ▼
ART-PROD + BOARD → MASTER PLAN (see specs/company/master_plan_template.md)
    │
    ▼
DIRECTOR approves Master Plan → PRODUCTION UNLOCKED
```

**Handoff:** Each Board agent writes their section to a shared pitch document.
**Gate:** Director must say "approved" before any production asset is created.

---

## 3. CYCLE 2 — PRODUCTION

### 3.1 Phase A — Creative Foundation (one-time per series)

```
EXEC-STY  →  Style Bible        (bibles/style/)
ART-WB    →  World Bible        (bibles/world/)
ART-CAST  →  Character Profiles (bibles/characters/) [one file per character]
    │
    │  All three reviewed by ART-CONT (continuity check)
    ▼
DIRECTOR approves all three → EPISODE PRODUCTION UNLOCKED
```

**Dependencies:**
- Style Bible: needs Series Slate (audience, genre)
- World Bible: needs Style Bible
- Character Profiles: need World Bible + Style Bible

---

### 3.2 Phase B — Episode Development (per episode)

```
ART-HW  →  Season Arc Document  (one per season)
    │
    ▼
ART-HW  →  Episode Brief        (specs/schemas/brief.md format)
    │
    ▼
DIRECTOR approves brief
    │
    ▼
EXEC-SW  →  Script              (scripts/s[NN]/  — specs/schemas/script.md format)
    │
    ▼
EXEC-SREV  →  Script Review     (reviews/ — specs/schemas/qa_report.md format)
    │
    ├── PASS → Director approves script
    └── FAIL → back to EXEC-SW (max 3 iterations, then Director decides)
    │
    ▼
DIRECTOR approves script
```

---

### 3.3 Phase C — Storyboard (per episode)

```
EXEC-SB  →  Storyboard          (storyboards/s[NN]/ — specs/schemas/shot.md format)
             [one shot block per shot]
    │
    ▼
EXEC-WCHK  →  World Check       (reviews/ — specs/schemas/qa_report.md format)
    │
    ├── PASS → Director approves storyboard
    └── FAIL → back to EXEC-SB for specific shots
    │
    ▼
ART-CONT  →  Continuity Check   (cross-reference vs prior episodes)
    │
    ▼
DIRECTOR approves storyboard
```

---

### 3.4 Phase D — Visual Generation (per shot)

```
For each shot in approved storyboard:

EXEC-VGEN  reads shot (specs/schemas/shot.md)
    │
    ▼
EXEC-VGEN  writes prompt (specs/schemas/prompt.md format)
    │        [injects character consistency fragment — see specs/system/character_consistency.md]
    │
    ▼
EXEC-VGEN  calls API (see specs/system/api_integrations.md)
    │
    ▼
Output → H:\My Drive\SandyStudio_Media\raw\video\
    │
    ▼
EXEC-WCHK  →  Shot QA           (specs/protocols/qa_retry.md)
    │
    ├── PASS → shot moves to reviewed/
    └── FAIL → retry (max attempts per specs/protocols/qa_retry.md)
              → if retry exhausted → escalate to Director
    │
    ▼
EXEC-ORCH  updates project state (PLAN.md shot tracker)
```

---

### 3.5 Phase E — Music Generation (per episode)

```
ART-MS  →  Music Brief          (mood, timing, instrumentation per scene)
    │
    ▼
EXEC-MGEN  writes prompt (specs/schemas/prompt.md format)
    │
    ▼
EXEC-MGEN  calls API (Suno/Udio — see specs/system/api_integrations.md)
    │
    ▼
Output → H:\My Drive\SandyStudio_Media\raw\audio\
    │
    ▼
ART-MS  →  Music QA             (timing match, mood match, quality)
    │
    ├── PASS → audio moves to reviewed/
    └── FAIL → retry or revise brief
    │
    ▼
DIRECTOR approves music
```

**Timing ownership:** ART-MS owns duration. Shot timing (seconds per shot) defined in
storyboard (specs/schemas/shot.md includes `duration_seconds` field).
Music brief references those durations. Music Generator must produce tracks
matching scene duration ±2 seconds.

---

### 3.6 Phase F — Assembly (per episode)

```
Inputs required (all must be in reviewed/ or approved/):
  ✓ All shots for episode (video files)
  ✓ Music track(s) for episode (audio files)
  ✓ Approved storyboard (for cut order and timing)

Assembly tool: [DECISION PENDING — see specs/system/assembly_tool.md]

Process:
  1. Load shots in storyboard order
  2. Apply shot durations from storyboard
  3. Sync music to scene timing
  4. Export final episode file
  5. Output → H:\My Drive\SandyStudio_Media\raw\video\[episode_file]
    │
    ▼
DIRECTOR reviews assembled episode
    │
    ├── APPROVED → episode moves to approved/
    └── REVISION → specific shots or cuts flagged, back to relevant phase
    │
    ▼
DIRECTOR marks LOCKED → episode frozen
```

---

## 4. CYCLE 3 — DISTRIBUTION

```
Approved + LOCKED episode
    │
    ▼
EXEC-COPY  →  Metadata          (title, description, tags — specs/distribution/metadata.md)
EXEC-THUMB →  Thumbnail         (image prompt → Midjourney → reviewed/)
    │
    ▼
DIRECTOR approves metadata + thumbnail
    │
    ▼
EXEC-PUB   →  Publish to YouTube (specs/distribution/youtube.md)
    │
    ▼
[48–72 hours post-publish]
    │
    ▼
EXEC-ANAL  →  Analytics Report  (specs/distribution/analytics.md)
    │
    ▼
BOARD-MKT  →  Interprets metrics → feeds back to Company Cycle
              (influences next episode brief, future series slate)
```

---

## 5. INTER-CYCLE FEEDBACK

```
Analytics (Cycle 3)
    │
    └──► BOARD-MKT analysis
              │
              └──► Director review
                        │
                        ├── Adjust: episode brief for next episode
                        ├── Adjust: style or tone direction
                        └── Strategic: new series decision
```

This closes the loop. Analytics influence the next production cycle.
Full spec: `specs/protocols/inter_agent_handoff.md` (Sprint 3).

---

## 6. STATE TRANSITIONS

Every file passes through this exact sequence:

```
[agent creates file]  →  DRAFT
[agent submits]       →  REVIEW
[Director approves]   →  APPROVED
[Director locks]      →  LOCKED  (file frozen — new version required for changes)
```

EXEC-ORCH tracks every file's state in PLAN.md.
State changes are never silent — EXEC-ORCH logs every transition.

---

## 7. VERSION CASCADE RULE

When an upstream file changes version (e.g. script v01 → v02):

```
Script v02 approved
    │
    ▼
EXEC-ARCH identifies all downstream files derived from script v01:
    - Storyboard derived from script v01 → status → INVALIDATED
    - All shots derived from invalidated storyboard → INVALIDATED
    - All generated videos for those shots → INVALIDATED
    │
    ▼
EXEC-ORCH updates PLAN.md: marks invalidated assets
    │
    ▼
Director reviews invalidation scope → approves re-production
```

Full spec: `specs/protocols/version_cascade.md` (Sprint 3).

---

## 8. AGENT ACTIVATION SEQUENCE

Not all agents are active at once. Activation follows production phase:

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

EXEC-ORCH is active during all production phases.
EXEC-ARCH is active at all times.

---

## 9. DOCUMENT STATUS

| Document | Status | Notes |
|----------|--------|-------|
| `specs/production/pipeline_overview.md` | DRAFT | Awaiting Director approval |
| `specs/production/bootstrap_sequence.md` | DRAFT | Awaiting Director approval |

---

*SandyStudio pipeline_overview.md | v0.1 | Status: DRAFT*
*Prepared for Director review as part of Sprint 1.*
