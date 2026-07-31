---
name: eref-prompt-cosmic-horror
description: Cosmic-horror genre engine for the Episode Reference Designer — what leads the positive prompt when there is no face and the frame's payload is a misreading. Holds the scene-first ordering, the withholding rules, and the per-composition table for surface-driven shots. Provider mechanics live in the provider skill, not here.
status: ACTIVE
owner: Director
flavor: process
applies_when:
  agent: [EXEC-EREF-DESIGNER]
  genre: [cosmic_horror]
# hard: true — this is the genre ENGINE for the Designer, not an optional
# playbook. It must reach the model deterministically, never via a selection roll.
hard: true
created: 2026-07-31
---

# Reference Prompts — Cosmic Horror Engine

What the frame is ABOUT in this genre, and therefore what the prompt leads with.
How to phrase any of it is in `gpt-image-2-prompting`.

## SCENE-FIRST — the light and the geometry lead

There is no face to lead with. The positive prompt follows the provider's default
order and opens with the **scene**: what is dark, what is lit, and the geometry the
light lands on. Then the subject, then the details, then the locks.

The emotional payload of these frames is carried by three things, in this order of
weight:

1. **How little is lit.** The frame's dread is a ratio. State the base as absolute
   black and say what small fraction of it carries light.
2. **The behaviour of that light** — direction, hardness, whether it scatters in the
   medium, where its edge falls to nothing.
3. **The geometry it reveals** — the specific surface, its facets, cracks, edges.
   This is where the false reading is built.

A character's pose, when a subject is present at all, is the LAST of these, not the
first.

## The withholding rules (hard)

This genre works by what the frame refuses to give. Each goes into the prompt as a
positive invariant **and** an explicit exclusion — the provider's guidance is to
state both, and «never write "no X"» is diffusion-era folklore that does not apply
to this model:

- **Scale is withheld.** No object of known size, no floor plane, no horizon, no
  figure. If the subject's base would reveal its size, the base dissolves into
  black. «The base dissolves before it meets anything» — not «no ground».
- **The light source stays outside the frame.** We see the beam and what it lands
  on, never the lamp. «The beam enters from beyond the frame edge».
- **The whole is never shown.** A creature, a structure, a mass — the frame holds a
  part, and the part must not imply a countable whole.
- **Nothing emits its own light except the declared sources.** A surface is visible
  only where a declared beam reaches it.

One accidental reveal in one shot retroactively voids the misreading in every other
shot of the episode, so these are per-frame locks, not per-episode intentions.

## Canon follows the READING, not the truth (hard)

The engine of this genre is that one thing is read as another. A shot therefore
belongs to one of two halves, and its canon references follow the half it is in —
**not** what the object ultimately turns out to be.

| Half | The shot shows | Attach | Never attach |
|---|---|---|---|
| Before the turn | the FALSE thing — a wall, a ruin, a structure | the canon of the false thing, or **nothing at all** and pure description | the canon of the true thing |
| At and after the turn | the TRUE thing revealing itself | the canon of the true thing | — |

Attaching the true-thing plate to a before-the-turn shot **spends the reveal in the
first frame**. Worse, it fights the frame mechanically: a plate whose whole identity
is a silhouette drags that silhouette into a close-up that has no silhouette at all.

Worked example (SS-S20-E01, 2026-07-31): SH04 is the vehicle pressed nose-first
against a surface that must read as dressed stone. It was cast with the
whole-tooth plate, whose canon says «must read as a pyramid» — so every render
curved the flat facet back into a pyramid. The frame wanted the facet plate, or no
plate and a description of chisel-cut stone.

**Corollary — "no reference" is a legitimate choice.** When the frame's job is to
be misread, the safest cast is often an empty one: describe the surface in words
and let no plate vote on what it is. A reference pulls toward what it IS, never
toward what you wanted from it.

This is also a storyboarding rule: the per-shot `characters[]` / `props_in_frame[]`
cast is where the mistake is made, and the Designer only inherits it.

## Composition — what each framing must carry

| Framing | Must carry | Fails when |
|---|---|---|
| Close-up | Surface texture doing the argument: the specific cracks, chips, facet steps that invite the wrong reading. Scale absent | It reads as a texture swatch — no raking light, so no geometry, so no reading |
| Medium | The relation between the lit patch and the dark around it; enough of the form to name it wrongly | The subject is centred and fully lit, which settles the question the shot exists to leave open |
| Wide | The mismatch: something small and known against something large and unnamed. Still no scale anchor — the known thing must itself be of unstated size | A floor, a horizon, or a familiar object leaks in and hands the audience the answer |
| Insert | One detail, isolated, that the later reveal will re-explain | The detail is decorative — it carries no claim that can later be overturned |

## Emotion without a face

State it as a property of the frame, in camera terms: the stillness of the subject,
the indifference of the light, the distance the beam fails to cross. Never as a
mood word. «The surface is motionless under the moving beam» carries more dread
than «ominous».

## Shot-critical negatives for this genre

Beyond the baseline, the recurring failures:

- grey instead of black in the unlit area — the single most common way the frame
  loses its material;
- a visible lamp or point source where only the cone should be;
- ambient fill or bounce light softening the black;
- a second light source that the script did not declare — in this genre a second
  source is a story event, never lighting.

Write each as the pair: «everything outside the beam is absolute black» **and**
«no grey shadows, no ambient fill».
