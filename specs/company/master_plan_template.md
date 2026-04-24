# SandyStudio — Master Plan Template
## specs/company/master_plan_template.md | v0.1 | APPROVED

> This is a template. It is filled by the Planning Agent for each new project.
> Fields marked [FILL] must be completed before the plan can be submitted for Director approval.
> Fields marked [AUTO] are populated automatically by the system.
> No production phase begins without Director approval of the completed plan.

---

## 1. PROJECT SLATE

| Field | Value |
|-------|-------|
| **Project ID** | [FILL] — Format: `SS-[YEAR]-[NUMBER]` e.g. `SS-2025-001` |
| **Series title** | [FILL] |
| **Logline** | [FILL] — One sentence. What happens, to whom, with what twist. |
| **Genre** | [FILL] — e.g. Silent comedy / Slapstick / Absurdist |
| **Style reference** | [FILL] — e.g. "The Pink Panther (1969-1980 cartoons)" |
| **Format** | FORMAT A — Pure Shorts |
| **Episode duration** | 45–55 seconds |
| **Episode structure** | 1 gag = 1 setup + 1 punchline. Self-contained. No cliffhangers. |
| **Episodes planned** | [FILL] — Minimum 10 for pilot batch |
| **Target audience** | [FILL] — Age range, interests, platform behaviour |
| **Primary platform** | YouTube Shorts |
| **Secondary platform** | [FILL] — e.g. Instagram Reels, TikTok |
| **Content rating** | [FILL] — G / PG |
| **Language** | [FILL] — Dialogue / silent / subtitled |
| **Aspect ratio** | 9:16 (vertical, Shorts-native) |
| **Resolution** | 1080 × 1920 minimum |

---

## 2. CREATIVE FOUNDATION

These documents must exist and be APPROVED before the plan can be approved.
The Planning Agent verifies each one before submitting.

| Document | Path | Required status | Actual status |
|----------|------|----------------|---------------|
| World Bible | `bibles/world/` | APPROVED | [AUTO] |
| Style Bible | `bibles/style/` | APPROVED | [AUTO] |
| Character profiles (all main cast) | `bibles/characters/` | APPROVED | [AUTO] |
| Visual reference sheet | `bibles/style/` | APPROVED | [AUTO] |

> If any document is missing or not APPROVED, the Planning Agent flags it
> and halts plan submission until resolved.

---

## 3. PRODUCTION PHASES

Each phase has: entry conditions, active agents, deliverables, and an approval gate.
No phase begins until the previous phase gate is approved by the Director.

---

### Phase 0 — Development
**Purpose:** Define the world, characters, and style before writing a single script.

**Entry conditions:**
- Project Slate approved by Director
- Budget envelope approved (Section 5)

**Active agents:**
| Agent | Task |
|-------|------|
| `BOARD-MKT` | Competitive research: what Shorts comedy exists, what gaps are available |
| `BOARD-CRIT` | Risk assessment for the concept |
| `ART-WB` | Draft World Bible |
| `ART-CAST` | Draft character profiles for all main characters |
| `ART-AD` | Draft Style Bible and visual reference sheet |
| `EXEC-STY` | Draft style document: audience, philosophy, tone |
| `EXEC-ARCH` | Initialize asset registry, confirm naming conventions |

**Deliverables:**
- `SS-[ID]-PILOT-BIB-world_model-v01-REVIEW.md`
- `SS-[ID]-PILOT-BIB-character_[name]-v01-REVIEW.md` (one per main character)
- `SS-[ID]-PILOT-BIB-style_guide-v01-REVIEW.md`
- `SS-[ID]-PILOT-REV-market_research-v01-REVIEW.md`
- `SS-[ID]-PILOT-REV-risk_register-v01-REVIEW.md`

**Gate 0 — Director approves all Phase 0 deliverables before Phase 1 begins.**

---

### Phase 1 — Pre-Production (per episode batch)
**Purpose:** Write and approve scripts. Break into shots. Verify against world model.

**Recommended batch size:** 5 episodes at a time.

**Entry conditions:**
- Gate 0 passed
- All Phase 0 bibles have APPROVED status

**Active agents:**
| Agent | Task |
|-------|------|
| `ART-HW` | Issue creative brief for each episode |
| `EXEC-SW` | Write script for each episode |
| `EXEC-SREV` | QA each script against style bible and world model |
| `EXEC-SB` | Break approved script into shots |
| `EXEC-WCHK` | Verify each shot against world bible |
| `ART-CONT` | Cross-check character behaviour against approved profiles |
| `EXEC-ARCH` | Register all new files, verify naming |

**Deliverables per episode:**
- `SS-[ID]-[SEASON]-[EP]-SCR-full_script-v01-REVIEW.md`
- `SS-[ID]-[SEASON]-[EP]-REV-script_qa-v01-REVIEW.md`
- `SS-[ID]-[SEASON]-[EP]-STB-shot_list-v01-REVIEW.md`
- `SS-[ID]-[SEASON]-[EP]-REV-world_check-v01-REVIEW.md`

**Gate 1 — Director approves shot list for each episode before Phase 2 begins.**

---

### Phase 2 — Production (per episode)
**Purpose:** Generate all visual and audio assets.

**Entry conditions:**
- Gate 1 passed for this episode
- Shot list has APPROVED status

**Active agents:**
| Agent | Task |
|-------|------|
| `ART-MS` | Issue music brief for the episode |
| `EXEC-VGEN` | Generate all shots via Veo3 / Midjourney / Kling API |
| `EXEC-MGEN` | Generate music and sound via Suno / Udio API |
| `EXEC-WCHK` | Verify generated images against world model and approved shot list |
| `EXEC-ARCH` | Register all generated assets in media registry |

**Deliverables per episode:**
- All shots: `H:\My Drive\SandyStudio_Media\raw\video\` and `\images\`
- Music track: `H:\My Drive\SandyStudio_Media\raw\audio\`
- World check report: `SS-[ID]-[SEASON]-[EP]-REV-visual_qa-v01-REVIEW.md`

**Gate 2 — Director reviews generated assets. Approves or requests regeneration.**

---

### Phase 3 — Post-Production (per episode)
**Purpose:** Assemble, edit, add titles and sound. Final QA before publishing.

**Entry conditions:**
- Gate 2 passed
- All assets in `reviewed/` folder on media drive

**Active agents:**
| Agent | Task |
|-------|------|
| `ART-CONT` | Final continuity check across all shots |
| `EXEC-ARCH` | Move approved assets to `approved/` folder, update registry |

**Note:** Video assembly and editing currently requires human or external tool.
Assembly agent (`EXEC-EDIT`) is planned for future phases.

**Deliverables:**
- Final assembled video: `H:\My Drive\SandyStudio_Media\approved\video\`
- `SS-[ID]-[SEASON]-[EP]-VID-final-v01-APPROVED.mp4`

**Gate 3 — Director gives final approval on assembled episode before distribution.**

---

### Phase 4 — Distribution
**Purpose:** Publish to platforms.

**Entry conditions:**
- Gate 3 passed
- Episode has LOCKED status

**Active agents:**
- Distribution agent not yet defined. Manual publishing until agent is built.

**Gate 4 — Director authorizes publish. No agent publishes autonomously.**

---

## 4. AGENT ACTIVATION SCHEDULE

| Agent | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|-------|---------|---------|---------|---------|---------|
| `BOARD-MKT` | ✓ | — | — | — | — |
| `BOARD-CRIT` | ✓ | — | — | — | — |
| `ART-WB` | ✓ | — | — | — | — |
| `ART-CAST` | ✓ | — | — | — | — |
| `ART-AD` | ✓ | — | — | — | — |
| `ART-MS` | — | — | ✓ | — | — |
| `ART-HW` | — | ✓ | — | — | — |
| `ART-CONT` | — | ✓ | — | ✓ | — |
| `EXEC-STY` | ✓ | — | — | — | — |
| `EXEC-SW` | — | ✓ | — | — | — |
| `EXEC-SREV` | — | ✓ | — | — | — |
| `EXEC-SB` | — | ✓ | — | — | — |
| `EXEC-WCHK` | — | ✓ | ✓ | — | — |
| `EXEC-VGEN` | — | — | ✓ | — | — |
| `EXEC-MGEN` | — | — | ✓ | — | — |
| `EXEC-ARCH` | ✓ | ✓ | ✓ | ✓ | — |

---

## 5. BUDGET ENVELOPE

| Line item | Unit cost estimate | Planned units | Estimated total | Notes |
|-----------|-------------------|---------------|----------------|-------|
| Veo3 / video generation | [FILL] | [FILL] shots | [FILL] | Per episode: ~8-12 shots |
| Midjourney / image generation | [FILL] | [FILL] images | [FILL] | Style development + retries |
| Suno / music generation | [FILL] | [FILL] tracks | [FILL] | 1 track per episode |
| Claude API (agent calls) | [FILL] | [FILL] calls | [FILL] | All text-based agents |
| Storage (Google Drive) | [FILL] | [FILL] GB/mo | [FILL] | Media files |
| **Total per episode** | | | **[FILL]** | |
| **Total for pilot batch (10 ep)** | | | **[FILL]** | |

**Authorization threshold:** Any single API call or purchase above $[FILL] requires Director approval before execution.

**Budget owner:** `BOARD-FIN`

---

## 6. RISK REGISTER

Prepared by `BOARD-CRIT`. Updated at each phase gate.

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|-----------|
| R01 | Character inconsistency across shots | HIGH | HIGH | World Checker + approved visual reference sheet mandatory |
| R02 | API cost overrun | MEDIUM | MEDIUM | Per-episode budget cap enforced by BOARD-FIN |
| R03 | Generated content not matching style bible | MEDIUM | HIGH | Script Reviewer + World Checker gates before any generation |
| R04 | Pacing: 45-55s gag falls flat | MEDIUM | MEDIUM | Script Reviewer evaluates comedic structure explicitly |
| R05 | Platform policy violation (YouTube Shorts) | LOW | HIGH | Content rating check before Gate 4 |
| R06 | Agent instruction file outdated vs current bible | MEDIUM | MEDIUM | EXEC-ARCH validates agent files at Phase 0 start |
| [FILL] | [Additional risks from BOARD-CRIT analysis] | | | |

---

## 7. APPROVAL GATES SUMMARY

| Gate | Phase transition | What Director reviews | Blocking? |
|------|-----------------|----------------------|-----------|
| Gate 0 | Dev → Pre-Production | All bibles, style guide, risk register | YES |
| Gate 1 | Pre-Production → Production | Shot list per episode | YES |
| Gate 2 | Production → Post-Production | Generated visual + audio assets | YES |
| Gate 3 | Post-Production → Distribution | Final assembled episode | YES |
| Gate 4 | Distribution → Published | Authorize publish | YES |

All gates are blocking. No exceptions without explicit Director override documented in writing.

---

## 8. PLAN STATUS

| Field | Value |
|-------|-------|
| **Prepared by** | [AUTO] — Planning Agent |
| **Prepared on** | [AUTO] |
| **Submitted to Director** | [AUTO] |
| **Director decision** | PENDING |
| **Approved on** | [AUTO] |
| **Version** | v01 |
| **Status** | DRAFT |

---

*SandyStudio master_plan_template.md | v0.1 | Status: APPROVED | Approved by Director Sandy*
*Template ready. Fill [FILL] fields for each new project before submitting for Director approval.*
