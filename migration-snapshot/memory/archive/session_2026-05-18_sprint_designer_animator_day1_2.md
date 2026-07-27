---
name: Sprint «Дизайнер и Аниматор» kickoff — Day 1 complete, Day 2 spec checkpoint
description: 2026-05-18 session — diagnosed VGEN+EREF as the only pipeline stages without write-agent/reviewer, Director approved 11-day sprint to agentify both. Day 1 schema groundwork shipped (migration 0032 applied to remote Supabase, PA panel UX fix, glossary + 2 skill stubs). Day 2 checkpoint — Episode Reference Designer agent spec v0.1 written and committed; runner + tests pending in next session.
type: project
originSessionId: 10800d29-02d1-485a-8f34-df3cd3f52a58
---
## Architectural diagnosis (root cause of E21 Stage A issues)

**VGEN + EREF — единственные стадии пайплайна без write-agent и без reviewer.** Все остальные стадии (Script→SREV, Storyboard→WCHK, Bible→BIBLE-LOCK) канонически имеют Writer-agent + Reviewer-agent + Director gate. VGEN и EREF — template-функции (`vgen-shot-helpers.ts buildShotPromptV2` + `episode-references.ts` builder), которые шаблонно склеивают строку и зовут провайдер. Direct evidence: где работает agent (Polina via `enrichBible`, я через диалог, Screenwriter, Storyboarder) — там качество хорошее. Где template — там залёт.

Director three Stage A issues all trace to this:
1. 🔴 EREF aspect ratio bug (1024×1024 hardcoded → Seedance 16:9 crop loss)
2. 🟡 Camera utрирование too subtle (`describeCamera()` ignores camera_movement)
3. 🟡 No audio yet in VGEN (animatic_v1.music_asset_id missing) — **separate sprint**

CLAUDE.md §11 Rule 8 «PARAMETER COMPLETENESS AT GATE» — agents receive mandatory inputs but **tactical decisions** (provider, params, formulation) are legitimate agent decision space. Previously misread as «execution agents = pure functions, no decisions».

## Director-approved architecture (Sprint «Дизайнер и Аниматор»)

11-day arc: EREF first (causal chain), VGEN second. Two new full agents + two Critics + PA integration + delivery_targets brief extension + PA panel UX fix.

| New agent | Replaces | Decision space |
|---|---|---|
| **Episode Reference Designer** (`EXEC-EREF`) | `lib/agents/runners/episode-references.ts` template | provider, size per delivery_target, variants count, pilot/fanout strategy, sub_area camera coverage, smart-canon Bible injection, negative list |
| **Designer's Critic** (`EXEC-EPREV`) | NEW | V01-V08 hard checks, REVISE auto-chain back to Designer |
| **Animator** (`EXEC-VGEN`) | `vgen-shot-helpers.ts buildShotPromptV2` template | provider per shot role, quality tier per hero, aspect per delivery_target, duration with action-complexity reasoning, seed locking, end_image strategy, 7-slot (Seedance) vs prose (Veo) prompt |
| **Animator's Critic** (`EXEC-VPREV`) | NEW | V01-V09 hard checks, REVISE auto-chain |

**Plan-asset = first-class.** Output of each agent is `SPC-ref_plan` / `SPC-shot_plan` (markdown + JSON block last fenced block per glossary §6). Lifecycle DRAFT → REVIEW → APPROVED gates the actual provider call. Editable by Director before any money spent.

**Coms model (Director-confirmed q1):** Polina = единственный голос в Director's chat. Agents silent, publish to activity_events. PA reads, summarizes, asks approval verbally. Per-agent dialog через `askAgent` PA-proxy tool. NO отдельных team-chat threads per agent — claim ослаблен после моей честной саморефлексии по Ctrl+R issue.

**Smart-canon B (Director directive q3 2026-05-18):** «не урезать заранее — модели умнее, отсекут лишнее». Bible canon injected as **structured sections** (physical_anchors / costume / current_mood), not raw novel-prose. Old seedance-prompting hard rule #2 («don't describe identity») rewritten in this sprint to v0.2 — anti-pattern is novel-prose form, not the act of describing.

## Day 1 — COMPLETE (commit `1bc355e`)

| Deliverable | Status |
|---|---|
| Migration 0032 written + applied to remote Supabase (`supabase db push`) | ✅ |
| `series.metadata jsonb` (mirrors episodes.metadata from 0029) | ✅ |
| `activity_events` whitelist + 6 new types (plan_*, agent_question, agent_answered) + agent_failed catch-up | ✅ |
| Glossary +6 canonical terms (Designer / Critic / Animator / Plan-asset / delivery_targets / askAgent) | ✅ |
| Skill stubs `.claude/skills/{eref-designer,animator}/SKILL.md` | ✅ STUB v0.1 |
| PreviewDrawer UX fix — overlay respects `--pa-pad-left/right` CSS vars from ConciergePanel (PA panel stays visible on preview open) | ✅ — browser smoke deferred to Day 5 |
| PLAN.md actualised (Sprint φ + hotfixes + gpt-image-2 marked COMPLETE master `cc43944`; new sprint entry with 11-day breakdown) | ✅ |
| Verify trio | tsc clean · vitest **216/216** · replay-pilot **29/29** |

Migration 0031 был занят `concierge_turns_publication_fix` (post-cc43944 merge), поэтому bump'нул свою до **0032**.

Naming convention уже принимает `prompts/` directory + `SPC` whitelisted в `assets` CHECK + naming-validator. Ничего патчить не пришлось.

## Day 2 — COMPLETE (commits `54f1922` + `1f82ed8` + `dc75329` + `693852b`)

| Deliverable | Status |
|---|---|
| `agents/exec/episode_reference_designer.md` v0.1 — 452 LoC, canonical structure | ✅ `54f1922` |
| `webapp/lib/agents/runners/episode-reference-designer.ts` runner ~430 LoC — Sonnet 4.6 LLM call, allowlist + size table + delivery_targets resolver | ✅ `1f82ed8` |
| 24 unit tests (constants, resolveDeliveryTargets, pre-flight errors, happy paths, anthropic wiring) | ✅ `dc75329` |
| `.claude/skills/eref-designer/SKILL.md` STUB → ACTIVE v0.1 with full decision playbook | ✅ `693852b` |
| factory.ts integration + Inngest function | ⏳ Day 3 — DECISION POINT for Director (Option A vs B in PLAN.md) |

**Director directive resolutions (q1/q2/q3/q4 from check-in):**
1. **q1** Provider table → narrowed to **gpt-image-2 only** this sprint (Flux deferred to post-E22 retro)
2. **q2** Variants count = **2 in pilot mode** confirmed (establishing + action shot_roles)
3. **q3** Cost ceiling refuses DRAFT → **as is** (Designer self-validates, surfaces overrun in notes for Critic)
4. **q4** Sub_area variation — **prompt-level only** this sprint; anchor-level (Bible multi-view per location) deferred to separate sprint after E22 retro. Director's observation that E21 all shots anchored on one location plate logged as backlog item for later

Spec + runner + skill all encode q1-q3 decisions. Resolution table captured in eref-designer/SKILL.md «Provider decision» + «Variants count» + «Continuity strategy» sections.

Verify trio: tsc clean · vitest **240/240** (was 216, +24 Designer tests) · replay-pilot **29/29**.

## Pipeline state for E21+ (post-Sprint φ)

- E21 STB v05 APPROVED · WCHK v02 APPROVED
- EREF: 22/22 generated, 2 pilots APPROVED (SH01 + SH02), 39 в REVIEW, 17 REJECTED
- 2 VGEN pilots APPROVED via Seedance fal-img2vid 4s
- Budget $4.46 / $25 ceiling
- Director's verdict: «без музыки сложно судить, но качество не хуже» — identity preserved через gpt-image-2 → Seedance pipe
- 19 distinct shots в REVIEW awaiting Director approval/regenerate per-shot (но это **content review**, не блокер для Sprint «Дизайнер и Аниматор»)

## Next session — где продолжать

1. **Director decision q1**: Day 3 wiring strategy — Option A (new `EXEC-EREF-DESIGNER` agent_id + separate Inngest function) vs Option B (single EXEC-EREF with two internal step.run phases). Claude recommends **A** (canonical Writer↔SREV pattern parity).
2. Read `webapp/lib/agents/runners/episode-references.ts` (1321 LoC) end-to-end — план refactor для execution-step (reads APPROVED Plan instead of building its own template)
3. Implement chosen wiring (5-7 plumbing files for A, fewer for B)
4. Refactor `episode-references.ts` to read Plan asset · keep legacy template builder as fallback for replay-pilot mock harness back-compat
5. Wire approval route: `SPC-ref_plan` APPROVED → fire executor event
6. E22 dry-run on single shot (no production cost) to prove end-to-end flow
7. Verify trio + commit Day 3 complete
8. Tick Day 3 ✓ in PLAN.md
9. Move to Day 4 — Designer's Critic (EXEC-EPREV) — auto-fires on `plan_proposed` event, validates Plan with V01-V08 hard checks, REVISE auto-chain

## Pending Director questions (none active — auto mode)

Director активировал auto mode после q1ok/q2ok/q3 later/===5===. Сейчас работаю автономно. Если у него возникнут возражения по spec — он скажет в следующей сессии и runner адаптируется к feedback.

## Commits this session

- `1bc355e` — feat(sprint): Day 1 «Дизайнер и Аниматор» — schema groundwork
- `54f1922` — docs(agent): Day 2 — Episode Reference Designer spec v0.1
- `1f82ed8` — feat(eref): Day 2 — Designer runner v0.1 (LLM-call orchestration)
- `dc75329` — test(eref): Day 2 — 24 unit tests for Designer runner
- `693852b` — docs(skill): Day 2 — eref-designer SKILL.md v0.1 populated
- `2a2f438` — docs(plan): Day 2 complete — Designer agent shipped; Day 3 wiring decision point
- `d148a01` — feat(infra): Day 3.1 — Option A plumbing (10 touchpoints, EXEC-EREF-DESIGNER registered + Inngest function)
- `d3d834d` — docs(plan): Day 3.1 ✓ tick
- `d4897c5` — Merge remote-tracking branch 'origin/master' (sync after squash cc43944 + UI hints feature + Stage A diagnostics)
- `4bc764f` — chore(merge): finalize settings.local.json after origin/master sync

Auto-sync OFF per Director directive 2026-05-14 — branch only, no master merge until sprint complete. All commits on `claude/quizzical-brown-462555`.

**Session totals:** 10 commits · migration 0032 applied to remote Supabase · ~1900 LoC across spec + runner + tests + skill + plumbing + branch sync · 24 new passing tests (vitest 216 → 240) · $0 provider spend · git merge sync ✓.

## Mid-session findings (important for next session)

### Branch desync — fixed
Branch `claude/quizzical-brown-462555` had **NOT been synchronized** with master after Sprint φ squash merge (`cc43944`). Master had:
- UI hints feature (`PeekHint.tsx`, `HintsToggle.tsx`, `ui-audit-2026-05-14.md`, `hints/preferences.ts`) added by another worktree via auto-sync commits 2026-05-14 12:00-12:18
- Stage A E21 diagnostics scripts (`0635a25`)

These would have been silently **wiped** if I'd merged branch back into master without a sync. Fixed by `git fetch + git merge origin/master` (commit `d4897c5`). Only 2 trivial conflicts (settings.local.json + PLAN.md headers) — 198/200 files auto-merged.

### Global rule codified — question numbering
Director's directive 2026-05-18: I had been resetting `q1/q2/q3` numbering in every message, causing his `q1y` answers to become ambiguous (which q1?). Rule now lives in `~/.claude/rules/common/director-communication.md` — auto-loaded by every future session. **Continuous monotonic counter q1..qN per session, reset only at /clear.** Format: `q<N>y/q<N>n` for yes-no, `q<N>a/b/c/d` for multi-choice.

## Director q-answers this session (final tally)

Pre-rule-codification (mixed numbering, but resolved by context):
- **q1** Provider: gpt-image-2 only this sprint (Flux deferred to post-E22)
- **q2** Pilot mode = 2 variants confirmed
- **q3** Cost ceiling: as is (refuse DRAFT on overrun)
- **q4** Sub_area: prompt-level only this sprint; Bible multi-view deferred separate sprint
- **wiring strategy** (was q1 of later set): **Option A** — new `EXEC-EREF-DESIGNER` agent_id + separate Inngest function (canonical Writer↔SREV pattern)
- **rollback feature flag** (was q2): **no flag** — hard switch
- **smoke target** (was q3): **E22 real money** (~$1 Plans + $0.06/IMG)
- **merge sync now** (was q1 of next set): **yes** — done
- **continue Day 3.2 this session vs pause** (was q1 with new rule): **q1b pause** — fresh session for risky executor refactor

## Day 3.1 — COMPLETE (commit `d148a01`)

**Option A wiring** per Director q1 — separate AgentId, separate Inngest function, canonical Writer↔SREV pattern parity. 10 touchpoints, surgical:

| Touchpoint | Change |
|---|---|
| `types.ts` | AgentId + AgentCode unions extended |
| `registry.ts` | New entry: model=sonnet, next_agent=EXEC-EREF (executor), prompt_file=`episode_reference_designer.md` |
| `concurrency.ts` | `exec-eref-designer: 3` (fan-out per shot OK, Sonnet 6-12s typical) |
| `factory.ts` | EXPECTED_RUNTIME=30s + FILE_TYPE_HINT='SPC-ref_plan' |
| `runner.ts` | Import + dispatch case (Anthropic real path + mockLLM fallback for replay-pilot), FILE_TYPE_BY_AGENT entry |
| `gate.ts` | Same preconditions as EXEC-EREF (APPROVED STB) |
| `agent-names.ts` | 'Reference Designer' display |
| `inngest/functions/exec-eref-designer.ts` NEW | Declarative wrapper, eventName `sandystudio/exec-eref-designer/plan`, resolveRunArgs forwarding shotId, inputAllowedStatuses includes DRAFT/REVIEW for revision loop, nextEvent=null (Critic Day 4 will set) |
| `inngest/index.ts` | Register execErefDesignerPlan |
| `registry.test.ts` | Inngest agent count assertion 13 → 14 |

Verify trio after plumbing: tsc clean · vitest **240/240** · replay-pilot **29/29**.

Agent is **fireable** via Inngest event but not yet **auto-chained** from STB approval. Day 3.2 next.

## Day 3.2 — pending (live wire-in)

Touches existing approval-route code, riskier than Day 3.1 (could break E21/E22 live flows):

1. `app/api/assets/[id]/approve/route.ts` — when STB-storyboard APPROVED, fire `sandystudio/exec-eref-designer/plan` per pilot shot (instead of legacy `sandystudio/exec-eref/start`)
2. New event `sandystudio/exec-eref/execute-from-plan` — fired when SPC-ref_plan APPROVED
3. Refactor `episode-references.ts` runEpisodeReferences signature to accept `{planAssetId}` instead of building its own prompt template. Keep legacy template builder as fallback when planAssetId absent (for replay-pilot mock + back-compat)
4. New Inngest function `execErefExecuteFromPlan` (or extend existing `execErefStart`)
5. Integration smoke on 1 shot of E22 (or fresh test episode) to prove end-to-end

After Day 3.2, full chain works in MANUAL mode: Director or PA triggers Designer → Plan appears in REVIEW → Director approves Plan → executor fires → IMG appears in REVIEW → Director approves IMG. Day 4 Critic automates the Plan-approval step.

## Drive URLs (для будущих ссылок при retro)

E21 Stage A pilots (carry-over from prior session):
- SH01 establishing: https://drive.google.com/file/d/17YUCaD5MR9KRKVV4KUFf9mEC_CVaSr4D/view?usp=drivesdk
- SH02 action: https://drive.google.com/file/d/15Bi5ZB_tHy0ANCxDH7b4RtnvOOKOQB0B/view?usp=drivesdk
