---
name: animator
description: Decision playbook for the Animator (EXEC-VGEN). Covers provider choice per shot role, quality tier per hero-marker, aspect per delivery_target, duration with action-complexity reasoning, seed locking, end_image strategy, prompt formulation (Seedance 7-slot vs Veo prose), and running negative-term list. Pairs with `agents/exec/animator.md` and lazy-loads `seedance-prompting` / future `veo-prompting` sub-skills per chosen provider.
status: STUB
owner: EXEC-VGEN (Animator)
applies_when:
  agent: [EXEC-VGEN]
hard: false
maturity: stub-day-1
created: 2026-05-18
---

# Animator — Decision Playbook (SandyStudio)

> **Day 1 stub.** Populated on Day 6-7 of Sprint «Дизайнер и Аниматор» when the
> Animator runner is implemented. Sections marked `TBD` are placeholders that
> will be filled with concrete decision rules, examples, and worked cases.

## When this skill applies

- Agent is `EXEC-VGEN` (Animator).
- Director, PA, or factory.ts dispatched a per-shot video generation job.
  The agent is composing a `SPC-shot_plan-<shot_id>` Plan-asset.

## Decision dimensions (will be expanded Day 6-7)

| Dimension | TBD |
|---|---|
| Provider per shot role (Seedance fast iteration vs Veo standard hero) | Day 6-7 |
| Quality tier per hero-marker | Day 6-7 |
| Aspect per delivery_target | Day 6-7 |
| Duration with action-complexity reasoning (simple = 3-5s, complex = up to 8s per technology.md §3.5) | Day 6-7 |
| Seed locking strategy (random first try, lock after approve for batch consistency) | Day 6-7 |
| End-image strategy (camera-tightening, character-enter beats) | Day 6-7 |
| Prompt formulation (Seedance 7-slot vs Veo prose — lazy-load sub-skill per provider) | Day 6-7 |
| Smart canon B (Director directive 2026-05-18 — structured Bible canon, not novel-prose) | Day 6-7 |
| Running negative-term list | Day 6-7 |

## Pre-day-6 reference (do not enforce yet)

- Director's Stage A 2026-05-18 issue #2: camera movement too subtle in
  Seedance output despite skill default «static + 5% push-in». Animator
  should lean toward more aggressive motion when storyboard supplies a
  non-trivial `camera_movement` value (whip-pan, dutch-tilt, orbit, etc.).
- Director's directive 2026-05-18 q3: prefer **B (smart canon)** over A
  (raw Bible dump) — structured sections like
  `physical_anchors / costume / behavior / current_mood`, not novel-prose.
- seedance-prompting `hard rule #2` (description-as-novel anti-pattern)
  will be rewritten to v0.2 as part of this sprint — moving from «don't
  describe identity» to «describe identity *structurally*».

## Sub-skills to lazy-load

| Provider | Sub-skill |
|---|---|
| `seedance-fal-img2vid` | [`seedance-prompting`](../seedance-prompting/SKILL.md) (existing, will bump to v0.2) |
| `veo-3-img2vid` | `veo-prompting` (does not exist yet — TBD if E22 needs it) |

## Open questions (to refine with E22+ probes)

TBD Day 10 retro.

## Cross-references

- Agent prompt: [`agents/exec/animator.md`](../../../agents/exec/animator.md) (Day 6)
- Runner: [`webapp/lib/agents/runners/animator.ts`](../../../webapp/lib/agents/runners/animator.ts) (Day 6)
- Critic: [`agents/exec/animator_critic.md`](../../../agents/exec/animator_critic.md) (Day 8)
- Providers: [`webapp/lib/agents/providers/fal-seedance.ts`](../../../webapp/lib/agents/providers/fal-seedance.ts), [`veo-gemini.ts`](../../../webapp/lib/agents/providers/veo-gemini.ts)
- Capability manifest: [`webapp/lib/api/provider-capabilities.ts`](../../../webapp/lib/api/provider-capabilities.ts)
- Bible style canon: S14 STYLE CANON v1.1 (outline-only pencil edge, flat vector fills, no hatching)
- Shot rhythm: [`technology.md`](../../../technology.md) §3.5 (3-5s cuts, gag floor)
