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

## 2. FILE STORAGE PATHS — 3-TIER ARCHITECTURE

The studio (this repo) is **separated from film projects**. The studio is the tool;
each film is its own project with its own configurable storage. They never mix.

### Tier 1 — Studio (this git repo, permanent)

`C:\SandyStudio\` — tools, agents, system specs, webapp, governance.
**No film content is ever stored here.** Adding a film never grows this directory.

```
C:\SandyStudio\
├── CLAUDE.md, PLAN.md, .gitignore
├── agents/                ← Agent instruction files
│   ├── board/, artistic/, exec/
├── specs/                 ← System-level specs only (no episode/film content)
│   ├── company/           ← Governance, org structure, authority
│   ├── production/        ← Pipeline overview, bootstrap, char visual dev, audience KPI
│   ├── schemas/           ← Data schemas (brief, script, shot, character_profile, etc.)
│   ├── protocols/         ← Inter-agent: handoff, QA, versioning
│   ├── distribution/      ← youtube.md, metadata.md, analytics.md (system specs only)
│   └── system/            ← auth, APIs, media formats, character_consistency, webapp
├── config/                ← defaults.yaml, providers.yaml (studio defaults)
├── webapp/                ← Studio app (Sprint 9)
├── archive/               ← Legacy / locked versions (rarely written)
├── Staging/               ← Local SSD buffer (gitignored, TTL 48h)
├── FILMS/                 ← Film projects (gitignored — see Tier 2)
└── .claude/               ← Claude Code config (hooks, settings, skills)
```

### Tier 2 — Film Project (one folder per film, NOT git-tracked)

Each film is one folder with its own `PROJECT.md` anchor. Path is configurable
at film creation; default location is `C:\SandyStudio\FILMS\<series_name>\<season_id>\`.
Director can override at "New Film" wizard (e.g. `D:\Films\…` or `H:\Films\…`).

```
<project_root>/                          ← e.g. C:\SandyStudio\FILMS\Sandy\S01\
├── PROJECT.md                           ← project settings anchor — never moves
├── bibles/                              ← series-level (BIB type)
│   ├── world/        SS-{S}-BIB-world_*
│   ├── characters/   SS-{S}-BIB-character_*
│   └── style/        SS-{S}-BIB-style*
├── state/                               ← series-level (STA type)
│   └── SS-{S}-STA-*                     ← creative direction, episode index, etc.
└── e<NN>/                               ← one folder per episode, auto-created
    ├── briefs/       SS-{S}-{E}-SPC-{brief|story_brief|music_brief}-*
    ├── scripts/      SS-{S}-{E}-SCR-*
    ├── storyboards/  SS-{S}-{E}-STB-*
    ├── reviews/      SS-{S}-{E}-REV-*
    └── distribution/ SS-{S}-{E}-SPC-copy-*  (YouTube metadata, social copy)
```

Max nesting: 3 levels under `project_root` (`<project>/eXX/<type>/file.md`).

### Tier 3 — Media Storage (heavy binaries, separate path)

Configurable per project via `media_storage` in `PROJECT.md`. Default:
`H:\My Drive\SandyStudio_Media\<series_id>\` (Google Drive).

```
<media_storage>/                         ← e.g. H:\My Drive\SandyStudio_Media\SandyS01\
└── e<NN>/
    ├── raw/{video,images,audio}/        ← unreviewed
    └── approved/{video,images,audio}/   ← Director-approved
```

### Auto-Folder Creation (filename → path resolver)

Webapp + CLI agents both use one resolver. Folders are created on first write.

| Filename pattern | Resolved location |
|------------------|-------------------|
| `SS-{S}-BIB-world_*` | `<project_root>/bibles/world/` |
| `SS-{S}-BIB-character_*` | `<project_root>/bibles/characters/` |
| `SS-{S}-BIB-style*` | `<project_root>/bibles/style/` |
| `SS-{S}-STA-*` | `<project_root>/state/` |
| `SS-{S}-{E}-SPC-{brief\|story_brief\|music_brief}-*` | `<project_root>/{e}/briefs/` |
| `SS-{S}-{E}-SPC-copy-*` | `<project_root>/{e}/distribution/` |
| `SS-{S}-{E}-SCR-*` | `<project_root>/{e}/scripts/` |
| `SS-{S}-{E}-STB-*` | `<project_root>/{e}/storyboards/` |
| `SS-{S}-{E}-REV-*` | `<project_root>/{e}/reviews/` |
| `SS-{S}-{E}-IMG-*` | `<media_storage>/{e}/raw/images/` |
| `SS-{S}-{E}-VID-*` | `<media_storage>/{e}/raw/video/` |
| `SS-{S}-{E}-AUD-*` | `<media_storage>/{e}/raw/audio/` |

### Path Resolution Rules

1. Every operation that reads/writes a project file MUST go through the resolver.
   No agent hardcodes a path.
2. The resolver reads `<project_root>/PROJECT.md` to get `project_root` and `media_storage`.
3. New episode subtree (`e<NN>/`) is auto-created on first write to that episode.
4. **Studio repo is forbidden as a write target for project content.** Naming-validator hook
   blocks any `SS-{S}-...` write outside `FILMS/` or another configured project root.

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
| `EXEC-CONC` | Studio Concierge | Conversational read/route entry point in webapp; never approves | chat reply | `agents/exec/concierge.md` |
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
| `BOARD-MKT` | `deep-research`, `exa-search`, `research-ops`, `seo` skills | Market research, YouTube niche analysis |
| `BOARD-FIN` | `agentic-engineering`, `cost-aware-llm-pipeline` skills | API cost routing: Haiku → Sonnet → Opus, real-time provider selection |
| `BOARD-FAI` | `enterprise-agent-ops`, `brand-voice` skills | Brand consistency monitoring, tone enforcement |
| `BOARD-CRIT` | `security-review` skill | Risk and security audit |
| `BOARD-CRD` | `gan-evaluator` agent, `council` skill | Visual style quality assessment, multi-perspective decisions |

### Level 2 — Artistic Council (Creative Management)

| Agent ID | ECC Skill / Agent | Purpose |
|----------|-------------------|---------|
| `ART-PROD` | `continuous-agent-loop`, `autonomous-loops`, `ralphinho-rfc-pipeline`, `blueprint` skills | Automate recurring production runs, multi-agent DAG, plan multi-session projects |
| `ART-HW` | `agentic-engineering` skill | Script decomposition into 15-min agent units |
| `ART-AD` | `gan-generator`, `gan-evaluator` agents, `brand-voice` skill | Visual style generation, consistency checks, brand-tone enforcement |
| `ART-MS` | `fal-ai-media` skill (CSM-1B TTS) | Audio aesthetic and voiceover direction |
| `ART-WB` | `enterprise-agent-ops`, `knowledge-ops` skills | World state long-lived agent management, world-bible knowledge base |
| `ART-CAST` | `gan-evaluator` agent | Character appearance consistency across shots |
| `ART-CONT` | `ai-regression-testing`, `knowledge-ops` skills | Detect continuity regressions, episode-state knowledge base |

### Level 3 — Executive Agents (Production)

| Agent ID | ECC Skill / Agent | Purpose |
|----------|-------------------|---------|
| `EXEC-ORCH` | `/orchestrate` command, `ralphinho-rfc-pipeline` skill | Coordinate full episode pipeline, RFC-driven multi-agent execution |
| `EXEC-CONC` | OpenAI Chat Completions (GPT-5 family, default `gpt-5.4-mini`) | Studio Concierge — conversational entry point in webapp; read-only, never approves |
| `EXEC-SW` | `agentic-engineering` skill | Eval-first script generation with quality gates |
| `EXEC-SREV` | `code-reviewer` agent, `silent-failure-hunter` agent, `eval-harness` skill | Script QA against style bible and brief, silent-failure detection, formal evaluation |
| `EXEC-STY` | `gan-design` command | Generate and validate visual style bible |
| `EXEC-SB` | `/plan` command, `planner` agent | Break script into acts → scenes → shots |
| `EXEC-ARCH` | `knowledge-ops` skill, `sandystudio-archivist` (project-local) | Naming convention enforcement, asset registry, status transitions |
| `EXEC-WCHK` | `gan-evaluator` agent, `eval-harness` skill | Shot-by-shot world model verification with formal gates |
| `EXEC-VGEN` | `fal-ai-media` (Veo3/Kling/Seedance), `remotion-video-creation`, `prompt-optimizer`, `cost-aware-llm-pipeline` skills | Image & video generation, episode assembly, prompt optimisation, cost-aware routing |
| `EXEC-MGEN` | `fal-ai-media` (audio), `video-editing`, `prompt-optimizer`, `cost-aware-llm-pipeline` skills | Music/audio generation and sync, prompt optimisation, cost-aware routing |
| `EXEC-COPY` | `content-engine`, `seo`, `brand-voice` skills | Title, description, tags optimised for YouTube + brand-tone enforcement |
| `EXEC-THUMB` | `fal-ai-media` (image), `gan-generator` agent, `prompt-optimizer` skill | Thumbnail generation via Midjourney/fal.ai with optimised prompts |
| `EXEC-PUB` | `crosspost`, `x-api`, `google-workspace-ops` skills | Multi-platform publish: YouTube + TikTok + X, Sheets-based logs |
| `EXEC-ANAL` | `deep-research`, `exa-search`, `research-ops`, `seo` skills | Post-publish metrics collection and analysis |

### Custom SandyStudio skills (project-local)

Located in `C:\SandyStudio\.claude\skills\`. Stub-level until Sprint 5 full implementation.

| Skill | Owner Agent | Purpose |
|-------|-------------|---------|
| `sandystudio-archivist` | `EXEC-ARCH` | Enforce naming convention, status transitions DRAFT→REVIEW→APPROVED→LOCKED, asset registry per `specs/system/project_state.md` |
| `episode-serialization` | `ART-CONT` | Long-arc narrative continuity across the 26-episode season; integrates with `knowledge-ops` and `ai-regression-testing` |

### Governance enforcement (project-level hooks)

Hook scripts in `C:\SandyStudio\.claude\hooks\`. Registered in `.claude/settings.json` as `PreToolUse` hooks. See `hookify` skill for adding more.

| Hook | Matcher | Behaviour |
|------|---------|-----------|
| `mode-validator.cjs` | Write \| Edit | Reads `PLAN.md` `## Current Mode`; blocks writes if `===1===` ANALYTICS |
| `naming-validator.cjs` | Write | Validates new files in `scripts/`, `storyboards/`, `bibles/`, `prompts/`, `reviews/` match the SS-... convention |
| `locked-status-guard.cjs` | Edit | Blocks edits to any `*-LOCKED.*` file (CLAUDE.md §7.3) |

### Model Routing Policy (BOARD-FIN enforces)

**Studio production agents (Anthropic via Claude Code SDK):**

| Task Complexity | Model | Examples |
|----------------|-------|---------|
| Boilerplate, formatting, tagging | `claude-haiku-4-5` | Tags, metadata, file naming |
| Scripts, storyboards, QA | `claude-sonnet-4-6` | Screenwriting, shot breakdown, reviews |
| Architecture, strategy, world bible | `claude-opus-4-7` | World model, governance, creative direction |

**Webapp-side (OpenAI via direct API — Director's preference, faster + paid):**

| Agent | Model | Notes |
|-------|-------|-------|
| `EXEC-CONC` (Concierge chat) | `gpt-5.4-mini` (default) | Override with `OPENAI_MODEL` env var. Reasoning model — `OPENAI_REASONING_EFFORT=low` for fast chat. |

> Live model catalogue: **developers.openai.com/api/docs/models** — always verify model IDs against this page; assistant training data may lag.

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

## 7.5 UI/UX SOURCE OF TRUTH

Before any visual, layout, theme, animation, shell, dashboard, approval UI, ambient background, or asset taxonomy change, read **`specs/system/uiux.md`**.

It is the source of truth for:
- SandyStudio visual direction (cinematic production OS, not flashy/hacker/gamified);
- theme tokens and the 3 presets (`slate_blue_cinematic` default, `sand_gold_studio`, `deep_purple_night`);
- StudioShell structure (Sidebar + Topbar + ContentFrame + AmbientAssetField);
- Approval Queue UX (Preview → Context → Decision flow);
- Ambient Asset Field behavior (subtle, non-blocking, no navigation in v1);
- asset visual taxonomy (`config/uiux.yaml`);
- motion/accessibility rules (respect `prefers-reduced-motion`).

**Do not hardcode colors directly inside components — use semantic theme tokens** (CSS variables defined in `webapp/app/globals.css`).

**The Concierge (`EXEC-CONC`) is the conversational entry point** for ad-hoc Director questions — `agents/exec/concierge.md`. It is read-only in Sprint 9; tools and Inngest dispatch land in Sprint 10.

If implementation changes visual behavior, update `specs/system/uiux.md` in the same task.

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
| S6 | Web app spec (webapp.md + uiux.md) — Next.js + Supabase + Inngest | ✅ COMPLETE 2026-04-28 |
| S7 | Mock provider layer + config/providers.yaml + config/defaults.yaml | ✅ COMPLETE 2026-04-24 |
| S8 | Mock pipeline validation — PILOT SS-S01-E01 "The Red Carpet" end-to-end | ✅ COMPLETE 2026-04-24 |
| S9 | **Build webapp** (Next.js + Supabase + Inngest, local-first) | 🟡 IN PROGRESS — Phases 1–3 ✅, Phase 4 next |

**Sprint 9 — what's actually live (as of 2026-04-28):**
- Supabase cloud schema: 12 tables, 3 enums, RLS, hard constraints (`publish_never_ai`, `visual_never_ai`)
- Next.js 15 + React 19 webapp at `webapp/` — runs locally via `npm run dev`
- Auth: Supabase email/password, single Director principal (auth.md §1)
- 3 themes (slate_blue_cinematic default + sand_gold_studio + deep_purple_night) + Settings → Appearance
- StudioShell: Sidebar + Topbar + ContentFrame + AmbientAssetField (R3F, subtle)
- Studio Concierge (`EXEC-CONC`) — floating chat bottom-right, OpenAI streaming, voice input
- Inngest worker — `/api/inngest`, smoke-tested end-to-end with `studio-ping` function
- Pages: Dashboard, Approval Queue, Episodes, Series, Budget, Jobs (Jobs is the only one wired to live data; others are placeholders for Phases 5–6)
- Local dev requires **2 terminals**: `npm run dev` + `npm run inngest:dev`

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
REMIND ME ONE TIME TO EXPLAIN YOU ABOUT specs/system/uiux.md. remove this reminder after remonding done !

*SandyStudio CLAUDE.md | v0.9 | Status: DRAFT*
*Next: Sprint 1 approval → Sprint 6 agent instructions → Web app*
