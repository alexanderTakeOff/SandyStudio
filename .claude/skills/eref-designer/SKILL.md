---
name: eref-designer
description: Decision playbook for the Episode Reference Designer (EXEC-EREF). Covers provider choice per shot type, image size per delivery target, variant count, pilot strategy, camera-angle coverage, prompt formulation, and the running defect-and-negative list. Pairs with `agents/exec/episode_reference_designer.md`.
status: STUB
owner: EXEC-EREF (Episode Reference Designer)
applies_when:
  agent: [EXEC-EREF]
hard: false
maturity: stub-day-1
created: 2026-05-18
---

# Episode Reference Designer — Decision Playbook (SandyStudio)

> **Day 1 stub.** Populated on Day 2-3 of Sprint «Дизайнер и Аниматор» when the
> Designer runner is implemented. Sections marked `TBD` are placeholders that
> will be filled with concrete decision rules, examples, and worked cases.

## When this skill applies

- Agent is `EXEC-EREF` (Episode Reference Designer).
- Director or PA dispatched a per-shot or per-episode reference-generation
  job. The agent is composing a `SPC-ref_plan-<shot_id>` Plan-asset.

## Decision dimensions (will be expanded Day 2-3)

| Dimension | TBD |
|---|---|
| Provider per shot type (faces vs environments vs cartoon-stylized) | Day 2-3 |
| Image size per delivery_target | Day 2-3 |
| Variant count (pilot vs fanout) | Day 2-3 |
| Camera-angle coverage (sub_area variation for same-location shots) | Day 2-3 |
| Continuity strategy (openai-edits-multi anchor vs fresh openai-image) | Day 2-3 |
| Prompt formulation (Bible canon injection — smart canon B per Director directive 2026-05-18) | Day 2-3 |
| Running negative-term list (defects observed in prior E2x productions) | Day 2-3 |

## Pre-day-2 reference (do not enforce yet)

- Director's Stage A 2026-05-18 issue #1: refs are 1024×1024 → Seedance 16:9
  crop loses top/bottom. Hardcoded `size: '1024x1024'` in
  `lib/agents/runners/episode-references.ts` line ~921.
- Fix direction: Designer reads `delivery_targets[]` and picks
  1536×1024 for `youtube_landscape`, not the hardcoded square.

## Open questions (to refine with E22+ probes)

TBD Day 5 retro.

## Cross-references

- Agent prompt: [`agents/exec/episode_reference_designer.md`](../../../agents/exec/episode_reference_designer.md) (Day 2)
- Runner: [`webapp/lib/agents/runners/episode-reference-designer.ts`](../../../webapp/lib/agents/runners/episode-reference-designer.ts) (Day 2)
- Critic: [`agents/exec/eref_design_reviewer.md`](../../../agents/exec/eref_design_reviewer.md) (Day 4)
- Providers: [`webapp/lib/agents/providers/openai-image.ts`](../../../webapp/lib/agents/providers/openai-image.ts), [`openai-edits-multi.ts`](../../../webapp/lib/agents/providers/openai-edits-multi.ts)
- Bible style canon: S14 STYLE CANON v1.1 (outline-only pencil edge, flat vector fills, no hatching)
