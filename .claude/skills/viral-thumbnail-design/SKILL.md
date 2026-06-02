---
name: viral-thumbnail-design
description: Decision playbook for the Thumbnail Designer (EXEC-THUMB-DESIGNER). Teaches what makes a YouTube thumbnail clickable — emotional hook, contrast/colour, minimal overlay text, curiosity gap, scale, mobile-first composition, and a multi-variant policy. Genre/character-agnostic CTR craft; concrete subject/medium/provider come from Bible+Brief+config.
status: ACTIVE
owner: EXEC-THUMB-DESIGNER (Thumbnail Designer)
flavor: process
applies_when:
  agent: [EXEC-THUMB-DESIGNER]
hard: false
created: 2026-06-01
---

# Viral Thumbnail Design — Decision Playbook

> **flavor: process.** This skill teaches the *craft of the click* — the invariant
> CTR principles and the design sequence. It does NOT name a character, a medium,
> a genre, a provider, or a font. Those resolve from the Series Bible, the episode
> Brief, and `config/*`. The protagonist, palette anchors, and tone come from canon;
> the click psychology below is universal.

> One image. One chance to earn the click. Every concept must make a thumb-stopping
> promise the video can keep.

## The job

Given the episode's Bible canon (protagonist + style) and the script's strongest
beat, **art-direct several distinct thumbnail concepts** that maximise click-through
rate, then let the Director pick. You design the *prompt + overlay copy + composition*;
a downstream executor renders and crops each concept to the delivery target's spec.

## CTR principles (the invariants)

1. **Emotional hook — lead with one expressive subject.**
   A single subject with an exaggerated, legible emotion (shock / glee / panic /
   determination) out-clicks neutral or crowded frames; expressive faces/eyes lift
   CTR materially. Use the protagonist defined in the Bible — never a generic or
   anonymous figure. The *which emotion* is driven by the episode beat from the Brief.

2. **Contrast & colour — make the subject pop off a white/dark feed.**
   Push subject-to-background separation. Prefer complementary pairs (blue/orange,
   yellow/violet, red/cyan) and a small bold palette. Bright subject on a darker or
   contrasting ground. Stay inside the style anchor's colour rules from the Bible —
   intensify within canon, don't break it.

3. **Overlay text — 1–3 words, max 5.**
   Huge, bold, readable at ~120px mobile width. Emotional or curiosity wording, not a
   description. High-contrast fill with stroke/shadow so it survives any background.
   Text must add intrigue, never restate the title. Some concepts may carry no text —
   offer at least one text-led and one image-only concept.

4. **Curiosity gap — show the setup, hide the payoff.**
   Frame the question, not the answer. Visual tension via juxtaposition, before→after,
   or an unresolved moment. The viewer should *need* the click to resolve it.

5. **Scale & exaggeration.**
   Larger-than-life framing of the stakes/object reads as "extraordinary" and pulls
   the eye. Exaggerate within the world's physical rules from the Bible.

6. **Mobile-first composition.**
   One clear focal point, rule-of-thirds, generous negative space. **Compose the
   subject inside a 16:9 safe zone within whatever native frame the provider emits**
   (the executor center-crops to the delivery target), so the crop never clips the
   hook or the overlay text. Assume the thumbnail is seen tiny first.

7. **Designed, not pulled.**
   Each concept is bespoke for the click — not a frame lifted from the video.

## Variant policy

- Produce the variant count from the Brief/config. If unspecified, default to **3**
  (absence-convention default — enough spread for a real choice, not wasteful).
- Make concepts **genuinely distinct**, not recolours — e.g. one *emotion-led*, one
  *scale/curiosity-led*, one *text-led*. Each must stand on a different click lever
  above so the Director's choice is meaningful and future A/B has signal.

## Sequence (every run)

1. Read the protagonist + style canon from the Bible and the strongest beat from the
   script/Brief. If the protagonist canon is absent → HALT and request it (do not
   invent a subject — that is the "generic two humans" failure).
2. Pick the click lever per variant (emotion / curiosity / scale / text).
3. For each variant compose: positive prompt (subject canon + emotion + composition +
   palette + 16:9 safe-zone note), negative prompt (style anchor's negatives + the
   running defect list below), overlay copy, palette, composition notes.
4. Record a one-line rationale per variant: *why this earns the click*.

## Running negative / defect list

Carry forward defects observed in review (Critic/Director feedback appends here):
- generic/anonymous humans when the protagonist is canonical
- text longer than 5 words, or text unreadable at mobile size
- subject centered such that a 16:9 crop clips it
- low subject/background contrast; muddy palette
- baked-in watermark, UI chrome, or provider artefacts

## Conflict resolution

If the Bible style anchor and the Brief disagree on an invariant (palette, medium,
tone), **HALT and escalate** citing both sources — do not silently reconcile.

## Cross-references

- System prompt: `agents/exec/thumbnail-designer.md` (authority, JSON schema, provider/size/font specifics).
- Render + crop + text-overlay contract lives in code/config, not here.
- Abstraction discipline: `~/.claude/rules/common/skill-creation.md`.
