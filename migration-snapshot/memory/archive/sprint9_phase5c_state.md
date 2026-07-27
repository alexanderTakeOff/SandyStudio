---
name: Sprint 9 / Phase 5c state — what is live, what is in DB, what's next
description: After Phase 5c completion (2026-04-29) the cockpit is live, full Mode 4 cycle proven on E01, Mode 1 chain wired and unblocked, two episodes in DB. Next is Phase 5d UX polish or Phase 8 real providers.
type: project
originSessionId: 0af321d8-a995-4c87-830d-6bc64fa18f7c
---
**Phase 5c COMPLETE 2026-04-29.** The full SandyStudio webapp cockpit is live and a full pipeline cycle proven end-to-end in mock mode.

**What is implemented (don't redo):**
- Onboarding wizard at `/onboarding` (4 steps: Storage → Series → Authority Matrix → First Episode)
- Dashboard cockpit at `/` (3 zones: Inbox preview, Active Episodes timelines, Live activity feed)
- Director Inbox at `/inbox` (groups, hotkeys J/K/A/R/X/?, bulk for non-visual, visual gate)
- Pipeline View at `/episodes/[id]` (DAG 9 stages — Story phantom removed, 5 node states, Re-trigger modal)
- Storage Settings tab at `/settings`
- 26 API routes under `/api/*` with shared `lib/api/*` (response, auth, errors, handler, zod-helpers, status-transitions, storage-probe, pipeline-stages, events)
- 11 EXEC-* Inngest agent functions + factory pattern (mode-aware: Mode 4 auto-approve+auto-chain, Mode 1-3 REVIEW + chain via asset approve)
- `computeNextEvents` in `app/api/assets/[id]/approve/route.ts` — multi-asset milestone chain for Mode 1-3 (STB×3, animatic fan-out, metadata→thumb, ready→pub) with `hasJob` idempotency
- 12 Supabase migrations on remote cloud (akstennzrnkvexjgzhxv)

**Episodes in DB:**
- `SS-S01-E01` "The Red Carpet" — Mode 4 demo, full chain Brief → Publish, 15 assets APPROVED, mock $0
- `SS-S01-E02` "sandyTest05" — Mode 1, BRIEF_PENDING with brief in REVIEW, Director's manual test bench

**Verify gates last green (2026-04-29):**
- typecheck EXIT=0
- 79/79 vitest unit tests
- 28/28 replay-pilot assertions
- Migrations 0001..0012 pushed to cloud Supabase

**Long-debt for Phase 5d (full list in PLAN.md):** friendly agent names (#1), per-stage trigger button (#2), markJobFailed on any throw (#4), re-trigger dedup (#5), asset preview drawer (#6), tooltips (#7), Authority Matrix per-row editing (#8), episodes.status auto-update on milestones (#13), schedule-analytics fire after EXEC-PUB (#14), Mode 4 auto-revert (#15), VID-shot-shotN duplicate token (#16).

**What's NOT done that blocks real production:**
- Phase 8: real provider keys (Kling/Midjourney/Suno/YouTube). All agents currently mock-only.
- PA-001/2/3: Character reference image architecture (text→image anchor)
- PA-005: Character Visual Development workflow
- PA-006: Multi-Audience KPI layer

**Resume guide:** `RESUME-AFTER-CLEAR.md` at the worktree root has the start-of-session checklist with copy-paste commands.
