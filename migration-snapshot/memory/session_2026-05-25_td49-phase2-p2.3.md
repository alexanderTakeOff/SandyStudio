---
name: session-2026-05-25-td49-phase2-p2-3
description: "TD-49 Phase 2 P2.3 shipped — EREF Designer pair authoring + Artist branch + UI toggle + Critic validator + global question-style rule. 3 commits on claude/quizzical-brown-462555, awaiting Director squash-merge to master. Live smoke 2-stage plan defined."
metadata: 
  node_type: memory
  type: project
  originSessionId: a702e7df-bf63-4c0e-9083-9a668eaded28
---

## What landed (2026-05-25, ~14:00-19:00 Dubai)

**Code (3 commits on `claude/quizzical-brown-462555`):**

- `fa29241` feat(eref+critic): TD-49 Phase 2 P2.3a — Designer pair authoring + Critic validator
- `901ad71` feat(eref-artist): TD-49 Phase 2 P2.3b — anchor pair generation branch
- `9e6de37` feat(ui): TD-49 Phase 2 P2.3c — episode settings card + anchor_chain toggle

**Files modified/created:**
- `agents/exec/episode_reference_designer.md` — new «Walking-Forward Anchor Pair Authoring» section
- `webapp/lib/agents/runners/episode-reference-designer.ts` — wires `loadAnchorChainContext`, anchor sections in user message, `anchor_pair` in JSON template
- `webapp/lib/agents/runners/episode-references.ts` — `parseAnchorPair`, `runAnchorPairGeneration` self-contained executor, anchor mode early-return
- `webapp/lib/agents/runners/episode-reference-critic.ts` — `validateAnchorPairStructure` (V10), 4-tier verdict (`PASS_WITH_UNCERTAINTY` added), accepts `SPC-ref_plan-*` shapes
- `webapp/app/api/episodes/[id]/settings/route.ts` — NEW PATCH+GET endpoint
- `webapp/components/episode/EpisodeSettingsCard.tsx` — NEW Director-only toggle card
- `webapp/app/(studio)/episodes/[id]/page.tsx` — mount card, extend metadata type
- `webapp/__tests__/lib/agents/runners/eref-critic-anchor.test.ts` — NEW 19 tests
- `webapp/__tests__/lib/agents/runners/episode-references-anchor.test.ts` — NEW 13 tests

**Global rule (cross-project, NOT git-tracked):**
- `~/.claude/rules/common/director-communication.md` — new «Question phrasing — conversational, not tabular» section (Director directive 2026-05-25)

**Memory notes (saved this session):**
- `director_questions_human_style.md` — feedback rule (later promoted to global director-communication.md)

## Verify
- `npx tsc --noEmit` clean
- `npx vitest run` 582/582 (+32 new: 19 critic validator + 13 artist parser)
- replay-pilot: skipped per plan (anchor_chain_enabled requires opt-in, fixtures don't activate it)

## Director decisions made this session (q1-q5)

| q | Answer | Effect |
|---|---|---|
| q1 — Plan granularity | Flexible runtime — Designer LLM decides one/both | `anchor_pair: { start?, end? }` both optional |
| q2 — Reciprocity pre-generation | shot_id ref (no asset_id placeholders) | `handoff_link_to_shot_id` carries shot_id string |
| q3 — Opt-in mechanic | Episode-level flag + UI checkbox | `episodes.metadata.anchor_chain_enabled`, no migration |
| q4 — Provider | (a) Status quo `openai-edits-multi` + LAYOUT LOCK | No new img2img/denoise provider in this Phase |
| q5 — UI scope | Episode card only, no series-level | Single component + one PATCH endpoint |

## PLAN.md updates — NOT done this session

Per CLAUDE.md §12 Ritual 1, `PLAN.md ## CURRENT STATE` should be updated in the same session as code change. **I did not** — PLAN.md lives in master worktree (`agitated-lederberg-a292d3`), which a sibling session was working in. Director owes a PLAN.md update after the squash-merge:
- Date: 2026-05-23 → 2026-05-25
- Phase: «TD-49 Phase 2 P2.3 — SHIPPED to feature branch, awaiting squash»
- Next: live smoke per Stage 1 / Stage 2 plan below
- q15/q16/q17 still OPEN (TD-30 root cause not closed by P2.3 — depends on smoke result)

## What's open — next session pickup

**Director squash-merge to master.** Three commits sit on `claude/quizzical-brown-462555`. Sibling session is in master worktree and explicitly «blocked_on: claude/quizzical-brown-462555 finishing merge to master». After Director's squash-merge land, sibling pulls + verifies, then starts the implementation queue they pre-planned.

**Live smoke — two-stage plan defined (2026-05-25):**

- **Stage 1 — cheap visual check (~$0.11).** Enable `anchor_chain_enabled` on SS-S15-E01 via new checkbox. Polина regenerates SH08 anchor pair (we already know LAYOUT LOCK held for the mirror on legacy Plan). 1 Plan + 2 IMG-anchor (start + end). Validate: scene_master holds layout (mirror/bed/rug fixed), identity holds (Sandy face stable). If layout drifts even with scene_master in refs → q4a status quo was wrong, return to q16 options.
- **Stage 2 — adjacent pair (~$0.30).** Only if Stage 1 PASSED. Trigger SH01 + SH02 on E01. Designer authors SH01.end_anchor (role=shared, handoff=SH02) reciprocal with SH02.start_anchor (role=shared, handoff=SH01). Approve both pairs. Visually verify boundary anchors are scene-time aligned but different camera angles — the actual value-prop of Phase 2.

**HARD STOP at IMG-anchor approval — do NOT fan-out VGEN** until sibling session closes TD-39 L1 sync ack in `dispatch.ts`. Until then any Mode 3/4 autonomous fan-out has silent-loss risk (partnership flag from sibling session 2026-05-25). Manual gating only.

**Sibling session implementation queue (per their handoff JSON):**
1. Seedance patch 1 — add `seedance-standard` to animator.md allowlist (~15 min)
2. Seedance patch 2 — `regenerateVideoFromPlan` PA tool (~1h)
3. Seedance patch 3 — fan-out path carries planAssetId in `emitSingleShot` (~1h, distinct from TD-50 I fixed today which was for manual `triggerAgent` path)
4. Shot-preview L0a/L0b — version badge in drawer header + edit timestamp (~35 min)
5. TD-39 Phase 1 audit (jobs/activity_events tables) — Explore agent ~5 min
6. TD-39 L1 sync ack in dispatch.ts — 2-3h, BLOCKS Mode 3/4

## Backlog still open (NOT addressed by P2.3)

- **q15/q16** (PLAN.md) — TD-30 same-angle bug root cause for legacy EREF. Phase 2 anchor pipeline tests one hypothesis (scene_master + prompt-level LAYOUT LOCK enough). Stage 1 smoke is the empirical answer.
- **Cross-shot reciprocity at approve-route P2.6 v2** — current backbone gates on count only. v2 would explicit-check `handoff_link_to_shot_id` reciprocity. Move when first jitter incident surfaces.
- **AI reviewer (`eref-check.ts`) for IMG-anchor** — pass-through unchanged in P2.3. If reviewer drifts on anchor IMGs (e.g. tags as «too similar to ref»), needs anchor-mode awareness.
- **Cleanup commit `eb9cda1`** (Phase 1 dead `setBibleContent(scene_master)` section) — harmless but worth removing on touch.
- **PATCH endpoint integration test** — skipped this session; Director verifies via UI smoke.
- **EpisodeSettingsCard component test** — skipped; visual check sufficient for v1.

## References
- Plan: `~/.claude/plans/valiant-sniffing-narwhal.md`
- Sibling-session handoff JSON: forwarded by Director in chat (3 audits — shot-preview, seedance-mode-switching, td39-pa-delivery-ack)
- Predecessor session note: `session_2026-05-25_td49-phase2-backbone-session.tmp`
- Cross-references: [[director_questions_human_style]], [[plan_md_living_anchor]]
