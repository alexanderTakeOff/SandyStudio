# CLAUDE.md — Archive (extracted content)

> Sister to `docs/PLAN-history.md`. Content removed from `CLAUDE.md` during the
> 2026-05-12 slim pass (604 → ~280 lines, −53%). Nothing was deleted — only
> relocated. CLAUDE.md retains canonical strings (rules, modes, agent IDs,
> resolver table); this file holds full directory trees, expanded agent
> tables, ECC mappings, and sprint history that lived in CLAUDE.md before.
>
> Read this file when:
> - You need the full Tier 1/2/3 directory tree (CLAUDE.md §2 has the resolver, not the trees)
> - You need full agent role descriptions in one place (CLAUDE.md §4 has IDs only)
> - You need the full ECC skill→agent map (CLAUDE.md §5 has model-routing only)
> - You're researching how Sprint 9 evolved (CLAUDE.md §8 redirects to PLAN.md now)

---

## §2 archive — Full 3-Tier directory trees

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

---

## §4 archive — Full agent tables (all 26 IDs with role + file)

### Level 0 — Founder (Human)
| Role | Authority |
|------|-----------|
| **CEO / Director** | Final authority. Grants/revokes human and EXEC-DIR-AI access. Switches system and agent operating modes. All APPROVED and LOCKED statuses require explicit CEO/Director sign-off unless delegated to EXEC-DIR-AI. |

### Level 0.5 — AI Executive Producer (Delegated Authority AI Agent)
| Agent ID | Name | Role | File |
|----------|------|------|------|
| `EXEC-DIR-AI` | AI Executive Producer | Acts as Director's proxy with delegated approval authority. Approves Category B production outputs when authorised. Escalates Category A decisions to Director. Authority granted and revoked exclusively by the Director. | `agents/exec/ai_ep.md` |

> **Delegation rule:** EXEC-DIR-AI has NO authority by default. The Director explicitly grants scope (e.g. "EXEC-DIR-AI: approve scripts and storyboards for S01"). The Director revokes at any time with a single command. All EXEC-DIR-AI approvals are logged with rationale.

### Level 1 — Board of Directors (5 strategic AI Agents)
Agents at this level handle strategic decisions: market, finance, vision, risk.
They pitch ideas to the Director and receive final direction.

| Agent ID | Name | Role | File |
|----------|------|------|------|
| `BOARD-MKT` | Market Analyst | Market research, niche detection, competitive analysis | `agents/board/market_analyst.md` |
| `BOARD-FIN` | Financial Analyst | Budget, API cost tracking, ROI | `agents/board/financial_analyst.md` |
| `BOARD-FAI` | Founder AI | Brand alignment, mission guardian | `agents/board/founder_ai.md` |
| `BOARD-CRIT` | Cautious Critic | Risk assessment, devil's advocate | `agents/board/cautious_critic.md` |
| `BOARD-CRD` | Creative Director | Aesthetic direction at strategic level | `agents/board/creative_director.md` |

### Level 2 — Artistic Council (7 Creative Management AI Agents)
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

### Level 3 — Executive Agents (14 Production AI Agents)
Agents at this level execute production tasks. They read briefs, produce outputs, and pass to review.

| Agent ID | Name | Role | Output Type | File |
|----------|------|------|-------------|------|
| `EXEC-ORCH` | Pipeline Orchestrator | Manages flow between agents; owns project state | `.md` state | `agents/exec/orchestrator.md` |
| `EXEC-CONC` | Studio Concierge / Prod Assistant | Conversational read/route entry point in webapp; in Mode 2.5 also dispatches tools and gates on verbal approval | chat reply | `agents/exec/concierge.md` |
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
| `EXEC-STITCH` | Final Cut Stitcher | ffmpeg concat assembly of approved VID-shots + music → final mp4 (LT-03, Phase A.2) | `.mp4` → Media | `agents/exec/stitch.md` (added 2026-05-08) |

---

## §5 archive — Full ECC skill & agent mapping (all 3 levels)

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
| `EXEC-CONC` | OpenAI Chat Completions (GPT-5 family, default `gpt-5.5` post Phase A, was `gpt-5.4-mini`) | Studio Concierge / Prod Assistant — conversational entry point in webapp |
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
| `EXEC-STITCH` | local `ffmpeg` (via winget on Windows) + concurrency=1 Inngest function | final-cut mp4 assembly from approved VID-shots + music |

### Custom SandyStudio skills (project-local)

Located in `C:\SandyStudio\.claude\skills\`. Stub-level until Sprint 5 full implementation.

| Skill | Owner Agent | Purpose |
|-------|-------------|---------|
| `sandystudio-archivist` | `EXEC-ARCH` | Enforce naming convention, status transitions DRAFT→REVIEW→APPROVED→LOCKED, asset registry per `specs/system/project_state.md` |
| `episode-serialization` | `ART-CONT` | Long-arc narrative continuity across the 26-episode season; integrates with `knowledge-ops` and `ai-regression-testing` |

### Governance enforcement (project-level hooks) — as of 2026-05-12

Hook scripts in `C:\SandyStudio\.claude\hooks\`. Registered in `.claude/settings.json` as `PreToolUse` hooks.

| Hook | Matcher | Behaviour |
|------|---------|-----------|
| `mode-validator.cjs` | Write \| Edit | Reads `PLAN.md` `## Current Mode`; blocks writes if `===1===` ANALYTICS |
| `naming-validator.cjs` | Write | Validates new files in `scripts/`, `storyboards/`, `bibles/`, `prompts/`, `reviews/` match the SS-... convention |
| `locked-status-guard.cjs` | Edit | Blocks edits to any `*-LOCKED.*` file (CLAUDE.md §7.3) |

### ECC Hooks Active (project-level) — as of 2026-05-12

| Hook | Trigger | Action |
|------|---------|--------|
| PostToolUse → Write/Edit | Every file save on `claude/*` branches | Auto-commit + push to GitHub |
| (Add) PreToolUse → Bash | Before API calls | Validate prompt structure, check quota |
| (Add) PostToolUse → Bash | After generation | Log cost, duration, quality metrics |

---

## §8 archive — Sprint history snapshot at 2026-05-12 (PLAN.md is the live source)

**Methodology:** SDD (Spec Driven Development) — specs approved before implementation.

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
| S9 | **Build webapp** (Next.js + Supabase + Inngest, local-first) | ✅ Phases 1–5d COMPLETE + Phase 8 (real providers) COMPLETE |
| A.1 | Animatic with director_overrides + EpisodeTimeline Phase A | ✅ COMPLETE 2026-05-06..07 |
| A.2 | VGEN auto-COMPLETE + EXEC-STITCH + Audio reorg (LT-04) + Bug A/C/D | ✅ COMPLETE 2026-05-08..10 |
| Mode 2.5 Phase 1-A + 1-B + Phase A | Prod Assistant + 13 tools + verbal approval + gpt-5.5 + BEHAVIOR_CONTRACT | ✅ COMPLETE 2026-05-08..12 (PR #23) |

**As of 2026-05-12 — what's actually shipped:**
- Phase A.2: real ffmpeg final-cut assembly (SS-S14-E01 first real mp4, $8.27 / $25 budget)
- Audio reorg: MGEN before animatic, EDIT gates on EREF+music
- Mode 2.5 Phase 1-A + 1-B + Phase A: Prod Assistant + memory + TTS + 13 OpenAI tools + verbal approval + gpt-5.5
- Pipeline DAG (`lib/api/pipeline-stages.ts`): Music before Animatic + Final Cut row for EXEC-STITCH

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

**Post-pilot architectural tasks (PA-001..PA-006):**
- PA-001/002/003: Character reference image architecture (text fragment → image anchor) — ✅ done via EREF v1+v2 + Phase A.1 character-canon
- PA-004: defaults.yaml calibration after first real run — ✅ done piecemeal Phase 5c/8
- PA-005: Character Visual Development workflow (variants → Director selects → master ref) — spec at `specs/production/character_visual_development.md` v0.1; UI absorbed into LT-07
- PA-006: Multi-Audience KPI layer (gag_rate, philosophy_density, shot attribution) — spec at `specs/production/audience_kpi.md` v0.1; QA enforcement deferred
- Specs: `specs/system/character_consistency.md`, `specs/production/character_visual_development.md`, `specs/production/audience_kpi.md`

**UI References for S9:**
- `awesome-design-md`: https://github.com/VoltAgent/awesome-design-md — 69+ brand DESIGN.md files
- Full web app spec: `specs/system/webapp.md`

---

*Archive of CLAUDE.md sections cut in 2026-05-12 slim pass*
*Live equivalents: PLAN.md `## CURRENT STATE` (sprint status), CLAUDE.md §2/§4/§5 (canonical rules)*
