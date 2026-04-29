# Resume after `/clear` — SandyStudio Sprint 9 Phase 5c

> **Copy-paste this whole file into the next session as your first message** (or open it and use as a checklist). Phase 5c is done. SS-S01-E01 is published in Mode 4. SS-S01-E02 is reset and ready for Mode 1 manual testing.

---

## TL;DR — what's the current state

**Phase 5c COMPLETE** (2026-04-29). Director cockpit is live and a full pipeline cycle (11 agents, Brief → Publish, 15 assets) was proven in mock mode on `SS-S01-E01`. Every code mod from this session is committed via auto-sync hook.

- ✅ Cockpit Dashboard, Inbox, Pipeline View, Onboarding wizard, Storage settings, Topbar levers
- ✅ 26 API routes + `lib/api/*` (auth/response/errors/handler/zod-helpers/status-transitions/storage-probe/pipeline-stages/events)
- ✅ 11 EXEC-* Inngest functions, mode-aware factory (Mode 4 auto-chain, Mode 1-3 via `computeNextEvents`)
- ✅ 12 Supabase migrations on remote cloud (`akstennzrnkvexjgzhxv`)
- ✅ Verify gates green: typecheck=0, 79/79 unit tests, 28/28 replay-pilot

---

## First three commands of the new session

```bash
# 1. Check repo + worktree
cd C:\SandyStudio\.claude\worktrees\agitated-lederberg-a292d3

# 2. Read PLAN.md — Sprint state, episode state, long-debt list
cat PLAN.md | head -120

# 3. Start dev (TWO terminals)
cd webapp && npm run dev          # terminal 1 → http://localhost:3000
cd webapp && npm run inngest:dev  # terminal 2 → http://localhost:8288
```

Open `http://localhost:3000`. If session expired, re-login (`ostrovoy.alexander@gmail.com`).

---

## What's in the database right now

| Episode | Code | Status | Mode | Use |
|---------|------|--------|------|-----|
| 1 | `SS-S01-E01` "The Red Carpet" | BRIEF_APPROVED + 15 assets APPROVED through Publish | 4 (AUTOTEST) | **Done.** Reference for "full chain works in Mode 4" |
| 2 | `SS-S01-E02` "sandyTest05" | BRIEF_PENDING (brief in REVIEW) | 1 (MANUAL) | **Ready for Mode 1 testing.** Approve through `/inbox` and watch chain via `computeNextEvents` |

`SS-S01-E02` is the Mode 1 test bench. To run it through:

1. Open `/inbox` → APPROVE brief → EXEC-SW fires → SCR-script lands in REVIEW
2. APPROVE script → EXEC-SREV + EXEC-COPY fire in parallel
3. APPROVE script_qa → EXEC-SB → 3 STB acts in REVIEW (factory mock-spoof)
4. APPROVE metadata → EXEC-THUMB → thumbnail in REVIEW
5. APPROVE all 3 storyboard acts → after the 3rd, gate "STB ≥ 3 APPROVED" → EXEC-WCHK auto-fires
6. APPROVE world_check → EXEC-EDIT → animatic in REVIEW
7. APPROVE animatic → fan-out 3×EXEC-VGEN + EXEC-MGEN
8. APPROVE thumbnail → if animatic+metadata+thumb all APPROVED → EXEC-PUB fires → publish_log

~10–12 clicks total. No manual Re-trigger needed if `computeNextEvents` works as expected.

---

## Two non-negotiable rules from this session

1. **Don't run `npm run build` while dev is up.** Corrupts `webapp/.next/` chunks; every API route returns `Cannot read properties of undefined (reading 'call')` 500. Recovery: kill servers by port, `rm -rf webapp/.next`, restart. Use only `npx tsc --noEmit && npm test && npm run replay-pilot` as verify gate during active dev.

2. **Mode 4 vs Mode 1–3 chain split:**
   - Mode 4 → `factory.ts` auto-saves APPROVED + auto-fires `nextEvent` (chain self-runs)
   - Mode 1–3 → `factory.ts` saves REVIEW + suppresses chain. The chain advances via `computeNextEvents` in `webapp/app/api/assets/[id]/approve/route.ts` when Director clicks APPROVE in Inbox.
   - When you change chain logic, update **both** paths.

---

## Long-debt (долговая тетрадка) — Phase 5d candidates

Surfaced during Phase 5c smoke. Not blocking but worth fixing in priority order:

| # | Item | Why it matters |
|---|------|----------------|
| 1 | Friendly agent names (EXEC-SW → "Screenwriter", etc.) in Re-trigger modal, Inbox, Pipeline DAG, Activity feed | Director gets confused by codes |
| 6 | Asset preview drawer in Inbox (image/video/audio/markdown) — replaces today's `confirm()` modal for visuals | Visual gate enforcement requires real preview |
| 4 | `markJobFailed` on any throw in factory step 5, not only gate-fail | Stuck `RUNNING` jobs after Inngest function.failed |
| 5 | Re-trigger dedup (refuse if same agent has COMPLETED job for asset) | Prevents the "duplicate EXEC-SW failed on UNIQUE filename" bug |
| 7 | Tooltips on Mode 1/2/3 picker, APPROVE/REVISE/REJECT, mode descriptions | Reduces "what does this button do" confusion |
| 13 | `episodes.status` auto-update on milestone approvals (PUBLISHED → COMPLETE etc.) | Episode card should match pipeline state |
| 14 | `schedule-analytics` cron not firing after EXEC-PUB published event | Analytics phase is missing |
| 8 | Authority Matrix per-row editing UI (currently read-only) | Phase 7 work; can do alongside |
| 16 | EXEC-VGEN file_type duplicate `shot` token (`VID-shot-shot1`) | Cosmetic; minor cleanup |
| 2 | Per-stage trigger button on each DAG node (vs generic Re-trigger… modal) | Nice-to-have UX |
| 15 | Mode 4 auto-revert to Mode 1 on session end (per governance.md §4) | Compliance |

**Phase 5c fixes already shipped (don't re-add):** Story phantom hidden (#3), multi-asset milestone chain (#9), Pipeline View stage filter (#10), agent_completed events (#11), STAGE_FROM_ASSET prefix matching (#12).

---

## What's blocking real production

Real cycle requires:

1. **Provider keys + integrations** (Phase 8 in PLAN.md). Mock mode is `lib/agents/mock-providers.ts`. Real providers per `D-001` decision: Midjourney refs → Kling 3.0 Elements for shots; Suno for music; YouTube Data API for publish.
2. **Character Reference Architecture** (PA-001/2/3): text fragment is not enough; need `master_reference_image_path` per character. Spec at `specs/system/character_consistency.md` v0.3.
3. **Character Visual Development workflow** (PA-005): pre-production variants → Director picks → master ref. Spec at `specs/production/character_visual_development.md`.
4. **Multi-Audience KPI layer** (PA-006): gag_rate, philosophy_density, recognition_moments. Spec at `specs/production/audience_kpi.md`.

Estimated cost of one real episode: ~$12 (per PILOT analysis 2026-04-24).

---

## Where to find things

```
C:\SandyStudio\.claude\worktrees\agitated-lederberg-a292d3\
├── PLAN.md                            ← live state, change log, sprints
├── CLAUDE.md                          ← project constitution (governance, modes, paths, naming)
├── RESUME-AFTER-CLEAR.md              ← this file
├── specs/system/uiux.md               ← v0.3 spine (links to onboarding, dashboard_cockpit, pipeline_view, director_inbox, storage_configuration)
├── specs/production/...               ← bootstrap, character_visual_development, audience_kpi
├── webapp/
│   ├── app/(studio)/                  ← UI routes
│   ├── app/api/                       ← 26 route handlers
│   ├── lib/api/                       ← shared utilities (auth, errors, response, etc.)
│   ├── lib/agents/                    ← factory, runner, mock-providers, gate, registry
│   ├── inngest/functions/             ← 11 EXEC-* + ping + schedule-analytics
│   ├── supabase/migrations/           ← 0001..0012
│   └── __tests__/                     ← vitest unit tests + replay-pilot harness
└── FILMS/Sandy/S01/                   ← film project content (gitignored)
```

---

## Memory I saved for this project (auto-loaded next session)

- `MEMORY.md` index updated
- `dev_workflow_no_build_during_dev.md` — the HMR rule
- `agent_chain_mode_4_vs_1_3.md` — chain split rule
- `sprint9_phase5c_state.md` — what's live, what's in DB

These will load automatically. You don't need to re-explain them.

---

## Suggested first move in the new session

1. Open `http://localhost:3000/episodes/<E02-id>` — should show Pipeline View with Brief ○ idle and Approve banner.
2. Walk through Mode 1 cycle on E02 via Inbox — confirm `computeNextEvents` advances chain at each step.
3. If it works clean → pick Phase 5d items #1, #6 (friendly names, preview drawer) for next polish round.
4. If something breaks → check `/c/Users/NAVIAV~1/AppData/Local/Temp/claude/.../tasks/<id>.output` for Next dev logs.
5. If migration drift → `cd webapp && npx supabase migration list` (should show 0001..0012 synced both sides).

**E02 ID** in DB right now: `1c150b6d-3320-48a0-b444-9ad832de77a5`.
**E01 ID** (Mode 4 reference): `3a4be629-0ca6-4e6b-af2c-54a91a79f5ae`.

---

*Generated 2026-04-29 at end of Phase 5c session. Replace this file at next checkpoint or delete after Phase 5d ships.*
