# SandyStudio — Character Profile Schema
## specs/schemas/character_profile.md | v0.1 | DRAFT

> Defines the exact format of a character profile file.
> Produced by: ART-CAST
> Consumed by: EXEC-SW (script), EXEC-SB (storyboard), EXEC-VGEN (generation), ART-CONT (continuity)
> Character profiles must be APPROVED before any script can be written.

---

## PURPOSE

The character profile is the single source of truth for how a character looks, speaks,
moves, and behaves. It serves two purposes simultaneously:
1. **Creative** — defines personality, relationships, and role
2. **Technical** — provides the exact prompt fragment injected into every AI generation call
   for this character, ensuring visual consistency across all shots

The `canonical_prompt_fragment` field is the most critical field in this schema.
It must be precise enough that an AI model generates a recognisably consistent character
every time it is used.

---

## FILE NAMING

One file per character.
```
SS-[SEASON]-BIB-character_[name]-v[NN]-[STATUS].md
Example: SS-PILOT-BIB-character_pink_panther-v01-DRAFT.md
         SS-PILOT-BIB-character_inspector_clouseau-v01-DRAFT.md
```

Note: Character profiles are series-level, not episode-level.
Use PILOT in the episode field until series is fully defined.

---

## SCHEMA

```yaml
character_id: string          # REQUIRED — snake_case, used in all other schemas
                              # Example: "pink_panther", "inspector_clouseau"
full_name: string             # REQUIRED — full character name
aliases:                      # OPTIONAL — nicknames or alternate names
  - string
role: string                  # REQUIRED — LEAD | RECURRING | SUPPORTING | BACKGROUND
series: string                # REQUIRED — "SandyStudio Pink Panther"

# --- VISUAL APPEARANCE ---
# This section drives the canonical_prompt_fragment.
# Every field here must be observable on screen — no internal states.

visual_appearance:
  body:
    build: string             # REQUIRED — proportions and build description
                              # Example: "tall, slender, slightly elongated limbs"
    height_relative: string   # REQUIRED — relative to other characters
                              # Example: "tallest character in the series"

  coloring:
    primary: string           # REQUIRED — main body/fur/skin color + hex
                              # Example: "dusty rose pink, #E8A0A8"
    secondary: string         # OPTIONAL — secondary color areas + hex
    accent: string            # OPTIONAL — accent color + hex
    outline: string           # REQUIRED — outline/line color
                              # Example: "dark charcoal, #2B2B2B"

  face:
    shape: string             # REQUIRED — face shape description
    eyes: string              # REQUIRED — eye color, shape, expression default
    nose: string              # REQUIRED — nose style
    mouth: string             # REQUIRED — mouth style, default expression
    signature_expression: string  # REQUIRED — the expression most associated with this character
                              # Example: "languid, half-lidded cool — slightly bored by default"

  costume:
    description: string       # REQUIRED — full costume description
    colors: string            # REQUIRED — costume color(s) + hex codes
    always_wears: string      # OPTIONAL — item never removed
                              # Example: "always wears white gloves"
    never_wears: string       # OPTIONAL — item never worn

  signature_elements:         # REQUIRED — 2–4 visual markers instantly recognisable
    - string                  # Example: "long, lazy tail that acts independently"
                              # Example: "walks on two legs with exaggerated casual sway"

# --- CANONICAL PROMPT FRAGMENT ---
# This is the exact text inserted into every Veo3/Midjourney/Kling prompt
# that features this character. It must be self-contained and model-tested.
# Written by ART-CAST, validated by EXEC-VGEN against actual generation output.
# Format: comma-separated descriptors optimised for image/video generation models.

canonical_prompt_fragment: string   # REQUIRED
  # Example for Pink Panther:
  # "a tall slender anthropomorphic pink panther, dusty rose pink fur (#E8A0A8),
  #  charcoal outline, half-lidded cool expression, white gloves, walks upright,
  #  languid graceful movement, 1960s animated cartoon style, MGM Pink Panther aesthetic,
  #  clean lines, flat colour with soft shading"

# --- PERSONALITY ---
personality:
  core_traits:                # REQUIRED — 3–5 adjectives or short phrases
    - string
  comedic_style: string       # REQUIRED — how this character generates comedy
                              # Example: "reacts to chaos with cool detachment;
                              #           never breaks composure until the final beat"
  speech_patterns: string     # REQUIRED — how this character speaks (even if rarely)
                              # Example: "almost never speaks; communicates through
                              #           expression and gesture; when speaks, deadpan"
  motivation: string          # REQUIRED — what this character fundamentally wants
  never_does:                 # REQUIRED — 2–4 things this character would never do
    - string                  # These are hard creative constraints.
                              # Example: "never raises voice", "never runs — always saunters"

# --- MOVEMENT ---
movement_style: string        # REQUIRED — how this character moves through space
                              # This directly informs storyboard action descriptions.
                              # Example: "saunters with exaggerated hip sway, never hurries,
                              #           tail moves with own independent personality,
                              #           reacts to impact in slow-motion exaggeration"

# --- RELATIONSHIPS ---
relationships:                # OPTIONAL
  - character_id: string      # character_id of related character
    relationship: string      # nature of relationship
    dynamic: string           # how they interact comedically

# --- CONTINUITY NOTES ---
continuity:
  first_appears: string       # REQUIRED — episode_id of first appearance
  established_facts:          # OPTIONAL — canonical facts locked across all episodes
    - string

# --- METADATA ---
version: string               # REQUIRED
status: string                # REQUIRED — DRAFT | REVIEW | APPROVED | LOCKED
created_by: string            # REQUIRED — "ART-CAST"
reviewed_by: string           # OPTIONAL — "ART-AD" (visual consistency check)
date: string                  # REQUIRED — ISO format
approved_by: string           # REQUIRED when APPROVED
approved_date: string         # REQUIRED when APPROVED
```

---

## RULES

1. `canonical_prompt_fragment` must be tested against the chosen generation API before the profile can move to APPROVED. EXEC-VGEN runs test generations and reports back to ART-CAST.
2. Characters must not be described in terms of other real-world characters (e.g. "looks like X from movie Y") — descriptions must be self-contained for IP reasons.
3. `never_does` is a hard constraint. If a script asks a character to do something in their `never_does` list, the script must be revised — not the profile.
4. If a character's `visual_appearance` changes (e.g. costume update for a new season), create a new version of the profile. The old version remains LOCKED. EXEC-ARCH tracks version per episode.
5. `canonical_prompt_fragment` changes require re-testing all existing generation prompts that reference this character.

---

## EXAMPLE (abbreviated)

```yaml
character_id: "pink_panther"
full_name: "The Pink Panther"
role: "LEAD"
series: "SandyStudio Pink Panther"

visual_appearance:
  body:
    build: "tall, slender, slightly elongated limbs, anthropomorphic big cat"
    height_relative: "tallest main character"
  coloring:
    primary: "dusty rose pink, #E8A0A8"
    outline: "dark charcoal, #2B2B2B"
  face:
    shape: "long, elegant muzzle, rounded forehead"
    eyes: "heavy-lidded, pale green, perpetually half-closed"
    signature_expression: "languid cool — faintly amused by everything"
  costume:
    description: "no fixed costume — au naturel; occasionally wears items situationally"
    always_wears: "own pink fur; white gloves in formal situations"
  signature_elements:
    - "long expressive tail with independent personality"
    - "walks upright with exaggerated casual sway"
    - "eyebrow raises as primary emotional expression"

canonical_prompt_fragment: "tall slender anthropomorphic pink panther, dusty rose pink
  fur, charcoal outline, heavy-lidded cool expression, walks upright, languid graceful
  movement, 1960s animated cartoon style, clean lines, flat colour with soft shading,
  expressive tail"

personality:
  core_traits:
    - "unflappable cool"
    - "quietly clever"
    - "dignified despite chaos"
  comedic_style: "reacts to escalating disaster with diminishing patience;
                  comedy comes from composure cracking one millimetre at a time"
  speech_patterns: "almost never speaks; communicates through expression and gesture"
  motivation: "to have one quiet, elegant moment without interruption"
  never_does:
    - "panics visibly"
    - "raises voice"
    - "runs — always saunters, even fleeing"

movement_style: "saunters with exaggerated hip sway; tail moves independently;
                 reacts to physical impact in exaggerated slow-motion"

version: "v01"
status: "DRAFT"
created_by: "ART-CAST"
date: "2026-04-23"
```

---

*SandyStudio character_profile.md schema | v0.1 | Status: DRAFT*
