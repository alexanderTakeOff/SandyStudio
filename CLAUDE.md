# SandyStudio — AI Animation Studio
## CLAUDE.md | Project Constitution v0.11

> This file is read by Claude Code at every session start.
> It defines the studio structure, file paths, naming conventions, and agent roles.
> Slimmed 2026-05-12 (604 → 347 lines, −42.5%). Archive: `docs/CLAUDE-history.md`.

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

| Tier | Root | Contents | Git-tracked |
|---|---|---|---|
| **Tier 1 — Studio** | `C:\SandyStudio\` | tools, agents, specs, webapp, governance — no film content | ✅ |
| **Tier 2 — Film Project** | `<project_root>/` (default `C:\SandyStudio\FILMS\<series>\<season>\`, Director overridable) | `PROJECT.md` anchor + `bibles/` + `state/` + `e<NN>/{briefs,scripts,storyboards,reviews,distribution}` | ❌ |
| **Tier 3 — Media Storage** | `<media_storage>/` (default `H:\My Drive\SandyStudio_Media\<series>\`, configurable per project) | `e<NN>/{raw,approved}/{video,images,audio}/` heavy binaries | ❌ |

Max nesting under `project_root`: 3 levels (`<project>/eXX/<type>/file.md`).
Full directory trees in `docs/CLAUDE-history.md §2`.

### Auto-Folder Creation (filename → path resolver)

Webapp + CLI agents both use one resolver. Folders are created on first write.

| Filename pattern | Resolved location |
|------------------|-------------------|
| `SS-{S}-BIB-world_*` | `<project_root>/bibles/world/` |
| `SS-{S}-BIB-character_*` | `<project_root>/bibles/characters/` |
| `SS-{S}-BIB-style*` | `<project_root>/bibles/style/` |
| `SS-{S}-STA-*` | `<project_root>/state/` |
| `SS-{S}-{E}-SPC-{brief\|story_brief\|music_brief\|start_notice}-*` | `<project_root>/{e}/briefs/` |
| `SS-{S}-{E}-SPC-copy-*` | `<project_root>/{e}/distribution/` |
| `SS-{S}-{E}-SCR-*` | `<project_root>/{e}/scripts/` |
| `SS-{S}-{E}-STB-*` | `<project_root>/{e}/storyboards/` |
| `SS-{S}-{E}-REV-*` | `<project_root>/{e}/reviews/` |
| `SS-{S}-{E}-IMG-*` | `<media_storage>/{e}/raw/images/` |
| `SS-{S}-{E}-VID-*` | `<media_storage>/{e}/raw/video/` |
| `SS-{S}-{E}-AUD-*` | `<media_storage>/{e}/raw/audio/` |

### Path Resolution Rules

1. Every operation that reads/writes a project file MUST go through the resolver. No agent hardcodes a path.
2. The resolver reads `<project_root>/PROJECT.md` to get `project_root` and `media_storage`.
3. New episode subtree (`e<NN>/`) is auto-created on first write to that episode.
4. **Studio repo is forbidden as a write target for project content.** Naming-validator hook blocks any `SS-{S}-...` write outside `FILMS/` or another configured project root.

---

## 3. FILE NAMING CONVENTION

Every file in this project must be uniquely identifiable by its name alone.

### Format
```
[STUDIO]-[SERIES]-[EPISODE]-[TYPE]-[DESCRIPTION]-[VERSION]-[STATUS].[ext]
```

### Codes
| Field | Values | Example |
|-------|--------|---------|
| STUDIO | `SS` (SandyStudio — vestigial app prefix, NOT a franchise/channel marker) | `SS` |
| SERIES | `S01`, `S02`... — each `S{NN}` is a SEPARATE series; no "season" level exists (glossary, 2026-07-25) | `S01` |
| EPISODE | `E01`, `E02`... or `PILOT` | `E03` |
| TYPE | `SCR` script, `STB` storyboard, `IMG` image, `VID` video, `AUD` audio, `BIB` bible, `PRO` prompt, `REV` review, `SPC` spec, `STA` state | `SCR` |
| DESCRIPTION | Short snake_case | `opening_scene` |
| VERSION | `v01`, `v02`... | `v02` |
| STATUS | `DRAFT`, `REVIEW`, `REVISION`, `APPROVED`, `LOCKED` | `APPROVED` |

### Examples
```
SS-S01-E01-SCR-opening_scene-v01-DRAFT.md
SS-S01-E01-IMG-pink_panther_kitchen-v03-APPROVED.png
SS-PILOT-BIB-world_model-v01-APPROVED.md
```

---

## 4. AGENT STRUCTURE

| Level | Count | IDs | Instructions |
|---|---|---|---|
| **0 — Founder (Human)** | 1 | CEO / Director | — |
| **0.5 — AI Executive Producer** | 1 | `EXEC-DIR-AI` (delegated authority, see rule below) | `agents/exec/ai_ep.md` |
| **1 — Board (Strategic)** | 5 | `BOARD-MKT`, `BOARD-FIN`, `BOARD-FAI`, `BOARD-CRIT`, `BOARD-CRD` | `agents/board/*.md` |
| **2 — Artistic Council (Creative Mgmt)** | 7 | `ART-PROD`, `ART-HW`, `ART-AD`, `ART-MS`, `ART-WB`, `ART-CAST`, `ART-CONT` | `agents/artistic/*.md` |
| **3 — Executive (Production)** | 15 | `EXEC-ORCH`, `EXEC-CONC`, `EXEC-SW`, `EXEC-SREV`, `EXEC-STY`, `EXEC-SB`, `EXEC-ARCH`, `EXEC-WCHK`, `EXEC-VGEN`, `EXEC-MGEN`, `EXEC-COPY`, `EXEC-THUMB`, `EXEC-PUB`, `EXEC-ANAL`, `EXEC-STITCH` (added 2026-05-08) | `agents/exec/*.md` |

Full role descriptions for all 26 agents → `docs/CLAUDE-history.md §4`.
When Claude Code acts as a specific agent, read that agent's `.md` file first.

**EXEC-DIR-AI delegation rule:** No authority by default. Director explicitly grants scope (e.g. "EXEC-DIR-AI: approve scripts and storyboards for S01") and revokes at any time with a single command. All EXEC-DIR-AI approvals logged with rationale. EXEC-DIR-AI cannot mark files LOCKED — that remains Director-only.

---

## 5. ECC SKILL & AGENT MAPPING

**everything-claude-code (ECC)** is installed globally at `~/.claude/` and available to all SandyStudio agents.
Full mapping (each agent → assigned ECC skills/agents/commands) → `docs/CLAUDE-history.md §5`.

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
| `EXEC-CONC` (Prod Assistant chat) | `gpt-5.5` (default since Phase A 2026-05-12) | Override with `OPENAI_MODEL`. `OPENAI_REASONING_EFFORT=none` + `OPENAI_MAX_OUTPUT_TOKENS=8000` (calibrated against reasoning-token burn). |

> Live model catalogue: **developers.openai.com/api/docs/models** — always verify model IDs against this page; assistant training data may lag.

### Custom SandyStudio skills (project-local)

`C:\SandyStudio\.claude\skills\`. Two skills:
- `sandystudio-archivist` (owner `EXEC-ARCH`) — naming convention, status transitions, asset registry
- `episode-serialization` (owner `ART-CONT`) — 26-episode long-arc continuity

### Governance hooks (project-level, fire from harness)

`C:\SandyStudio\.claude\hooks\`, registered in `.claude/settings.json`:
- `mode-validator.cjs` (PreToolUse Write|Edit) — blocks writes if `===1===` ANALYTICS
- `naming-validator.cjs` (PreToolUse Write) — enforces SS-... filename convention
- `locked-status-guard.cjs` (PreToolUse Edit) — blocks edits to `*-LOCKED.*`
- (PostToolUse Write|Edit) — auto-sync git commit + push to `claude/*` branches

---

## 6. OPERATION MODES

### System modes
| Mode | Code | Behaviour |
|------|------|-----------|
| **ANALYTICS MODE** | `===1===` | Default. Read-only for PROJECT / FILM content. **Exception:** the meta surfaces below stay editable. |
| **EDIT MODE** | `===5===` | File writes permitted everywhere. Activated by appending `===5===` to a command. |

- Every session starts in `===1===` regardless of previous state.
- Only the CEO / Director can activate `===5===`.
- **Always editable, even in `===1===` (meta / bootstrap surfaces):** `PLAN.md` (the living anchor — so mode + state can always be updated) and **memory files** (`~/.claude/projects/.../memory/*`). Also project config under `.claude/` (settings, hooks, skills, agents) and root config (`CLAUDE.md`, `.env*`, `.gitignore`, `.gitattributes`, `README.md`). This carve-out is enforced by the `mode-validator.cjs` bypass list — keep this doc and that hook in sync if either changes.
- If asked to write a PROJECT / FILM file (anything NOT in the always-editable set above) while in `===1===`, respond: *"Mode is ===1===. To apply changes, append ===5=== to your command."*

### Governance Modes (Approval Authority)

> **Director ruling 2026-07-20 — canonical anchor: `NORTH_STAR.md`.** Live modes are **1 · 2 · 3**.
> **Mode 2.5 (APPRENTICE)** and **Mode 4 (AUTOTEST)** are **DEPRECATED** — Mode 4's runtime is already
> retired (Phase 1); full removal of both from code + DB (`ConciergeMode` union, `system-prompt-builder`
> switch arms, the `governance_mode`/`active_mode` CHECK constraints) is a **parked migration** (PLAN.md
> backlog), to be done together with the governance redesign below. **Mode 9** (absolute autonomy —
> Director approves only **themes · publication · finance**; built critics handle brief/casting/script;
> requires the **Responsibility Distribution Matrix**) is the **horizon — NOT yet in code/DB.** Until the
> migration lands, the table rows for 2.5/4 remain for reference only; do not treat them as live.

| Mode | Code | Who approves |
|------|------|-------------|
| **MANUAL** | `Mode 1` | Director/CEO approves every gate. Default at session start. |
| **HYBRID** | `Mode 2` | Director/CEO keeps defined scope · EXEC-DIR-AI handles the rest. |
| **APPRENTICE** _(DEPRECATED)_ | `Mode 2.5` | Agent leads pipeline, Director supervises + approves key creative gates. Bridge before Mode 3. Phase 1-A + 1-B + Phase A SHIPPED 2026-05-12 (PR #23). Full design + Skill Editor / Learning Loop in `specs/company/governance.md §4`. |
| **DELEGATED** | `Mode 3` | EXEC-DIR-AI approves all gates except hard limits. |
| **AUTOTEST** _(DEPRECATED)_ | `Mode 4` | All gates auto-pass. Pipeline testing only. Reverts to Mode 1 on session end. |
| **ABSOLUTE** _(HORIZON — not in code/DB)_ | `Mode 9` | Director approves only hard limits (themes · publication · finance); built critics handle brief/casting/script. Requires the Responsibility Distribution Matrix. See NORTH_STAR.md. |

**Hard limits — Director/CEO always, all modes:** Publish · LOCKED · Budget · Mode changes

- Default at every session start: **Mode 1 — MANUAL**
- Only the CEO / Director can switch governance mode.
- Active mode is stored in `PLAN.md ## Current Mode`.
- Full spec: `specs/company/governance.md §4`

### Studio Version & Compatibility Gate

`studio_version: 0.10` — tracks studio **production-maturity**, a *different axis*
from this document's Constitution version (do not conflate them). Set arbitrarily in
the 0.x range for now; the Director bumps it.

The gate is read by the theme-development skills and any per-episode tooling:

- **Below 1.0 — research / experiment phase (current).** The mainstream production
  line is not locked yet. **Legacy episodes E01–E12 are training experiments, NOT a
  production catalog** — they are not ground truth for calibration, not a novelty
  baseline, and earn **no backward compatibility**. Do not enforce cross-episode /
  per-episode continuity or novelty during development, and do not grow back-compat
  code for them.
- **At `studio_version >= 1.0` — mainstream phase.** Per-episode compatibility turns
  ON during development: novelty-vs-catalog, continuity, and serialization are
  enforced, and shipped episodes become real ground truth.

Machine source of truth: `config/defaults.yaml → studio.version` (the existing
studio config layer, mirrored to the Supabase `app_config` `system` scope). This §6
block is the human-readable governance statement; keep the two in sync. (There is no
`specs/system/config.json` despite Rule 3 — `config/defaults.yaml` is the real layer.)

---

## 7. WORKFLOW RULES

1. **Nothing ships without a file.** Every decision, brief, and output must exist as a named file.
2. **Status must be explicit.** Every file has a status in its name: `DRAFT` → `REVIEW` → `APPROVED` → `LOCKED`.
3. **LOCKED files are never modified.** Create a new version instead (`v02`, `v03`...).
4. **Media goes to `<media_storage>/raw/` first.** It only moves to `approved/` after passing QA.
5. **All agent instructions live in `agents/`.** When Claude Code acts as a specific agent, it reads that agent's `.md` file first.
6. **Director/CEO approves all LOCKED status changes.** Claude Code must explicitly ask for confirmation before marking anything LOCKED. EXEC-DIR-AI cannot mark files LOCKED.
7. **Every analysis updates its topic dossier in the same commit.** `docs/analysis/` and `docs/plans/`
   hold the evidence; `docs/topics/` holds the state, and only the state is ever loaded into a session.
   An analysis whose dossier was not updated is dead weight — nothing will read it again. Do not
   date-stamp a dossier's filename: a name that says "as of <date>" gets a sibling instead of an edit,
   which is exactly how eight orphaned analyses appeared in one day (2026-07-27).

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

**Do not hardcode colors directly inside components** — use semantic theme tokens (CSS variables in `webapp/app/globals.css`).

**Prod Assistant (`EXEC-CONC`)** — conversational entry point in webapp right-side panel. Dispatches tools and gates on verbal approval (Mode 2.5 Phase 1-B+). Agent spec: `agents/exec/concierge.md`.

If implementation changes visual behavior, update `specs/system/uiux.md` in the same task.

---

## 7.6 GLOSSARY — CANONICAL VOCABULARY

`specs/glossary.md` is the single source of truth for every term used across this constitution, agent prompts, contracts, schemas, UI labels, and Prod Assistant dialogue. Bilingual (RU + EN). Read once per session (§9). Update in the same commit when introducing any new term.

---

## 8. CURRENT PROJECT STATUS

**Live state is in `PLAN.md ## CURRENT STATE`.** This section used to hold a snapshot which went stale (root cause of the 2026-05-10 quality audit). All sprint history is archived to `docs/CLAUDE-history.md §8`. **Do not duplicate state here.**

If §8 and PLAN.md disagree, PLAN.md wins. If both are stale, follow §12 Ritual 2.

---

## 9. HOW TO START A SESSION

When starting a new Claude Code session in this project:

1. Read this `CLAUDE.md` file
2. **Read `NORTH_STAR.md`** — the Star (one goal + the map of planets). Ratified, master-only. Re-anchor here.
3. **Read `PLANET.md`** — the current planet (the one destination we steer to now + its terrain).
4. **Read `PLAN.md`** — day-to-day operations/backlog. NOT the strategy — the Star/Planet above are.
5. **Read `specs/glossary.md`** — canonical RU+EN vocabulary. Never invent a term — look it up or add it.
5.5 **Topic dossiers — `docs/topics/`.** The SessionStart hook injects a one-line state for each
   long-running thread (it derives the list from the directory — there is no index to maintain).
   Before discussing a topic, **open its dossier and read it in full**: `РЕШЕНО` and `ОПРОВЕРГНУТО`
   are settled findings with evidence behind them, and re-deriving them wastes the Director's time.
   Hard cap 80 lines, enforced by `topic-dossier-guard.cjs` — the cap **is** the deletion mechanism:
   to add a finding to a full dossier, remove a stale one. Dated claims that stopped being true are
   deleted, not accumulated.
6. Set system mode to `===1===` ANALYTICS MODE (default — read-only)
7. **Apply §12 Ritual 2** — `Date:` sanity check on PLAN.md AND `PLANET.md` (flag Director if > 3 days stale)
8. Report current planet + next step to Director (planet from `PLANET.md`, live state from PLAN.md `## CURRENT STATE`)
9. Ask the Director: "What are we working on today?" — and check the ask against the current planet before executing.
10. Identify which agent role is needed and read that agent's file in `agents/`
11. Proceed with task — write files only if the Director activates `===5===`

**Glossary discipline:** every new spec, agent, contract, or asset type MUST add its terms to `specs/glossary.md` in the same commit.

---

## 10. DIRECTOR COMMUNICATION RULES

When presenting questions or options to the Director/CEO:
- Number all questions: **q1**, **q2**, **q3** — never ask multiple unnumbered questions
- Keep questions short and decision-focused
- Wait for answers before proceeding with changes

### Smoke tests — propose, don't auto-fire

Director's directive 2026-05-06 (correcting earlier "always run smoke" instruction):
- **Default: propose smoke, wait for explicit command.** Do NOT auto-spin smoke tests, especially ones that spend real money (Veo 3 ~$3/episode, GPT image, Suno music) or take long wall clock (>2 min).
- Mock smoke tests ($0, fast) — also propose first, don't auto-fire.
- Director uses `q1Y` / `go` / explicit "run smoke" as approval.
- Exception: tiny verification (`tsc --noEmit`, single-file unit test, dev server health check) is part of normal verification loop and can run without prompting.

---

## 11. ARCHITECTURE RULES (MANDATORY)

1. **NO HARDCODING** — All dynamic values come from environment variables, config files, or schemas.
2. **ENV FIRST** — API keys, paths, model names, limits → ONLY from `.env`.
3. **CONFIG LAYER** — All non-secret settings defined in `C:\SandyStudio\specs\system\config.json`.
4. **SCHEMA CONTRACTS** — Every agent input/output MUST follow a schema in `specs/schemas/`.
5. **FAIL FAST** — If required config/env is missing → STOP and report.
6. **NO MAGIC VALUES** — No inline strings like `"gpt-4"`, `"H:\\My Drive\\..."`, `"v1"`. Use constants or config.
7. **PATH ALIASES ONLY** — No raw paths in code. Use `STORAGE.MEDIA_ROOT`, `STORAGE.PROJECT_ROOT`.
8. **PARAMETER COMPLETENESS AT GATE** — All parameters an execution agent needs MUST be fully defined by upstream inputs before that agent is triggered. Execution agents (EXEC-*) are pure functions: `output = f(inputs)`. An execution agent encountering an undefined parameter = upstream gate failure.

**Responsibility chain (Rule 8):**

| Parameter type      | Must be defined in          |
|---------------------|-----------------------------|
| Style, tone, pacing | Style Bible (EXEC-STY)      |
| World / locations   | World Bible (ART-WB)        |
| Character behaviour | Character Profile (ART-CAST)|
| Narrative structure | Brief / ART-HW direction    |
| Runtime / config    | Brief or config.json        |

No execution agent may inject, assume, or default any creative or structural parameter. If a parameter is missing → STOP, escalate upstream, do not proceed.

---

## 12. OPERATIONAL RITUALS (MANDATORY)

Added 2026-05-10 after Director observed quality degradation. Root cause:
`PLAN.md ## CURRENT STATE` stale for 10 days. Each session was anchoring on
out-of-date state. These 4 rituals keep PLAN.md as a **living anchor**.

### Ritual 1 — PLAN.md update **in the same session** as code change

Before `git push` / `gh pr create` / closing a task — update
`PLAN.md ## CURRENT STATE` block. One paragraph max:

```
Phase:   <real phase right now>
Status:  <what was just done in this session>
Next:    <next concrete step>
Mode:    <current governance mode>
Date:    <today's ISO date>
```

If the change is purely under one Sprint phase row, also tick its status in the Phase table.

### Ritual 2 — Session start = anchor sanity check

After §9 (Read CLAUDE.md → NORTH_STAR.md → PLANET.md → PLAN.md → glossary), compare `Date:` in
PLAN.md `## CURRENT STATE` **and** the planet date in `PLANET.md` to today.

- Diff ≤ 3 days → proceed normally.
- Diff > 3 days → **flag the Director**: "PLAN.md / PLANET.md last updated N days ago, reality may
  have moved on — update before starting?" (This is the exact failure that killed the last
  NORTH_STAR/PLANET pair: written 2026-06-27, never re-read, planet drifted 17 episodes behind.)

Do not silently work with a stale anchor.

### Ritual 3 — Verify ritual (numbers visible to Director)

After any code change (not docs-only), run the standard trio and report counts:

```bash
npx tsc --noEmit             # type safety
npm test -- --run            # unit tests (X/X)
npm run replay-pilot         # full DAG smoke (29/29)
```

Publish numbers in chat ("tsc clean, 166/166 tests, 29/29 replay-pilot").
Skip only if change was docs / PLAN.md / CLAUDE.md — and say so explicitly.

### Ritual 4 — Session-end summary

Before /compact or task handoff, write a memory note `session_YYYY-MM-DD_<title>.md` covering:

1. What landed (bullet list)
2. Last 1–3 meaningful commits (skip auto-sync noise)
3. PLAN.md updates made
4. Verify result (tsc / tests / replay-pilot counts)
5. What's open / next step / blockers

Add the note to `~/.claude/projects/C--SandyStudio/memory/` and link from `MEMORY.md` index.

### Parallel-session discipline — PLAN.md is MASTER-ONLY (Director q6, 2026-06-27)

**PLAN.md lives and is edited ONLY on `master`.** Feature branches / worktrees do NOT touch PLAN.md — this is what stops the merge conflicts and the "which copy is the truth" drift.

- **Writing:** update PLAN.md only via commits to `master` (tiny direct commits or a PLAN-only PR). A feature-branch code commit that leaves PLAN.md untouched is CORRECT, not a lapse.
- **Reading latest from a branch:** read `master`'s copy (`git show origin/master:PLAN.md` or GitHub) — NOT your branch's stale working copy.
- **Safety net:** `.gitattributes` sets `PLAN.md merge=union`, so a rare concurrent master edit auto-unions instead of hard-conflicting (history preserved).
- **Enforcement:** the `plan-md-update-guard` hook nags about an un-updated PLAN.md only on `master`/`main` commits (branch-aware) — never on feature-branch commits.

Hard cap: **2 active parallel worktrees + main**. Dead worktrees (`claude/<name>`, no recent commits) deleted after Director approval.

---

## 13. LOCAL STACK STARTUP (durable)

Bring the local app + Inngest up with **`start-stack.ps1`** (repo root) — or
double-click **`start-stack.cmd`**. After code changes: `start-stack.ps1 -Build`.
It stops any running instances, starts both, syncs functions, and prints health:

- **App** — `npm run start` on `:3000` (`prod.log`).
- **Inngest SELF-HOSTED** — `inngest start` (durable; SQLite snapshots in
  `FILMS/_inngest/main.db` survive a crash) on `:8288` (`inngest.log`). **NOT
  `inngest dev`** — the dev server was ephemeral and zombied jobs on a silent
  crash (Tier-0 stability fix, 2026-07-11).

Keys live in `webapp/.env.local` (`INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`,
`INNGEST_DEV=0`, `INNGEST_BASE_URL=http://localhost:8288`) — the script reads them,
never hardcodes. After any inngest OR app restart, functions are (re)synced via
`PUT /api/inngest` → `{"message":"Successfully registered"}`. Full detail +
rollback-to-dev: memory `inngest_selfhost_setup.md`. Do NOT restart mid-run (§7/§12).

**Agent (headless) vs human (desktop) — how to bring the stack up:**
- **Human, session-independent (all day, survives restarts):** double-click the
  **`SandyStudio Stack` shortcut on the Desktop** → `start-stack.cmd` (add `-Build`
  after code changes). Runs in its own windows, independent of any Claude session.
- **Agent in a headless tool call:** do **NOT** rely on `start-stack.ps1` foreground —
  its `Start-Process` windows are in the tool's process tree and get **reaped when the
  tool call returns** (servers die). Instead launch the **same start-mode commands**
  (`npm run start` + `inngest start` durable — never dev) as **persistent
  `run_in_background` jobs**, then poll health + `PUT /api/inngest`. These survive across
  turns for the session's lifetime. (`start-stack.ps1 -Build` is still the way to
  *rebuild* after code changes — just re-launch the servers as background jobs, not via
  the desktop launcher's foreground path.)

---

*SandyStudio CLAUDE.md | v0.11 | Status: DRAFT*
*Slimmed 2026-05-12 — archive in `docs/CLAUDE-history.md`*
