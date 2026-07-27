---
name: Session 2026-05-12 — Mode 3 readiness drill + PR #23 merged
description: Day-long Mode 2.5 PA + Mode 3 readiness drill. 7 chained bugs found and fixed in production loop. PR #23 merged to master. Phase D Character Identity Model articulated.
type: project
originSessionId: c9349de9-9072-46cf-8c65-48068e3165d4
---
# Session 2026-05-12 — Mode 3 Readiness Drill + PR #23 Merged

Branch: `claude/quizzical-brown-462555` → merged to master at 17:22:57 UTC (commit `8fa5c00`).

## 1. What landed

### Morning — resume + housekeeping
- Merged master → branch (resolved PLAN.md conflict per Operational Rituals slim)
- CLAUDE.md slim 604 → 347 lines (-42.5%) + `docs/CLAUDE-history.md` archive
- 5 Operational-Ritual hooks shipped (A staleness, B commit guard, C verify-on-push, D session-memo, E parallel-worktree) + `lib/git-changed.cjs` helper
- Sandy v02 DRAFT cloned from v01 LOCKED with full canonical text (Director locked v02 via UI)
- S14 style canon q2 soft-archive: 3 stale assets → REJECTED, 47 dependents cleared style_anchor
- S14-E01 legacy soft-archive: 49 assets → REJECTED
- Director-approved S14 STYLE CANON v1.1 (pencil edition) — `s14_canon_v1` Bible asset

### Afternoon — Mode 3 readiness drill (started 15:52 when Director returned)
Director directive: "Будем идти почти на автомате. Готовим к самостоятельному вылету."

Pipeline ran E20 through Writer → Story Editor. Each stage surfaced a chained bug:

| # | Bug | Fix |
|---|---|---|
| 1 | SREV_MAX_TOKENS=3000 too low | Bumped to 12000 |
| 2 | `EXEC-SW completed` in UI vs human role names | `factory.ts` titles → `agentDisplayName()` |
| 3 | UI shows raw EXEC-* codes in Pipeline DAG, drawer, modal | Centralized `lib/api/agent-names.ts`, sweep 6 surfaces |
| 4 | PA doesn't know about pipeline events | `getRecentActivityEvents` + `getAsset` tools + BEHAVIOR_CONTRACT rule 1a (proactive event check) |
| 5 | Approval gate misfires on mid-sentence "нет" | Position-aware verdict (later token wins) |
| 6 | `requestRevision` doesn't re-fire producing agent | Auto-chain map `file_type` → event in approve route |
| 7a | `revisionNote` silently dropped factory→runner→runScreenwriter | Added `RunAgentArgs.revisionNote`, factory forwards |
| 7b | Writer prompt says "minimum change" | Replaced with HARD ACCEPTANCE CRITERIA + self-validate |
| 8 | Story Editor's gate requires APPROVED upstream | Allow REVIEW/REVISION/APPROVED (chicken-and-egg deadlock) |
| 9 | Story Editor's runner internal `findApprovedAsset` ALSO checked APPROVED | Same fix in runner layer |
| 10 | Story Editor doesn't enforce technology.md §3.5 rules | Added 4 hard checks (S09-S12) to `agents/exec/script_reviewer.md` |
| 11 | SREV PASS verdict always fans out to SB+COPY regardless of verdict | Verdict-based routing: REVISE/FAIL → Writer auto-fire |
| 12 | Library SWR polling 30s feels slow | Dropped to 10s + revalidate on focus |
| 13 | Kebab Delete was disabled "(planned)" | DELETE /api/assets/[id] + UI activated for non-LOCKED non-APPROVED |
| 14 | PA waits for Director to push | BEHAVIOR_CONTRACT rule 1b "fly the plane" — PA must push Director with next action |

### Docs codified
- `technology.md §3.5` — Shot rhythm & gag density (3-5s cuts, gag every 6-7s, hard 8s Veo cap)
- `technology.md §7` — Multi-agent task handoff protocol (7.1 task definition · 7.2 no silent handoff · 7.3 loop closure before Director · 7.4 skill correction over plumbing)
- CLAUDE.md slim + Operational Rituals (§12) wired with 5 hooks

## 2. Last meaningful commits (skipping auto-sync noise)

```
8fa5c00 Merge pull request #23 from alexanderTakeOff/claude/quizzical-brown-462555
        (227 commits ahead of master; major buckets):
        - 5 hooks + helper (de7d004)
        - CLAUDE.md slim (e32adcb) + draft cleanup (512fac1)
        - Cleanup scripts: S14 style (cleanup-s14-style-canon.ts), E01 legacy (close-e01-legacy-pending.ts), Sandy v02 clone (clone-sandy-v02-with-text.ts)
        - PA tools batch: regenerateBibleImage, getAsset, getRecentActivityEvents
        - approval-check.ts: position-aware verdict, director-turn-window scan
        - factory.ts + runner.ts: revisionNote propagation, agent role name titles
        - screenwriter.ts: HARD ACCEPTANCE CRITERIA prompt
        - exec-srev.ts: verdict-based routing
        - gate.ts: allowedStatuses field, .in() / .eq() switch
        - script-reviewer.ts: findApprovedAsset accepts REVIEW
        - script_reviewer.md: 4 new checks S09-S12
        - system-prompt-builder.ts: AGENT_NAMES block + rules 1a/1b
        - 16 PA tools total (was 13)
```

## 3. PLAN.md updates (Ritual 1)

Added 20+ CHANGE LOG entries today, all under 2026-05-12. CURRENT STATE box updated to reflect:
- Mode 2.5 Phase 1-A + 1-B + Phase A — COMPLETE (merged to master)
- Mode 3 readiness drill — multiple chained bugs identified + fixed
- Phase D Character Identity Model — articulated in observations, deferred for full design

## 4. Verify result (Ritual 3)

- tsc --noEmit: ✅ clean
- vitest: ✅ 166/166 tests
- replay-pilot: ✅ 29/29 assertions

## 5. What's open / next session

| Item | Status | Next |
|---|---|---|
| E20 pipeline live | Writer v03 generating (PA-triggered as recovery) | Story Editor will auto-fire when v03 ready; with all fixes loop should converge to PASS without Director |
| Verify SREV runs successfully on REVIEW status v03 | Pending | First live test of the closed Writer↔Story Editor loop |
| Phase D — Character Identity Model | Spec articulated by PA + Director 16:03 | Migration 0026 + UI + backfill (3-7 days). Schema captured: `characters` table + `bible_assets.character_id` + `reference_type` + `variant_scope` + `is_primary_reference` + `is_current` + `is_archived` |
| 4 Bible-asset lifecycle features | Backlog | (a) Bible canon resolution `current`/`archived` · (b) LOCKED fork-to-edit · (c) Image-prompt vs content sync · (d) ARCHIVED asset status |
| 6 worktrees vs cap 3 | Hook E will warn each session start | Director may want to clean stale `claude/*` |
| Hook activation | Activates on next session start | First fresh session should see Hook A (PLAN.md fresh = silent pass), Hook E (warn 6 worktrees), Hook D (silent pass — this memo exists) |

## 6. Blockers

None. Pipeline self-iterating. Director's exit point — has merged PR, ready for clean session.

## 7. Director directives captured today

- **"Smoke tests propose, don't auto-fire"** — already canonical (CLAUDE.md §10) — reaffirmed across many decision points today.
- **"Fly the plane"** (17:05) — PA must be proactive driver, not reactive responder. BEHAVIOR_CONTRACT rule 1b.
- **"No silent handoff. No silent failure."** (16:48) — Codified in `technology.md §7.2`.
- **"Skill correction over plumbing"** (17:01) — fix agent prompts before adding orchestration. Codified `§7.4`.
- **"Internal loop closure before Director"** (16:59) — Codified `§7.3`. Implemented as SREV verdict-based routing.
- **Shot rhythm 3-5s + gag floor 6-7s + Veo 8s cap** — Codified `§3.5`.

## 8. Files touched (incomplete — auto-sync covers full diff)

Major surfaces:
```
agents/exec/script_reviewer.md                       (4 new checks S09-S12)
CLAUDE.md                                            (slim 604→347)
docs/CLAUDE-history.md                               (new archive)
PLAN.md                                              (20+ CHANGE LOG entries)
technology.md                                        (§3.5 + §7)
.claude/hooks/{plan-md-staleness-check,parallel-session-warn,plan-md-update-guard,verify-trio-on-push,session-end-memo-check}.cjs (new)
.claude/hooks/lib/git-changed.cjs                    (new)
.claude/settings.json                                (5 hooks wired)
webapp/lib/api/agent-names.ts                        (new — 30+ role mapping)
webapp/lib/api/pipeline-stages.ts                    (14 labels → industry roles)
webapp/lib/agents/gate.ts                            (allowedStatuses)
webapp/lib/agents/runner.ts                          (revisionNote)
webapp/lib/agents/factory.ts                         (revisionNote forward + activity titles)
webapp/lib/agents/runners/screenwriter.ts            (HARD CONTRACT prompt)
webapp/lib/agents/runners/script-reviewer.ts         (MAX_TOKENS + findApprovedAsset)
webapp/lib/concierge/approval-check.ts               (position-aware)
webapp/lib/concierge/system-prompt-builder.ts        (AGENT_NAMES + rules 1a/1b)
webapp/lib/concierge/tools/{studio,series,index}.ts  (3 new tools)
webapp/inngest/functions/exec-srev.ts                (verdict routing)
webapp/app/api/assets/[id]/{approve,route}.ts        (auto-chain + DELETE)
webapp/components/series-bible/{AssetCard,AssetDetailDrawer,SeriesBibleView}.tsx
webapp/components/preview/AssetPreview.tsx
webapp/components/episode/EpisodeReferencesGallery.tsx
webapp/app/(studio)/episodes/[id]/page.tsx
webapp/__tests__/helpers/mock-supabase.ts            (.in() support)
webapp/scripts/{cleanup-s14-style-canon,close-e01-legacy-pending,clone-sandy-v02-with-text}.ts (new)
```

## 9. Key lessons (carry forward)

1. **Director's allegory: I'm flight crew, he's instructor.** PA pushes next concrete action; Director draws the route.
2. **Multi-agent loops must close before Director sees output.** Self-QA isn't trustable; need external validator (another agent) in the loop.
3. **Skill correction > orchestration hardcoding.** Fix the agent's prompt first, only touch routing when prompt fix is insufficient.
4. **No silent handoff. No silent failure. No "completed" without checking instruction.** — protocol foundation.
5. **Position-aware approval** — long Director messages with mid-sentence "нет" are still approvals if "одобряю" comes later.
6. **Layered fix patterns** — same logical bug often manifests in 2-3 layers (gate.ts requiring APPROVED + runner internal precondition requiring APPROVED). Fix all layers.
