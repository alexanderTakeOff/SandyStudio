---
name: eref-prompt-comedy
description: Comedy genre engine for the Episode Reference Designer — what leads the positive prompt when a face and hands carry the beat. Holds the ACTING-FIRST directive, the gag-object attachment rule, and the per-composition table for character shots. Provider mechanics live in the provider skill, not here.
status: ACTIVE
owner: Director
flavor: process
applies_when:
  agent: [EXEC-EREF-DESIGNER]
  genre: [comedy]
# hard: true — this is the genre ENGINE for the Designer, not an optional
# playbook. It must reach the model deterministically, never via a selection roll.
hard: true
created: 2026-07-31
---

# Reference Prompts — Comedy Engine

What the frame is ABOUT in this genre, and therefore what the prompt leads with.
How to phrase any of it for the model is in `gpt-image-2-prompting`.

## ACTING-FIRST — the positive prompt leads with the face

> Director directive 2026-06-20. Kept here, scoped to the genre it was written for.

The `[Acting]` block goes FIRST in the positive prompt, ahead of scene and subject.
This deliberately overrides the provider's default scene-first ordering, for one
reason: **in this genre the acting IS the product — a flat face kills the gag**, so
it is the block that must never be the one that gets dropped.

Honest footnote: there is **no evidence** that gpt-image-2 weights early tokens more
heavily — OpenAI documents no such thing. This is a craft choice about what we
refuse to let slide, not a claim about the model. If a fair test ever shows the
scene-first order producing better comedy frames, this directive goes.

State, in this order:

1. **Facial expression** — eye state (wide / narrowed / squeezed shut) plus mouth
   state (clenched / open / gritted / grin).
2. **Body attitude / silhouette** — how the pose carries the emotion: leaning hard
   into the wind, recoiling, braced, deflated.
3. **Readable intent** — what the audience instantly reads the character is trying
   to do.

Source is `shot.expected_emotion`. When it is absent, DERIVE the beat from
`action_prose` + `expected_gag` — never leave the character emotionally neutral.

- **Bad:** «Sandy reaches for the switch.»
- **Good:** «Sandy lunges for the switch with panicked determination — eyes wide,
  mouth clenched, body stretched forward while the wind shoves him back.»

`[Subject].current_mood` restates the same beat from `shot.expected_emotion`, so
the character block and the acting block cannot drift apart.

## The gag block

When `shot.expected_gag` is present, one sentence naming the visual gag.

**Gag-object attachment (hard).** An interactive control the gag turns on — a
button, a lever, a switch — must be stated as physically mounted **on the gag
object's own body**. Never on a wall, never floating in space. The gag reads as
cause and effect only when the thing that causes it is part of the thing that
suffers it.

## Composition — what each framing must carry

| Framing | Must carry | Fails when |
|---|---|---|
| Close-up | The expression, full and unambiguous: both eye state and mouth state legible | The face is partly out of frame, or the emotion has to be inferred from context |
| Medium | Expression **and** the hands — what the character is doing with the object | Hands are cropped or hidden; the intent becomes guesswork |
| Wide | The silhouette reads the emotion with no facial detail at all, plus the full gag geometry: actor, object, and the space the backfire will travel through | The character is a generic figure; the gag's staging is not visible |
| Insert / prop | The object's state change, and the object's own control surface in frame | The object is shown neutral, so the beat has nothing to compare against |

## Shot-critical negatives for this genre

Beyond the baseline, add only what this shot risks. Known recurring failures:

- `no wall switch`, `no floating button` — the gag-object attachment rule above,
  restated for the renderer (E-series SH09).
- `no granular body distortion` on a character whose body is a defined material.

Write each as a pair per the provider skill — «the control sits on the object's own
casing» **and** «no wall switch, no floating button».

## Gag Plan integration

When an APPROVED `SPC-gag_plan` exists for the episode, the shot's plan must honour
it: name the shot's `role_in_chain`, carry its `visual_keys[]` into the prompt, and
log each honoured element in `policy_notes[]` so the Designer's critic can verify
it. The gag plan is upstream authority — the reference plan serves it, never
reinterprets it.
