---
name: Library Style-First Visual Generation Protocol
description: "Process skill: enforce style-anchor-first sequencing for Bible Library visual generation, with declared-style preflight and Director gates. Medium/style vocabulary is owned by Bible+Brief, not this skill."
status: ACTIVE
owner: Polina
applies_when:
  agent: [EXEC-BIBLE-AUTHOR]
  gate: [bible_library_generation, visual_development]
  file_type: [series_bible, library_visual_asset]
hard: true
created: 2026-05-19
---
# Library Style-First Visual Generation Protocol

## Purpose

Prevent visual-library drift and non-canon contamination during Series Bible Library generation by enforcing that **one approved style anchor exists, is verified per asset, and gates everything downstream**. This skill is medium-agnostic — it works for 2D, 3D, photoreal, claymation, mixed media, anything. The actual style is declared by the series — not by this skill.

## Hard Rule

Never generate characters, props, or locations before a Director-approved style anchor asset exists and is used as the style source for every subsequent generation.

## Required sequence

1. Generate exactly one style sample first, using the style attributes declared in Series Bible (Style section, LOCKED) and refined by the current Brief if Brief adds non-conflicting detail.
2. Run prompt preflight on that sample before generation (see «Declared-Style Preflight» below).
3. Wait for Director approval of the style sample.
4. Generate one canary character asset. The canary character is the one designated by project Bible; if no canary is declared, HALT and ask Director to designate one before proceeding.
5. Wait for Director review of canary style compliance.
6. Only then generate other characters, props, and locations — each using the approved style anchor as the explicit style source.
7. Generate in small batches; do not launch a large batch until the style sample and canary have both passed.

## Declared-Style Preflight

This skill **does not encode style vocabulary**. The vocabulary is read from the source of truth.

Before any generation, extract the **declared style anchor** from:

- Series Bible Style section (LOCKED status), and
- the current Brief's style declarations (if present).

The anchor exposes two lists:

- **Positive attributes** — terms the prompt MUST include.
- **Negative attributes** — terms the prompt MUST reject.

Preflight is a string-comparison check:

- Confirm every positive attribute from the anchor appears in the generation prompt's positive section.
- Confirm no negative attribute from the anchor appears in the prompt's positive section.

If any positive attribute is missing or any negative attribute leaks into the positive prompt, stop and rewrite the prompt before generation. Never let a generation through preflight on the basis of «close enough».

## Style Anchor Rule

After Director approves the style sample, every character, object, and location generation must reference that anchor as the style source. Generating without the approved anchor — or with a different anchor — is not allowed.

## Primary Object Reference Rule

When generating an asset in the **Objects** section of the Series Bible Library, the default output is a **primary object reference**, not an exploration sheet.

Hard requirements for every primary object reference:

- **one object = one image**;
- exactly one canonical object instance in frame;
- one clean hero view only, preferably front-facing or three-quarter;
- neutral background unless the Brief explicitly says otherwise;
- no contact sheet, no multi-view sheet, no turnaround grid, no rows/columns;
- no alternate states, damage states, life situations, use scenes, or story panels;
- no characters, hands, animals, silhouettes, or reflected characters unless the asset is explicitly a character-interaction reference rather than the primary object reference;
- no extra props that can contaminate downstream generation.

Rationale: primary object refs are fed downstream as canon. Multi-object sheets reduce per-object pixel budget, lower image quality, and cause video/reference systems to treat variants, characters, hands, or surrounding context as part of the object's identity.

State variations, damage progressions, turnarounds, scale charts, and character-interaction diagrams belong in text canon or in separately named non-primary assets. They must not be mixed into the primary object card.

If the object description contains sections such as `State Variations`, `Character Interactions`, `Damage Progression`, or `Allowed Variants`, the generator must treat those as **text-only animation/use notes** unless the requested asset is explicitly a variant sheet. They are not permission to draw multiple versions in the primary reference.

## Object Naming Guardrail

For object assets, use the most specific production noun as the lead noun in the prompt. Do not lead with a generic component name if it changes the generated object category.

Examples:

- Use “heavy floor-standing trumeau vanity / old-fashioned vanity dresser with mirror”, not “mirror”, when the intended object is furniture.
- Use “flat-strap dog leash with handle loop and clip”, not “rope”, when the intended object is a leash.
- Use “paper treat bag”, not “bag”, when the intended object is a specific small paper prop.

If the canonical name is ambiguous, rewrite the generation prompt around the precise production noun before generating. Naming is part of visual control, not cosmetic metadata.

## Continuity Rule

Before generating multiple views or variants of any object/location, create a continuity card with:

- fixed silhouette,
- fixed colors,
- fixed materials,
- scale relative to the canary character,
- allowed damage / state variants,
- forbidden variations,
- details that must remain identical across all views.

The values themselves come from Bible+Brief; the continuity-card *requirement* comes from this skill.

Multiple views or variants are a separate, explicitly requested mode. They must never replace the primary object reference.

## Batch Control

Do not launch a large Library batch from unapproved style assumptions. Safe order:

```
style sample → canary → key prop → primary location master → camera-angle variants → secondary props
```

The names of the specific items above (which prop is "key", which location is "primary") come from Bible+Brief, not from this skill.

## Conflict Resolution — Bible ↔ Brief

If Series Bible declares a style invariant X and the current Brief declares a contradictory invariant Y for the same attribute (medium, palette, line treatment, etc.), the executor agent MUST NOT reconcile silently. Required behavior:

1. Insert a HALT activity event citing:
   - Bible asset ID and section,
   - Brief asset ID and section,
   - the conflicting attribute and both declared values.
2. Stop the generation chain — do not pick a winner.
3. Surface the conflict to Director (or to the supervising agent designated by the project), and wait for resolution.

Silent reconciliation produces drift that surfaces three layers downstream as a quality failure with no clear cause.

## Canon Status

All generated Library visuals remain non-canon until Director approval. Draft images must not silently become canonical references — promotion to canon is an explicit Director gate.

## Failure Recovery

If output violates the approved style anchor or otherwise fails preflight:

1. mark the result as non-canon in reporting;
2. identify the prompt/anchor cause (was a positive attribute dropped? did a negative leak in? is the anchor itself contaminated?);
3. regenerate the style sample first if the anchor is contaminated — do not patch downstream;
4. do not continue generating downstream assets from a contaminated anchor.

## What this skill does NOT prescribe

To remain reusable across productions, this skill deliberately does not declare:

- the medium (2D / 3D / photoreal / claymation / mixed) — Bible declares it,
- the palette, line weight, shading model — Bible declares them,
- character names, location names, prop names — Bible declares them,
- aspect ratios, sizes, providers, model IDs — Brief and tool-flavored skills declare them,
- batch sizes or generation counts — Brief declares them.

If you find yourself needing a value this skill does not provide, the answer is in Bible or Brief. If it is missing from both, that itself is a HALT condition — request the missing source-of-truth before generating.

## Reference

This skill is the reference example of a `flavor: process` skill written under [`~/.claude/rules/common/skill-creation.md`](../../../../../Users/NAVIA%20VISION%20ONE/.claude/rules/common/skill-creation.md). When authoring new skills, mirror the pattern: own the process, defer the content.
