---
name: storyboard-shot-granularity
description: How EXEC-SB decides how MANY shots a beat needs — the law that two adjacent frames continuing the same camera behaviour must be authored as ONE shot, and the tests that tell a real cut from an accidental one.
status: ACTIVE
owner: Director
flavor: process
applies_when:
  agent: [EXEC-SB]
hard: true
created: 2026-07-31
---

# Shot granularity — when two shots are really one

Genre-independent. The genre playbooks say what a shot must CARRY; this says how many
shots the beat should be cut into in the first place.

## The law

**Two adjacent shots that show the same subject from a similar angle, where the second
reads as a continuation of the first, must be authored as ONE shot with internal
movement — not as two.**

Ratified by the Director 2026-07-31 after watching a cut where an approach and its
continuation were authored as two consecutive frames.

## Why — what the audience actually feels

A cut is a promise that something changed: the vantage, the scale, the object of
attention, or the moment in time. When two neighbouring frames are similar in angle and
distance, the cut delivers no change — so the viewer's eye reads it as **something
dropped out**. It does not feel like editing; it feels like a fault: a frame lost, a
render failed, the file skipped. Worse, it is invisible to per-shot review, because each
frame is fine on its own — the defect exists only at the seam, and only in motion.

The generative pipeline makes this sharper than in live action. Each shot is generated
independently, so two "similar" frames are never actually continuous: lighting drifts,
texture reseeds, the subject shifts by a few degrees. Cutting between them exposes every
one of those drifts at once.

## The tests — apply while writing the shot list

Ask about every adjacent pair. Any YES means merge them:

1. **The continuation test.** Can the second shot be described as "the camera keeps doing
   what it was doing"? Then it is not a new shot, it is the second half of one.
2. **The three-axis test.** Across the cut, does at least ONE of these change decisively:
   vantage (angle), scale (distance/framing), or object of attention? If none changes,
   there is no cut to make.
3. **The seam test.** Would a viewer, shown the two frames back to back, be able to say
   what the cut was FOR? If the honest answer is "nothing, it just continues", merge.
4. **The drift test.** Do both frames share the same set, the same light source and the
   same subject? Then generating them separately buys nothing and costs continuity.

## What merging looks like

A merged shot is not a longer static frame — it is **one continuous camera behaviour with
named internal phases**. Write the phases in the action prose as a chain: where the move
starts, what it passes through, where it ends. The single-causal-chain rule still holds:
phases must follow from one another, not run in parallel.

Merging also buys quality on the generation side. A provider given one long continuous
movement holds its own continuity across the whole span — the same lighting, the same
subject, the same drift — which is exactly what a cut between two short shots destroys.
On the run that ratified this law, the longest single-take shot in the episode came back
as its strongest frame, while the pair of short similar shots produced the seam that
triggered the rule.

## When two shots ARE correct

- The vantage genuinely jumps (wide → close, exterior → interior, front → reverse).
- The object of attention changes (the vehicle → the thing it found).
- Time skips, and the skip is the point.
- A deliberate jump cut used AS a device, declared in the prose so it reads as intent
  rather than accident.
- The merged span would exceed the provider's single-take ceiling — then split at the
  most motivated moment and say in the prose where the seam falls and why.

## Cost note

Merging usually lowers spend: one longer generation replaces two, and it removes the
re-shoots that seam defects cause. But cost is not the argument — the argument is that
the seam is visible to the audience and invisible to per-shot review.
