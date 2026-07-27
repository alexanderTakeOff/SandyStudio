---
name: camera-orbit-signature-policy
description: "SandyStudio series cinematography signature — 80%+ of shots use camera orbit (90° rotation, or smaller drift). Director directive 2026-05-26/27. Must be enforced at Storyboarder + Animator prompt level; Critic verifies."
metadata: 
  node_type: memory
  type: project
  originSessionId: b41f1ebd-4fef-4c43-9f47-a6201dcdffb8
---

# Camera Orbit — series cinematography signature

**Director directive (Александр, 2026-05-26/27 SH09 smoke session):**

> «Активно использовалась камера Orbit во всех кадрах практически за
> исключением тех где она очевидно прямо вот мне нужна... 80% кадров
> должно быть Орбиту большим активным как сейчас я сделал там на 90°
> или с небольшим дрифтом но Орбит всегда должен быть это фишка»

## The rule

**At least 80% of shots in any SandyStudio series episode** must use a
camera orbit motion in their video plan. Options:

- **Large active orbit** — full 90° rotation (left→right or right→left)
- **Smaller drift** — partial orbit, 30–60° gentle motion

A shot may **only** use a static frame / locked wide / no-pan composition
when the gag composition explicitly requires stillness as a comedic
contrast (e.g. a deadpan reaction shot where any motion would break the
comedic timing). Such exceptions must be **explicitly justified in the
Shot Plan's «Cinematography rationale»** field.

## Where this rule is enforced

1. **Storyboarder prompt** — when describing camera angle for each shot,
   default to «orbit» / «drift» tokens unless the gag prose explicitly
   asks for a locked frame.
2. **Animator (EXEC-VANIM) prompt** — when building Shot Plan camera
   block, default to `camera_motion: orbit_90` or `camera_motion: drift`;
   `camera_motion: static` requires per-shot justification cell.
3. **Animator's Critic (EXEC-VPREV)** — adds a hard check: if Shot Plan
   declares `camera_motion: static` without an explicit rationale field,
   verdict REVISE with reason «orbit policy violation — provide
   justification or change to orbit/drift».

## Why this exists

Camera orbit is the **visual signature** of this series — the way the
audience reads «this is a SandyStudio short» vs «this is a generic 2D
cartoon». Without orbit policy enforcement, individual Plan v01/v02 may
silently default to static framing (the model's path-of-least-resistance
default), and the series loses its kinetic identity.

## Operational note

Until this rule is wired into Storyboarder + Animator + Critic prompts,
the Director may need to manually inject «add 90° orbit» / «add gentle
drift» into `regenerateShotPlan` revision notes. After enforcement is
wired (next sprint, post-TD-61 fix), the policy becomes implicit and
Director only intervenes when he wants the exception (static frame).

## Cross-references

- [[backlog-td61-td62-pipeline-blockers]] — TD-61 fix is prerequisite for
  Plan body honouring (without it, orbit declarations in Plan body get
  dropped at VGEN runner boundary).
- `webapp/lib/agents/runners/animator.ts` — Animator prompt is the
  primary enforcement site.
- `webapp/lib/agents/runners/animator-critic.ts` — Critic verification
  site (extend with orbit policy check).
- `webapp/lib/agents/runners/storyboarder.ts` (or equivalent) —
  Storyboarder default angle vocabulary.

## Cross-project

This is **SandyStudio-specific** — not a universal rule for all animation
projects. Future series under SandyStudio inherit it; entirely separate
animation studios under the same Director may have different signatures.
