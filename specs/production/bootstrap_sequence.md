# SandyStudio — Bootstrap Sequence
## specs/production/bootstrap_sequence.md | v0.1 | APPROVED

> The bootstrap sequence is the ordered list of documents that must be created
> the first time SandyStudio goes from zero to its first episode in production.
> Every step has strict dependencies. Nothing can be skipped.
> Follow this document exactly for the PILOT episode.

---

## WHY THIS EXISTS

The production pipeline (pipeline_overview.md) assumes that bibles, character profiles,
and a Master Plan already exist. They don't on Day 1.
This document defines what must be created first, and in what exact order.

---

## PHASE 0 — PRE-PRODUCTION STRATEGY
*Owners: Board of Directors + Director*
*Unlocks: Phase 1*

### Step 0.1 — Market Research
```
Agent:   BOARD-MKT
Input:   Director's strategic vector (stated intent)
Output:  Market research report → specs/company/ [naming: SS-PILOT-SPC-market_research-v01-DRAFT.md]
Contains: Target audience, competitive landscape, content gaps, platform analysis
```

### Step 0.2 — Budget Envelope
```
Agent:   BOARD-FIN
Input:   Market research report
Output:  Budget spec → specs/company/ [SS-PILOT-SPC-budget_envelope-v01-DRAFT.md]
Contains: API cost estimates (Veo3, Kling, Suno, Midjourney), per-episode budget, season budget
```

### Step 0.3 — Risk Register
```
Agent:   BOARD-CRIT
Input:   Market research + budget envelope
Output:  Risk register → specs/company/ [SS-PILOT-SPC-risk_register-v01-DRAFT.md]
Contains: Technical risks, financial risks, creative risks, mitigation per risk
```

### Step 0.4 — Creative Direction Pitch
```
Agent:   BOARD-CRD
Input:   Market research + brand guidelines (BOARD-FAI)
Output:  Creative direction doc → specs/company/ [SS-PILOT-SPC-creative_direction-v01-DRAFT.md]
Contains: Visual philosophy, tone, target aesthetic, series concept (title, genre, format)
```

### Step 0.5 — Full Board Pitch
```
Agents:  All Board agents contribute
Output:  Combined pitch document → specs/company/ [SS-PILOT-SPC-board_pitch-v01-DRAFT.md]
Contains: Series slate, budget, risks, creative direction — packaged for Director review
```

### Step 0.6 — Director Approves Series Slate
```
Gate:    Director reviews board pitch
         Director says: "approved" → Series Slate is LOCKED
         Series Slate contains:
           - Series title
           - Genre and tone
           - Target audience
           - Episode format (length, structure)
           - Episode count for Season 1
           - Budget ceiling
```

### Step 0.7 — Master Plan
```
Agents:  ART-PROD (lead) + all Board agents
Input:   APPROVED Series Slate
Output:  PLAN.md updated + SS-PILOT-SPC-master_plan-v01-DRAFT.md
         (using template: specs/company/master_plan_template.md)
Gate:    Director approves Master Plan → PRODUCTION UNLOCKED
```

---

## PHASE 1 — CREATIVE FOUNDATION
*Owners: Artistic Council + Exec agents*
*Unlocks: Phase 2*
*Must complete in this order: Style → World → Characters*

### Step 1.1 — Style Bible
```
Agent:   EXEC-STY
Input:   APPROVED Series Slate, APPROVED Master Plan
Output:  SS-PILOT-BIB-style-v01-DRAFT.md → bibles/style/
Contains:
  - Target audience (detailed personas)
  - Visual philosophy (2–3 sentences, the aesthetic north star)
  - Colour palette (primary, secondary, accent — with hex codes)
  - Animation style (line weight, shading approach, movement style)
  - Reference works (what this looks like, what it does NOT look like)
  - Tone of humour (physical comedy rules, dialogue style)
  - No-go list (what we never do visually or tonally)
Gate:    ART-AD reviews → Director approves
```

### Step 1.2 — World Bible
```
Agent:   ART-WB
Input:   APPROVED Style Bible
Output:  SS-PILOT-BIB-world-v01-DRAFT.md → bibles/world/
Contains:
  - Geography (where the series takes place — maps if relevant)
  - Physics rules (what's real, what's cartoon-exaggerated, what's impossible)
  - Time and era (when does this world exist)
  - Key locations (detailed description of recurring sets)
  - Lighting rules (time of day palette, indoor vs outdoor light)
  - Object inventory (recurring props with descriptions)
  - Sound design notes (for Music Supervisor)
Gate:    ART-CONT reviews for internal consistency → Director approves
```

### Step 1.3 — Character Profiles
```
Agent:   ART-CAST
Input:   APPROVED Style Bible, APPROVED World Bible
Output:  One file per character → bibles/characters/
         [SS-PILOT-BIB-character_[name]-v01-DRAFT.md]
Each profile contains (see specs/schemas/character_profile.md for full schema):
  - Full name and aliases
  - Visual appearance (exact description for AI prompt generation)
  - Canonical prompt fragment (the exact text injected into every shot prompt)
  - Personality and speech patterns
  - Relationships to other characters
  - Movement and gesture style
  - Things this character never says or does
Characters to create for Pink Panther series:
  - pink_panther (lead)
  - inspector_clouseau (recurring)
  - [additional characters per Series Slate]
Gate:    ART-AD reviews visual consistency → Director approves all profiles
```

### Step 1.4 — Foundation QA
```
Agent:   ART-CONT
Input:   Style Bible + World Bible + all Character Profiles
Output:  SS-PILOT-REV-foundation_qa-v01-DRAFT.md → reviews/
Checks:  Character appearances consistent with world rules
         Style bible applied consistently across all profiles
         No internal contradictions
Gate:    If issues found → back to relevant agent. If clean → Phase 2 unlocked.
```

---

## PHASE 2 — EPISODE DEVELOPMENT (PILOT)
*Owners: ART-HW + EXEC-SW*
*Unlocks: Phase 3*

### Step 2.1 — Season Arc
```
Agent:   ART-HW
Input:   APPROVED Series Slate + all approved bibles
Output:  SS-S01-SPC-season_arc-v01-DRAFT.md → specs/production/
Contains:
  - Episode list with one-line premise per episode
  - Character development arc across season
  - Running gags and recurring elements
  - Season-level story beats (if applicable)
Gate:    Director approves
```

### Step 2.2 — Pilot Episode Brief
```
Agent:   ART-HW
Input:   APPROVED Season Arc
Output:  SS-S01-PILOT-SPC-brief-v01-DRAFT.md (see specs/schemas/brief.md)
Gate:    Director approves brief
```

### Step 2.3 — Pilot Script
```
Agent:   EXEC-SW
Input:   APPROVED Episode Brief + all approved bibles
Output:  SS-S01-PILOT-SCR-[description]-v01-DRAFT.md → scripts/s01/
         (see specs/schemas/script.md for format)
Gate:    EXEC-SREV reviews → Director approves
Max iterations: 3 rewrites before Director decides path
```

---

## PHASE 3 — STORYBOARD (PILOT)
*Owners: EXEC-SB + EXEC-WCHK*
*Unlocks: Phase 4*

### Step 3.1 — Pilot Storyboard
```
Agent:   EXEC-SB
Input:   APPROVED Script + APPROVED World Bible + APPROVED Character Profiles
Output:  SS-S01-PILOT-STB-[act]-v01-DRAFT.md → storyboards/s01/
         (one file per act; see specs/schemas/shot.md for shot format)
Each shot must include:
  - Shot ID (sequential)
  - Scene and act reference
  - Camera angle and movement
  - Characters present (by name)
  - Action described in one sentence
  - Mood/emotion
  - Duration (seconds) ← critical for music sync
  - Location (from World Bible)
  - Lighting condition
  - Special effects or comic beats
```

### Step 3.2 — World Check
```
Agent:   EXEC-WCHK
Input:   Storyboard + World Bible + Character Profiles
Output:  SS-S01-PILOT-REV-world_check-v01-DRAFT.md → reviews/
Checks each shot against: location rules, character appearance consistency,
physics rules, object inventory
Gate:    Director approves storyboard
```

---

## PHASE 4 — GENERATION (PILOT)
*Owners: EXEC-VGEN + EXEC-MGEN + EXEC-WCHK*
*See pipeline_overview.md §3.4 and §3.5 for detailed flow*

### Step 4.1 — Music Brief
```
Agent:   ART-MS
Input:   APPROVED Storyboard (for timing and mood per scene)
Output:  SS-S01-PILOT-SPC-music_brief-v01-DRAFT.md → specs/production/
Contains: Scene list with duration, mood, instrumentation, reference tracks
Gate:    Director approves
```

### Step 4.2 — Generate: All shots
```
Agent:   EXEC-VGEN
Process: Per shot in storyboard (see pipeline_overview.md §3.4)
Output:  Raw video files → H:\My Drive\SandyStudio_Media\raw\video\
```

### Step 4.3 — Generate: Music tracks
```
Agent:   EXEC-MGEN
Process: Per scene in music brief
Output:  Raw audio files → H:\My Drive\SandyStudio_Media\raw\audio\
```

---

## PHASE 5 — ASSEMBLY + DISTRIBUTION (PILOT)
*See pipeline_overview.md §3.6 and Cycle 3*

### Step 5.1 — Assembly
```
Tool:    [per specs/system/assembly_tool.md — DECISION PENDING]
Input:   All approved shots + approved music
Output:  SS-S01-PILOT-VID-final_cut-v01-DRAFT.mp4 → raw/video/
Gate:    Director approves final cut → LOCKED
```

### Step 5.2 — Metadata + Thumbnail
```
Agents:  EXEC-COPY (metadata) + EXEC-THUMB (thumbnail)
Gate:    Director approves
```

### Step 5.3 — Publish
```
Agent:   EXEC-PUB
Gate:    Director explicit approval required (Category A decision)
```

### Step 5.4 — Analytics Collection
```
Agent:   EXEC-ANAL
Timing:  48–72 hours post-publish
Output:  Analytics report → BOARD-MKT for interpretation
```

---

## BOOTSTRAP DEPENDENCY MAP

```
0.1 Market Research
    └──► 0.2 Budget
    └──► 0.3 Risk Register
    └──► 0.4 Creative Direction
         └──► 0.5 Board Pitch
              └──► 0.6 Director: Series Slate APPROVED
                   └──► 0.7 Master Plan APPROVED
                        └──► 1.1 Style Bible APPROVED
                             └──► 1.2 World Bible APPROVED
                                  └──► 1.3 Character Profiles APPROVED
                                       └──► 1.4 Foundation QA
                                            └──► 2.1 Season Arc APPROVED
                                                 └──► 2.2 Episode Brief APPROVED
                                                      └──► 2.3 Script APPROVED
                                                           └──► 3.1 Storyboard
                                                                └──► 3.2 World Check APPROVED
                                                                     └──► 4.1 Music Brief APPROVED
                                                                     └──► 4.2 Generate Shots
                                                                     └──► 4.3 Generate Music
                                                                          └──► 5.1 Assembly APPROVED+LOCKED
                                                                               └──► 5.2 Metadata + Thumbnail APPROVED
                                                                                    └──► 5.3 Publish
                                                                                         └──► 5.4 Analytics
```

---

## CRITICAL PRE-CONDITIONS

Before Step 1.1 can start, these technical specs must be APPROVED:
- `specs/system/character_consistency.md` — determines how character profiles are written
- `specs/system/api_integrations.md` — determines what APIs are available
- `specs/system/assembly_tool.md` — determines asset format requirements

These are Sprint 3–4 deliverables. Bootstrap Phase 0 can proceed in parallel.
Bootstrap Phase 1 is blocked until those specs are APPROVED.

---

*SandyStudio bootstrap_sequence.md | v0.1 | Status: DRAFT*
*Prepared for Director review as part of Sprint 1.*
