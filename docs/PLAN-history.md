# SandyStudio — PLAN-history.md (archive)

> Write-once archive of completed sprints (S0–S8) and historical change log
> (2026-04-23 → 2026-04-30). Extracted from PLAN.md on 2026-05-11 to keep
> PLAN.md focused on living state per CLAUDE.md §12 (Operational Rituals).
>
> **Read this file only when:** debugging origin of a decision, auditing
> spec history, or onboarding a new agent into the project context.
> Do NOT update for current-state work — that's PLAN.md's job.

---

## SPRINT MAP — Sprints S0–S8 (all COMPLETE)

### SPRINT 0 — Foundation Approval ✅ COMPLETE 2026-04-23

| Task | Owner | Status |
|------|-------|--------|
| Approve `specs/company/governance.md` v0.3 | Sandy | ✅ APPROVED |
| Create `specs/company/participants.md` | EXEC-ARCH | ✅ COMPLETE |

### SPRINT 1 — System Architecture Specs ✅ COMPLETE 2026-04-24

| Task | Owner | Status |
|------|-------|--------|
| `specs/production/pipeline_overview.md` | BOARD-CRD + ART-PROD | ✅ DRAFT |
| `specs/production/bootstrap_sequence.md` | ART-PROD | ✅ DRAFT |
| `CLAUDE.md` update | EXEC-ARCH | ✅ Done |

### SPRINT 2 — Data Schemas ✅ COMPLETE 2026-04-24

All 6 schemas APPROVED:
- `specs/schemas/brief.md` v0.2
- `specs/schemas/script.md` v0.1
- `specs/schemas/shot.md` v0.1
- `specs/schemas/character_profile.md` v0.1
- `specs/schemas/qa_report.md` v0.2
- `specs/schemas/prompt.md` v0.2

### SPRINT 3 — Protocol Specs ✅ COMPLETE 2026-04-24

Updated for 4-mode governance system. All 4 protocols APPROVED:
- `specs/protocols/inter_agent_handoff.md` v0.2
- `specs/protocols/version_cascade.md` v0.1
- `specs/protocols/qa_retry.md` v0.1
- `specs/protocols/batch_approval.md` v0.2

### SPRINT 4 — Technical Decisions ✅ COMPLETE 2026-04-24

6 technical specs APPROVED with key decisions:
- `specs/system/character_consistency.md` — **D-001: A2-Kling** (Midjourney ref → Kling 3.0 Elements)
- `specs/system/assembly_tool.md` — **D-002: B4 FFmpeg** (+ optional DaVinci colour pass)
- `specs/system/api_integrations.md` v0.2 (7 full contracts)
- `specs/system/project_state.md` (state file schema)
- `specs/system/media_formats.md` (codecs, resolutions, naming)
- `specs/system/auth.md` (Supabase email/password, single Director)
- `specs/system/media_gateway.md` v0.1 (gateway routing, health, budget gate)
- `config/providers.yaml` v0.1 (swappable provider registry)

**Decision A options** (D-001) — A1 prompt fragment / A2 reference image / A3 LoRA / A4 hybrid. Chose A2 initially; later partial reversal to Veo 3 img2vid (~75% consistency) for MVP, Kling re-evaluated post first real cycle as Phase 8.5 candidate.

**Decision B options** (D-002) — B1 DaVinci / B2 Premiere / B3 CapCut / B4 FFmpeg. Chose B4 FFmpeg (fully automatable).

### SPRINT 5 — Company + Distribution Specs ✅ COMPLETE 2026-04-24

- `specs/company/participants.md` ✅
- `specs/company/master_plan_template.md` ✅
- `specs/distribution/youtube.md` v0.1 ✅
- `specs/distribution/metadata.md` v0.1 ✅
- `specs/distribution/analytics.md` v0.1 ✅

### SPRINT 6 — Agent Instructions ✅ COMPLETE 2026-04-24

All 25 agents APPROVED by Director. EXEC tier (14): ORCH, SW, SREV, SB, WCHK, VGEN, DIR-AI, STY, MGEN, ARCH, COPY, THUMB, PUB, ANAL. ART tier (7): PROD, HW, AD, MS, WB, CAST, CONT. BOARD tier (5): MKT, FIN, FAI, CRIT, CRD. (EXEC-EDIT added later in Sprint 9 Phase 4 as 15th.)

Files in `agents/exec/`, `agents/artistic/`, `agents/board/`.

### SPRINT 7 — Web Application ✅ COMPLETE 2026-04-28 (became Sprint 9)

**Stack DECISION:** Next.js 15 + Supabase + Inngest + Vercel (Vercel later rejected → Local-First).

- `specs/system/webapp.md` ✅ APPROVED
- Section 6.6 Approval Authority Matrix + W-005 + VISUAL_CATEGORIES in governance
- §4.2.1 Inngest concurrency limits per agent (EXEC-VGEN: 3, EXEC-MGEN: 2, etc.)
- §2.1 Remote access via Tailscale + WoL + Cloudflare Tunnel escape hatch

### SPRINT 8 — First Production Run (PILOT) ✅ COMPLETE 2026-04-24 (mock mode)

PILOT SS-S01-E01 "The Red Carpet" — 60s silent physical comedy, Sandy + Inspector Stopwatch.

Pipeline 17/17 PASS, $0.00 mock. Files in `FILMS/Sandy/S01/`:
- `SS-S01-STA-creative_direction-v01` APPROVED
- `SS-S01-BIB-style-v01`, `SS-S01-BIB-world_model-v01`, 2 character bibles APPROVED
- `SS-S01-E01-SPC-brief`, `-SPC-story_brief` (Option A ending), `-SPC-music_brief` APPROVED
- `SS-S01-E01-SCR-script-v01` APPROVED
- `SS-S01-E01-STB-act1-v01` APPROVED (12 shots, 60s)
- `SS-S01-E01-REV-world_check-v01` PASS (1 minor note WC-NOTE-01)
- `SS-S01-E01-REV-{vgen,mgen,thumb,pub,anal}_mock_log-v01` all DRAFT
- `SS-S01-E01-SPC-copy-v01` DRAFT (title, description, tags, social)
- `SS-S01-E01-REV-pipeline_validation-v01` APPROVED 17/17

---

## POST-PILOT ARCHITECTURAL TASKS (PA-001..PA-006) — historical formulation

Items identified during PILOT mock run. Most have either shipped, been
deferred, or absorbed into the LT-* long-term roadmap.

- **PA-001** Character Reference Architecture — Add Level 0 master reference (8K immutable image per character) + Level 1 scene reference layer. **Status:** EREF v1 + v2 (per-shot Pilot+Fanout) implemented as variant of this; canonical_prompt_fragment retained for text anchor.
- **PA-002** Add `master_reference_image_path` field to character profile schema. **Status:** absorbed into Bible character `drive_web_view_url` field (Phase 8).
- **PA-003** EXEC-VGEN Step 0: load master reference image, pass to API. **Status:** done via `getApprovedEREFForShot` + Phase A.1 character canon text injection.
- **PA-004** `config/defaults.yaml` review after PILOT. **Status:** done piecemeal during Phase 5c/8.
- **PA-005** Character Visual Development Workflow — 3–4 visual variants per character pre-production. **Status:** spec at `specs/production/character_visual_development.md` v0.1; UI deferred (LT-07 variants_per_generation will surface this).
- **PA-006** Multi-Audience KPI Layer — gag_rate, philosophy_density, shot attribution. **Status:** spec at `specs/production/audience_kpi.md` v0.1; QA enforcement not wired (post-MVP).

---

## OPEN DECISIONS — historical record

| # | Decision | Final choice | Date |
|---|----------|--------------|------|
| D-001 | Character visual consistency | A2-Kling → partial reversal: Veo 3 img2vid for MVP (~75% consistency), Kling re-evaluated as Phase 8.5 | 2026-04-24 + revision 2026-04-30 |
| D-002 | Assembly tool | B4 FFmpeg (+ optional DaVinci colour pass) | 2026-04-24 |

---

## CHANGE LOG — 2026-04-23 → 2026-04-30 (pre-Phase A archive)

Recent change log (last 30 days) lives in PLAN.md `## CHANGE LOG`. This is
the historical tail.

### 2026-04-23
- PLAN.md created, SDD structure established
- 5 new agents identified: ORCH, COPY, THUMB, PUB, ANAL
- Spec hierarchy defined (7 layers, 23 files)

### 2026-04-24
- D-001 DECIDED: A2-Kling character consistency
- D-002 DECIDED: B4 FFmpeg assembly
- ARCH DECISION: Provider abstraction layer — agents call contracts not services
- api_integrations.md v0.2 — 7 full contracts
- media_gateway.md v0.1 — gateway routing, health monitoring, budget gate
- config/providers.yaml v0.1 — swappable provider registry
- GOVERNANCE REDESIGN: 4-mode system (MANUAL/HYBRID/DELEGATED/AUTOTEST)
- AI-EP → EXEC-DIR-AI rename + rewrite
- governance.md, CLAUDE.md, pipeline_overview.md, batch_approval.md, inter_agent_handoff.md updated
- Sprint 4 COMPLETE — api_integrations, project_state, media_formats, auth APPROVED
- Sprint 5 COMPLETE — youtube, metadata, analytics APPROVED
- STACK DECISION: Next.js 15 + Supabase + Inngest + Vercel
- All 14 EXEC agents + 7 ART agents + 5 BOARD agents drafted/approved
- ARCH RULE #8 added to CLAUDE.md: Parameter Completeness at Gate
- Sprint 6 COMPLETE — all 25 agents APPROVED; Sprint 7 READY
- DECISION: Mock provider layer — pipeline validation before real APIs
- providers.yaml gateway.provider_mode: mock (default)
- config/defaults.yaml v0.1 created
- PILOT S01E01 brief received — "The Red Carpet", 60 sec
- shot.md schema updated: timing field mm.ss-mm.ss
- defaults.yaml: target_runtime_seconds: 60
- 9 PILOT assets APPROVED (STA, BIB×4, SPC×3, SCR, STB)
- PA-001 logged: Character Reference Architecture
- All 5 mock REV logs created (vgen, mgen, thumb, pub, anal) + SPC-copy DRAFT
- REV-pipeline_validation APPROVED 17/17 PASS
- PA-005 logged: Character Visual Development Workflow
- PA-006 logged: Multi-Audience KPI Layer
- character_consistency.md v0.3, character_profile.md v0.2, audience_kpi.md v0.1, character_visual_development.md v0.1
- VISUAL APPROVAL RULE locked: visual images/video always human-reviewed, never agent-approved
- webapp.md Section 6.6 Approval Authority Matrix added + W-005 + VISUAL_CATEGORIES

### 2026-04-25
- REVISION status added to naming convention + episode_status + asset_status enums
- Animatic milestone added: ANIMATIC_IN_PROGRESS/REVIEW/REVISION/APPROVED states + EXEC-EDIT job
- NEEDS_HUMAN_TWEAK + REJECTED added to asset_status enum
- Staging buffer `C:\SandyStudio\Staging\` (local SSD, TTL 48h, gitignored)
- staging_path + drive_path + staging_expires_at + revision_log added to assets table
- .gitignore created
- Generation gate: GENERATION cannot start until ANIMATIC_APPROVED
- webapp.md ARCH FIX: Vercel rejected → Local-First (Next.js + Inngest on workstation, Supabase cloud)
- webapp.md §4.2.1 Inngest concurrency limits added; §2.1 Tailscale remote access added
- W-001..W-005 RESOLVED
- ARCH DECISION: 3-tier architecture (Studio / Film Projects / Media Storage)
- CLAUDE.md §2 rewritten: 3-tier structure + filename→path resolver table
- FILMS/Sandy/S01/PROJECT.md created — anchor for PILOT
- PILOT MIGRATION: 19 files moved to FILMS/Sandy/S01/
- .gitignore: FILMS/ + .claude/worktrees/ added
- Studio root cleaned

### 2026-04-28 — Sprint 9 BEGIN
- webapp/package.json, supabase init
- Migrations 0001..0006 created and applied to cloud (Supabase project akstennzrnkvexjgzhxv)
- 0001 enums (episode_status 22, asset_status 9, job_status 6)
- 0002 core_tables (7 tables + pgcrypto + triggers + filename CHECK)
- 0003 approval_authority + publish_never_ai + visual_never_ai constraints
- 0004 hybrid_sync_tables (agent_prompts + app_config)
- 0005 indexes (12 hot paths)
- 0006 RLS policies (10 tables)
- .env.example updated (SUPABASE + INNGEST + APP_URL)
- .claude/settings.local.json broad allowlist
- types.gen.ts generated — Phase 1 COMPLETE
- uiux.md v0.2 (visual system, theme presets, StudioShell, Approval Queue UX)
- Phase 2 SCOPE EXPANDED: theme system, StudioShell, AmbientAssetField (R3F), Concierge agent
- EXEC-CONC concierge.md v0.1 DRAFT — new conversational agent, read+route, no approval authority
- Migrations 0007 (asset_relations) + 0008 (activity_events) + 0009 (governance_block + budget_log unique idx) applied
- config/uiux.yaml — taxonomy + theme presets + ambient_limits
- Next.js 15 scaffold complete
- Supabase clients (client/server/middleware) + lib/env.ts fail-fast
- Theme system globals.css — 3 presets, AppearanceProvider
- UI primitives: Card, Badge, Button, StatusChip, Tooltip
- StudioShell + Sidebar + Topbar + ContentFrame + AmbientAssetField
- ConciergePanel chat skeleton + /api/concierge/chat streaming
- App routes: /, /approvals, /episodes, /series, /budget, /jobs, /settings, /login
- npm run build PASSED — 9 routes, 102 kB shared bundle
- CLAUDE.md §7.5 UI/UX Source of Truth + EXEC-CONC in §4 Level 3
- Phase 2 COMPLETE
- Concierge SWITCHED from Anthropic to OpenAI (Director request — paid OpenAI, fast latency)
- Default model: gpt-5.4-mini
- OpenAI tunables wired (OPENAI_MAX_OUTPUT_TOKENS, OPENAI_REASONING_EFFORT, OPENAI_TEMPERATURE)
- FIX: Ambient field invisible (body gradient covered canvas)
- Migrations 0007 + 0008 pushed to cloud (types.gen.ts regenerated, 12 tables)
- Director created Supabase Auth user + logged in
- Phase 3 START — Inngest worker
- inngest@^3.54.1 installed
- lib/inngest/client.ts (typed event schema) + lib/inngest/concurrency.ts (CONCURRENCY_LIMITS)
- inngest/functions/ping.ts + inngest/index.ts registry
- app/api/inngest/route.ts (serve) + app/api/jobs/ping/route.ts (trigger)
- Jobs page wired to live `jobs` table
- npm script inngest:dev
- FIX: middleware was redirecting /api/inngest webhook PUTs to /login → fixed
- Phase 3 SMOKE PASSED — event → handler → Supabase jobs row RUNNING→COMPLETED
- Phase 4 START — 11 EXEC-* Inngest functions + lib/agents library layer
- agents/exec/editor.md v0.1 DRAFT — EXEC-EDIT animatic editor spec
- lib/agents/types.ts + registry.ts — 15 agents single source of truth
- lib/agents/{prompts,mock-providers,gate,runner,factory}.ts — canonical 6-step factory pattern
- lib/{governance,budget}.ts — enforceMode (PUBLISH hard block), recordCost (idempotent)
- Migration 0009 applied — governance_block event + budget_log unique idx
- inngest/functions/ — 12 new function files (exec-sw, srev, sb, wchk, edit, vgen, mgen, copy, thumb, pub, anal + schedule-analytics)
- lib/inngest/client.ts Events extended to 13 events
- vitest@^4.1.5 + @vitest/coverage-v8 + tsx installed; vitest.config.ts
- __tests__/ — 5 test files (registry, mock-providers, gate, governance, budget) + helpers/mock-supabase.ts
- scripts/replay-pilot.ts — self-contained E2E harness (no servers)
- package.json scripts: test, test:watch, test:coverage, replay-pilot, verify
- naming-validator.cjs whitelist code dirs (webapp/agents/lib/specs/config/.claude)
- Phase 4 VERIFY PASSED: typecheck OK + 39/39 unit tests + 28/28 replay-pilot (1.0s)
- Phase 4 COMPLETE — pipeline DAG + budget + governance E2E in mock

### 2026-04-29 — Phase 5
- Director surfaced UX gap: webapp shell wired but no production cockpit, no first-run, no inbox, no pipeline viz
- DECISION: Phase 5 split into 5a (UX specs) + 5b (API routes) + 5c (first-run + cockpit UI MVP); Phase 7 Authority Matrix UX home moved into 5a onboarding spec
- DECISION: Topbar System Mode + Governance Mode chips become interactive levers (Director-only, hard limits)
- DECISION: trigger route allows Director always + EXEC-DIR-AI in Mode 2/3; EXEC-DIR-AI re-trigger requires reason field
- Phase 5a START — UX architecture spec pass
- specs/system/storage_configuration.md v0.1, onboarding.md v0.1, director_inbox.md v0.1, pipeline_view.md v0.1, dashboard_cockpit.md v0.1
- specs/system/uiux.md v0.2 → v0.3 — spine + cross-links
- config/uiux.yaml extended — pipeline_node_states, pipeline_stages, inbox config, agent_report_card, dashboard zones, topbar_levers, storage_defaults
- Phase 5b START — API routes + lib/api/* foundation
- webapp/lib/api/* — response, errors, handler, auth, zod-helpers, status-transitions, storage-probe, pipeline-stages, events, supabase-cast (10 files)
- webapp/lib/supabase/types-phase5b.ts — type extensions
- Migration 0010 — series table + approval_authority_matrix + app_config storage scope + seeds
- zod@^3.23.8 + swr@^2.4.1 dependencies
- API routes: 26 route handlers (health, system/mode, system/governance-mode, storage/config, storage/test-write, onboarding/*, series, series/[id], episodes, episodes/[id]+approve+trigger+pipeline, assets, assets/[id]+approve, director/inbox, activity, jobs, budget)
- __tests__/api/* — 4 new test files (status-transitions, storage-probe, pipeline-stages, response, errors-handler) — 79/79 passing
- Phase 5b VERIFY GREEN: typecheck OK + 79 unit + 28 replay-pilot + next build (33 routes)
- Phase 5b COMPLETE
- Phase 5c START — UI implementation
- components/ui/Modal.tsx — portal-based primitive
- StudioTopbar refactored: SystemModeChip + GovernanceChip levers (clickable + modal/dropdown)
- StudioSidebar reordered: Dashboard / Inbox / Series / Episodes / Budget / Jobs / Activity
- Dashboard cockpit 3 zones (InboxPreview + ActiveEpisodes + ActivityFeed)
- /onboarding 4-step wizard (Storage probe → Series form → Authority matrix → Episode brief)
- /inbox keyboard hotkeys (J/K/A/R/X/?) + bulk actions (non-visual only) + visual gate enforcement
- /episodes/[id] vertical DAG (10 stages, 5 node states) + Agent Report Feed + Re-trigger modal
- /activity severity filter pills
- Settings → Storage tab (path picker, write-test, edit-and-validate)
- Phase 5c VERIFY GREEN: typecheck OK + 79 tests + 28 replay-pilot + next build (35 routes)
- Phase 5c COMPLETE
- Director smoke #1: orphan SS01 (no-dash code) → migration 0011 fixed series code regex + atomic rollback + cleanup
- Director smoke #2: assets.file_type CHECK rejected long-form → 0011 relaxed CHECK
- Director smoke #3: variant with dashes (UUID shotIds) → migration 0012 allowed dashes in variants
- Director smoke #4: gate.ts requires 3 STB acts but mock EXEC-SB produces 1 → factory step 5 spoofs act2+act3
- Brief approval wired (Pipeline View banner + Inbox path → both fire EXEC-SW)
- Factory: Mode 4 auto-approve + auto-chain; Mode 1-3 → REVIEW + chain via Director approve
- SS-S01-E01 in Mode 4: full chain Brief → Publish (15 assets APPROVED, 11 agents, $0 mock)
- Director smoke #5: Mode 1 chain stuck → computeNextEvents wired full chain (STB×3, animatic fan-out, metadata→thumb, ready→pub) with hasJob idempotency
- Phase 5c долговая тетрадка #3, #9, #10, #11, #12 fixed
- SS-S01-E02 reset to BRIEF_PENDING + Mode 1 — Director's Mode 1 manual test bench

### 2026-04-30 — Phase 5d + Phase 8 (real providers)
- DECISION: Phase 8 = Google-first MVP. Active stack: Drive native, gpt-image-1, Veo 3 + img2vid. Beatoven/ElevenLabs/Kling registered `is_active=false`. YouTube last.
- DECISION: provider switching architecture — two-tier (global `provider_assignments` + per-stage `stage_provider_overrides`). UI at `/settings/providers` + pipeline kebab. 60s cache. Soft cancel on switch.
- DECISION: Phase 5d ships kebab UI + activity preview drawer FIRST; Phase 8 slots provider sub-menu into same kebab.
- DECISION (partial D-001 reversal): MVP uses Veo 3 img2vid for character shots (~75% consistency). Kling re-evaluated post first real cycle as Phase 8.5.
- specs/system/provider_strategy.md v0.2 APPROVED — 17-step plan (Phase 5d 4 steps → Phase 8 13 steps)
- Phase 5d step 2 SHIPPED — pipeline-row kebab UI (Approve/Reject/Edit/Re-trigger), CodeMirror 6 editor, RejectModal. New: DropdownMenu, MarkdownEditor, EditorModal, RejectModal, StageKebabMenu, /api/assets/[id]/content
- DECISION: markdown canonical in DB (variant A), not on disk. 10ms DB vs 300ms Drive per save.
- Migration 0013 applied — assets.content text NULL. runner.ts populates `content` instead of stuffing markdown into `description`. factory.ts STB-act spoof carries placeholder content. Editor banner UX fixed.
- **🎯 FIRST REAL PROVIDER CALL — gpt-image-1 worked end-to-end.** $0.016, 17.1s, 1536×1024 PNG. Architecture validated: env key → provider-resolver → openai-image adapter → binary persist → /staging/ URL. Migration 0014 (provider_assignments) applied. EXEC-THUMB wired through resolver in factory.ts.
- New: lib/agents/provider-resolver.ts (60s cache + auto-mock fallback), lib/agents/providers/openai-image.ts (gpt-image-1 adapter with cost ladder), scripts/test-image-provider.ts (`npm run test-image`)
- Phase 8 step 8 SHIPPED — /settings/providers UI. Per-contract dropdown, on/off toggle, live/no-key/wip health badges, auto-mock fallback indicator. New: /api/providers/assignments/route.ts (GET enriched), /api/providers/assignments/[contract]/route.ts (PUT with audit + cache invalidate), lib/api/provider-catalog.ts, ProviderSettings.tsx
- Phase 5d step 3 SHIPPED — Activity-item preview drawer. Right-side overlay small (480px) / wide (70vw) / full (100vw) toggle. Renders markdown/image/video/audio. Mock URLs get "switch provider to see real preview". Eye button on activity-item hover.
- Phase 8 step 13 (Veo 3) + step 10 (Drive) BLOCKED on Google credentials — Director provisioned: GEMINI_API_KEY + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN in webapp/.env.local
- **🎯 Drive adapter SHIPPED + VERIFIED.** `npm run test-drive` passed: OAuth refresh → ensureFolder → uploadBinary → listAssetFolder → deleteFile. Real folder created at https://drive.google.com/drive/folders/1AefoGUxuNEiwG118iQvYfx7Cn3EgEA1Y. New: lib/agents/providers/google-auth.ts (token refresh + 50min cache), lib/agents/providers/drive.ts (multipart upload), scripts/test-drive-provider.ts
- **Veo 3 adapter SHIPPED, BLOCKED on Gemini billing.** Code path verified (got 429 RESOURCE_EXHAUSTED, not 401/404). New: lib/agents/providers/veo-gemini.ts (long-running operation, 5s poll, 6min max), scripts/test-video-provider.ts
- EXEC-EDIT (animatic) + EXEC-VGEN (per-shot) wired through resolver — branch on `provider.providerId === 'veo-3'`. Persists MP4 via persistBinaryToStaging
- Dev environment clean restart — killed 3 stale Next.js + 3 stale Inngest procs (3000-3002 + 8288-8291)
- Director enabled Gemini API billing (Paid Tier 1, $250 cap, postpay). Veo 3 unblocked.
- Migration 0015 applied — assets.drive_file_id + assets.drive_web_view_url
- **🎯 Drive-backed binary persistence SHIPPED + E2E VERIFIED.** New helper lib/agents/persist-binary.ts. EXEC-THUMB/EXEC-EDIT/EXEC-VGEN refactored. saveAgentOutput populates new columns. `npm run test-pipeline-drive` proved gpt-image-1 → local cache + Drive upload (file 1bXP4axmK9yuqNla21pltgmPoL9B73dtD in /SandyStudio/SS-TEST/)
- AssetPreview component: "Backed up to Google Drive — open in Drive" link when drive_web_view_url set, "Local cache only — Drive storage off" otherwise

---

*SandyStudio PLAN-history.md | archive created 2026-05-11 | write-once*
*Source: PLAN.md sections SPRINT MAP S0–S8 + CHANGE LOG 2026-04-23..2026-04-30 + Post-pilot tasks + Open decisions history*
