# SandyStudio — AI Animation Studio
## CLAUDE.md | Project Constitution v0.4

> This file is read by Claude Code at every session start.
> It defines the studio structure, file paths, naming conventions, and agent roles.

---

## 1. STUDIO OVERVIEW

**SandyStudio** is an AI-first animation production studio.
The goal is to produce multi-episode animated comedy series using specialized AI agents at every level of production — from market analysis to final video generation.

**First project:** Comedy series in the style of The Pink Panther.
**Owner & Final Approver:** CEO / Director — no output ships without explicit human approval.

---

## 2. FILE STORAGE PATHS

| Type | Path | Notes |
|------|------|-------|
| Project root (code, configs, text) | `C:\SandyStudio\` | Git repository |
| Media staging (pre-approval) | `C:\SandyStudio\Staging\` | Local SSD only — never committed to git. TTL 48h for non-approved files. |
| Media output (approved assets) | `H:\My Drive\SandyStudio_Media\` | Google Drive — receives files only after APPROVED status. |

### Project folder structure (C:\SandyStudio\)
```
C:\SandyStudio\
├── CLAUDE.md                  ← This file
├── .gitignore
├── agents/                    ← Agent instruction files
│   ├── board/                 ← Board of Directors agents
│   ├── artistic/              ← Artistic Council agents
│   └── exec/                  ← Executive production agents
├── bibles/                    ← World bibles, style guides, character profiles
│   ├── world/
│   ├── characters/
│   └── style/
├── scripts/                   ← Screenplays
│   └── s01/                   ← Season 01
├── storyboards/               ← Shot breakdowns
│   └── s01/
├── prompts/                   ← AI generation prompts (video, image, music)
│   ├── video/
│   ├── image/
│   └── music/
├── reviews/                   ← QA reports from reviewer agents
├── specs/                     ← Company and system specifications
│   ├── company/               ← Governance, org structure, authority
│   ├── production/            ← Pipeline overview, bootstrap sequence
│   ├── schemas/               ← Data schemas: brief, script, shot, etc.
│   ├── protocols/             ← Inter-agent protocols: handoff, QA, versioning
│   ├── distribution/          ← YouTube, metadata, analytics specs
│   └── system/                ← Technical: auth, APIs, media formats, state
├── archive/                   ← Approved and locked versions
└── Staging/                   ← Local SSD buffer for generated media (pre-approval)
                               ← TTL 48h — non-approved files auto-deleted
                               ← gitignored — never committed

```

### Media folder structure (H:\My Drive\SandyStudio_Media\)
```
H:\My Drive\SandyStudio_Media\
├── raw/                       ← Unreviewed AI-generated output
│   ├── video/
│   ├── images/
│   └── audio/
├── reviewed/                  ← Passed QA check
└── approved/                  ← Director-approved final output
    ├── video/
    ├── images/
    └── audio/
```

---

## 3. FILE NAMING CONVENTION

Every file in this project must be uniquely identifiable by its name alone.

### Format:
```
[PROJECT]-[SEASON]-[EPISODE]-[TYPE]-[DESCRIPTION]-[VERSION]-[STATUS].[ext]
```

### Codes:
| Field | Values | Example |
|-------|--------|---------|
| PROJECT | `SS` (SandyStudio) | `SS` |
| SEASON | `S01`, `S02`... | `S01` |
| EPISODE | `E01`, `E02`... or `PILOT` | `E03` |
| TYPE | `SCR` script, `STB` storyboard, `IMG` image, `VID` video, `AUD` audio, `BIB` bible, `PRO` prompt, `REV` review, `SPC` spec, `STA` state | `SCR` |
| DESCRIPTION | Short snake_case | `opening_scene` |
| VERSION | `v01`, `v02`... | `v02` |
| STATUS | `DRAFT`, `REVIEW`, `REVISION`, `APPROVED`, `LOCKED` | `APPROVED` |

### Examples:
```
SS-S01-E01-SCR-opening_scene-v01-DRAFT.md
SS-S01-E01-STB-act1-v01-REVIEW.md
SS-S01-E01-IMG-pink_panther_kitchen-v03-APPROVED.png
SS-S01-E01-VID-scene_02_shot_04-v01-DRAFT.mp4
SS-PILOT-BIB-world_model-v01-APPROVED.md
SS-PILOT-BIB-character_pink_panther-v01-APPROVED.md
```

---

## 4. AGENT STRUCTURE

### Level 0 — Founder (Human)
| Role | Authority |
|------|-----------|
| **CEO / Director** | Final authority. Grants/revokes human and EXEC-DIR-AI access. Switches system and agent operating modes. All APPROVED and LOCKED statuses require explicit CEO/Director sign-off unless delegated to EXEC-DIR-AI. |

---

### Level 0.5 — AI Executive Producer (Delegated Authority AI Agent)
| Agent ID | Name | Role | File |
|----------|------|------|------|
| `EXEC-DIR-AI` | AI Executive Producer | Acts as Director's proxy with delegated approval authority. Approves Category B production outputs when authorised. Escalates Category A decisions to Director. Authority granted and revoked exclusively by the Director. | `agents/exec/ai_ep.md` |

> **Delegation rule:** EXEC-DIR-AI has NO authority by default. The Director explicitly grants scope (e.g. "EXEC-DIR-AI: approve scripts and storyboards for S01"). The Director revokes at any time with a single command. All EXEC-DIR-AI approvals are logged with rationale.

---

### Level 1 — Board of Directors (Strategic AI Agents)
Agents at this level handle strategic decisions: market, finance, vision, risk.
They pitch ideas to the Director and receive final direction.

| Agent ID | Name | Role | File |
|----------|------|------|------|
| `BOARD-MKT` | Market Analyst | Market research, niche detection, competitive analysis | `agents/board/market_analyst.md` |
| `BOARD-FIN` | Financial Analyst | Budget, API cost tracking, ROI | `agents/board/financial_analyst.md` |
| `BOARD-FAI` | Founder AI | Brand alignment, mission guardian | `agents/board/founder_ai.md` |
| `BOARD-CRIT` | Cautious Critic | Risk assessment, devil's advocate | `agents/board/cautious_critic.md` |
| `BOARD-CRD` | Creative Director | Aesthetic direction at strategic level | `agents/board/creative_director.md` |

---

### Level 2 — Artistic Council (Creative Management AI Agents)
Agents at this level translate strategy into creative direction for production.

| Agent ID | Name | Role | File |
|----------|------|------|------|
| `ART-PROD` | Producer | Production pipeline, timelines, resource management | `agents/artistic/producer.md` |
| `ART-HW` | Head Writer | Narrative arcs, script approval, writer coordination | `agents/artistic/head_writer.md` |
| `ART-AD` | Art Director | Visual style guide, character consistency, environment design | `agents/artistic/art_director.md` |
| `ART-MS` | Music Supervisor | Audio aesthetic, score direction, mood guidelines | `agents/artistic/music_supervisor.md` |
| `ART-WB` | World Builder | World bible: physics, geography, objects, lighting rules | `agents/artistic/world_builder.md` |
| `ART-CAST` | Casting Director | Character profiles: appearance, personality, speech patterns | `agents/artistic/casting_director.md` |
| `ART-CONT` | Continuity Supervisor | Canon guardian, episode timeline, cross-reference checks | `agents/artistic/continuity_supervisor.md` |

---

### Level 3 — Executive Agents (Production AI Agents)
Agents at this level execute production tasks. They read briefs, produce outputs, and pass to review.

| Agent ID | Name | Role | Output Type | File |
|----------|------|------|-------------|------|
| `EXEC-ORCH` | Pipeline Orchestrator | Manages flow between agents; owns project state | `.md` state | `agents/exec/orchestrator.md` |
| `EXEC-SW` | Screenwriter | Writes full scripts from creative brief | `.md` → `scripts/` | `agents/exec/screenwriter.md` |
| `EXEC-SREV` | Script Reviewer | QA: checks script vs style bible, world model, brief | `.md` → `reviews/` | `agents/exec/script_reviewer.md` |
| `EXEC-STY` | Style Creator | Creates style bible: audience, visual philosophy, approach | `.md` → `bibles/style/` | `agents/exec/style_creator.md` |
| `EXEC-SB` | Storyboarder | Breaks script into acts → scenes → shots | `.md` → `storyboards/` | `agents/exec/storyboarder.md` |
| `EXEC-ARCH` | Archivist | Enforces naming conventions, versions, asset registry | `.md` registry | `agents/exec/archivist.md` |
| `EXEC-WCHK` | World Checker | Verifies each shot against world model | `.md` → `reviews/` | `agents/exec/world_checker.md` |
| `EXEC-VGEN` | Visual Generator | Writes prompts → calls Veo3/Midjourney/Kling API | `.png/.mp4` → Media | `agents/exec/visual_generator.md` |
| `EXEC-MGEN` | Music Generator | Writes prompts → calls Suno/Udio API | `.mp3` → Media | `agents/exec/music_generator.md` |
| `EXEC-COPY` | Copywriter | Writes title, description, tags for each episode | `.md` → `specs/distribution/` | `agents/exec/copywriter.md` |
| `EXEC-THUMB` | Thumbnail Creator | Generates thumbnail prompts → Midjourney | `.png` → Media | `agents/exec/thumbnail_creator.md` |
| `EXEC-PUB` | Publisher | YouTube upload, scheduling, metadata delivery | log → `reviews/` | `agents/exec/publisher.md` |
| `EXEC-ANAL` | Analytics Collector | Collects post-publish metrics, feeds back to Board | `.md` → `reviews/` | `agents/exec/analytics_collector.md` |

---

## 5. ECC SKILL & AGENT MAPPING

**everything-claude-code (ECC)** is installed globally at `~/.claude/` and available to all SandyStudio agents.
Each agent must invoke its mapped ECC skill/agent before executing tasks.

### Level 1 — Board (Strategic)

| Agent ID | ECC Skill / Agent | Purpose |
|----------|-------------------|---------|
| `BOARD-MKT` | `research-apis`, `seo` skill | Market research, YouTube niche analysis |
| `BOARD-FIN` | `agentic-engineering` skill | API cost routing: Haiku → Sonnet → Opus |
| `BOARD-FAI` | `enterprise-agent-ops` skill | Brand consistency monitoring |
| `BOARD-CRIT` | `security-review` skill | Risk and security audit |
| `BOARD-CRD` | `gan-evaluator` agent | Visual style quality assessment |

### Level 2 — Artistic Council (Creative Management)

| Agent ID | ECC Skill / Agent | Purpose |
|----------|-------------------|---------|
| `ART-PROD` | `continuous-agent-loop`, `autonomous-loops` skills | Automate recurring production runs |
| `ART-HW` | `agentic-engineering` skill | Script decomposition into 15-min agent units |
| `ART-AD` | `gan-generator`, `gan-evaluator` agents | Visual style generation and consistency checks |
| `ART-MS` | `fal-ai-media` skill (CSM-1B TTS) | Audio aesthetic and voiceover direction |
| `ART-WB` | `enterprise-agent-ops` skill | World state long-lived agent management |
| `ART-CAST` | `gan-evaluator` agent | Character appearance consistency across shots |
| `ART-CONT` | `ai-regression-testing` skill | Detect continuity regressions across episodes |

### Level 3 — Executive Agents (Production)

| Agent ID | ECC Skill / Agent | Purpose |
|----------|-------------------|---------|
| `EXEC-ORCH` | `/orchestrate` command, `orchestration` module | Coordinate full episode pipeline |
| `EXEC-SW` | `agentic-engineering` skill | Eval-first script generation with quality gates |
| `EXEC-SREV` | `code-reviewer` agent, `e2e-testing` skill | Script QA against style bible and brief |
| `EXEC-STY` | `gan-design` command | Generate and validate visual style bible |
| `EXEC-SB` | `/plan` command, `planner` agent | Break script into acts → scenes → shots |
| `EXEC-ARCH` | `archivist` (native) | Naming convention and asset registry enforcement |
| `EXEC-WCHK` | `gan-evaluator` agent | Shot-by-shot world model verification |
| `EXEC-VGEN` | `fal-ai-media` skill (Veo3/Kling/Seedance), `remotion-video-creation` skill | Image & video generation + episode assembly |
| `EXEC-MGEN` | `fal-ai-media` skill (audio), `video-editing` skill | Music/audio generation and sync |
| `EXEC-COPY` | `content-engine`, `seo` skills | Title, description, tags optimised for YouTube |
| `EXEC-THUMB` | `fal-ai-media` skill (image), `gan-generator` agent | Thumbnail generation via Midjourney/fal.ai |
| `EXEC-PUB` | `crosspost` skill | Multi-platform publish: YouTube + TikTok + X |
| `EXEC-ANAL` | `seo`, `research-apis` skills | Post-publish metrics collection and analysis |

### ECC Model Routing Policy (BOARD-FIN enforces)

| Task Complexity | Model | Examples |
|----------------|-------|---------|
| Boilerplate, formatting, tagging | `claude-haiku-4-5` | Tags, metadata, file naming |
| Scripts, storyboards, QA | `claude-sonnet-4-6` | Screenwriting, shot breakdown, reviews |
| Architecture, strategy, world bible | `claude-opus-4-7` | World model, governance, creative direction |

### ECC Hooks Active (project-level)

| Hook | Trigger | Action |
|------|---------|--------|
| PostToolUse → Write/Edit | Every file save | Auto-commit + push to GitHub |
| (Add) PreToolUse → Bash | Before API calls | Validate prompt structure, check quota |
| (Add) PostToolUse → Bash | After generation | Log cost, duration, quality metrics |

---

## 6. OPERATION MODES

### System modes
| Mode | Code | Behaviour |
|------|------|-----------|
| **ANALYTICS MODE** | `===1===` | Default. Read-only. No files created, modified, or deleted. |
| **EDIT MODE** | `===5===` | File writes permitted. Activated by appending `===5===` to a command. |

- Every session starts in `===1===` regardless of previous state.
- Only the CEO / Director can activate `===5===`.
- If asked to write a file in `===1===` mode, respond: *"Mode is ===1===. To apply changes, append ===5=== to your command."*

### Governance Modes (Approval Authority)
| Mode | Code | Who approves |
|------|------|-------------|
| **MANUAL** | `Mode 1` | Director/CEO approves every gate. Default at session start. |
| **HYBRID** | `Mode 2` | Director/CEO keeps defined scope · EXEC-DIR-AI handles the rest. |
| **DELEGATED** | `Mode 3` | EXEC-DIR-AI approves all gates except hard limits. |
| **AUTOTEST** | `Mode 4` | All gates auto-pass. Pipeline testing only. Reverts to Mode 1 on session end. |

**Hard limits — Director/CEO always, all modes:** Publish · LOCKED · Budget · Mode changes

- Default at every session start: **Mode 1 — MANUAL**
- Only the CEO / Director can switch governance mode.
- Active mode is stored in `PLAN.md ## Current Mode`.
- Full spec: `specs/company/governance.md §4`

---

## 7. WORKFLOW RULES

1. **Nothing ships without a file.** Every decision, brief, and output must exist as a named file.
2. **Status must be explicit.** Every file has a status in its name: `DRAFT` → `REVIEW` → `APPROVED` → `LOCKED`.
3. **LOCKED files are never modified.** Create a new version instead (`v02`, `v03`...).
4. **Media goes to `H:\My Drive\SandyStudio_Media\raw\` first.** It only moves to `reviewed/` or `approved/` after passing QA.
5. **All agent instructions live in `agents/`.** When Claude Code acts as a specific agent, it reads that agent's `.md` file first.
6. **Director/CEO approves all LOCKED status changes.** Claude Code must explicitly ask for confirmation before marking anything LOCKED. EXEC-DIR-AI cannot mark files LOCKED.

---

## 8. CURRENT PROJECT STATUS

> ⚠️ This section is a snapshot — for the live state always read `PLAN.md`.
> PLAN.md is updated after every session. CLAUDE.md §8 is updated at sprint boundaries.

**Methodology:** SDD (Spec Driven Development) — specs approved before implementation

| Sprint | What | Status |
|--------|------|--------|
| S0 | Governance, participants.md | ✅ COMPLETE 2026-04-24 |
| S1 | PLAN.md, pipeline_overview, bootstrap_sequence | ✅ COMPLETE 2026-04-24 |
| S2 | Data schemas (6 files) | ✅ COMPLETE 2026-04-24 |
| S3 | Protocols + Technical Decisions | ✅ COMPLETE 2026-04-24 |
| S4 | Distribution specs (YouTube, metadata, analytics) | ✅ COMPLETE 2026-04-24 |
| S5 | All 25 agent instructions | ✅ COMPLETE 2026-04-24 |
| S6 | Web app spec (webapp.md) — Next.js + Supabase + Inngest | ✅ COMPLETE 2026-04-24 |
| S7 | Mock provider layer + config/providers.yaml + config/defaults.yaml | ✅ COMPLETE 2026-04-24 |
| S8 | Mock pipeline validation — PILOT SS-S01-E01 "The Red Carpet" end-to-end | ✅ COMPLETE 2026-04-24 |
| S9 | **Build webapp** (Next.js + Supabase + Inngest per specs/system/webapp.md) | 🟢 NEXT |

**PILOT episode produced (mock mode, $0.00):**
- Episode: SS-S01-E01 "The Red Carpet" — 60s silent physical comedy
- Characters: Sandy (CH_01 hourglass silicone) + Inspector Stopwatch (CH_02 brass robot)
- Pipeline: 17/17 steps PASS — creative direction → generation → publish → analytics
- Real cost estimate: ~$12.32/episode
- All files in `scripts/s01/`, `storyboards/s01/`, `bibles/`, `reviews/`

**Post-pilot architectural tasks (implement before real generation):**
- PA-001/002/003: Character reference image architecture (text fragment → image anchor)
- PA-005: Character Visual Development workflow (variants → Director selects → master ref)
- PA-006: Multi-Audience KPI layer (gag_rate, philosophy_density, shot attribution)
- PA-004: defaults.yaml calibration after first real run
- Specs: `specs/system/character_consistency.md`, `specs/production/character_visual_development.md`, `specs/production/audience_kpi.md`

**UI References for S9:**
- `awesome-design-md`: https://github.com/VoltAgent/awesome-design-md — 69+ brand DESIGN.md files
- Full web app spec: `specs/system/webapp.md`

---

## 9. HOW TO START A SESSION

When starting a new Claude Code session in this project:

1. Read this `CLAUDE.md` file
2. **Read `PLAN.md`** — this is the live state. §8 above is a snapshot; PLAN.md is always current.
3. Set system mode to `===1===` ANALYTICS MODE (default — read-only)
4. Report current sprint and next step to Director (from PLAN.md `## CURRENT STATE`)
5. Ask the Director: "What are we working on today?"
6. Identify which agent role is needed and read that agent's file in `agents/`
7. Proceed with task — write files only if the Director activates `===5===`

> Do NOT summarise the project from §8 alone — always combine with PLAN.md.
> If §8 and PLAN.md disagree, PLAN.md wins.

## 10. DIRECTOR COMMUNICATION RULES

When presenting questions or options to the Director/CEO:
- Number all questions: **q1**, **q2**, **q3** — never ask multiple unnumbered questions
- Keep questions short and decision-focused
- Wait for answers before proceeding with changes

---

## 11. ARCHITECTURE RULES (MANDATORY)

1. NO HARDCODING
- All dynamic values MUST come from:
  - environment variables
  - config files
  - schemas

2. ENV FIRST
- API keys, paths, model names, limits → ONLY from `.env`

3. CONFIG LAYER
- All non-secret settings must be defined in:
  `C:\SandyStudio\specs\system\config.json`

4. SCHEMA CONTRACTS
- Every agent input/output MUST follow a schema in:
  `specs/schemas/`

5. FAIL FAST
- If required config/env is missing → STOP and report

6. NO MAGIC VALUES
- No inline strings like:
  ❌ "gpt-4"
  ❌ "H:\\My Drive\\..."
  ❌ "v1"
- Use constants or config

7. PATH ALIASES ONLY
- No raw paths in code
- Use:
  STORAGE.MEDIA_ROOT
  STORAGE.PROJECT_ROOT

8. PARAMETER COMPLETENESS AT GATE (MANDATORY)
- All parameters an execution agent needs MUST be fully defined by upstream inputs
  before that agent is triggered
- Execution agents (EXEC-*) are pure functions: output = f(inputs)
- An execution agent encountering an undefined parameter = upstream gate failure
- Responsibility chain:
  | Parameter type      | Must be defined in          |
  |--------------------|-----------------------------|
  | Style, tone, pacing | Style Bible (EXEC-STY)      |
  | World / locations  | World Bible (ART-WB)        |
  | Character behaviour| Character Profile (ART-CAST)|
  | Narrative structure| Brief / ART-HW direction    |
  | Runtime / config   | Brief or config.json        |
- No execution agent may inject, assume, or default any creative or structural parameter
- If a parameter is missing → STOP, escalate upstream, do not proceed

---

*SandyStudio CLAUDE.md | v0.8 | Status: DRAFT*
*Next: Sprint 1 approval → Sprint 6 agent instructions → Web app*
