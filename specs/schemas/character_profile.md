# SandyStudio — Character Profile Schema
## specs/schemas/character_profile.md | v0.2 | DRAFT

> Defines the exact format of a character profile file.
> Produced by: ART-CAST
> Consumed by: EXEC-SW (script), EXEC-SB (storyboard), EXEC-VGEN (generation), ART-CONT (continuity)
> Character profiles must be APPROVED before any script can be written.
>
> **v0.2 update (2026-04-24):** Added `master_reference_image_path` and
> `reference_variants` fields (PA-001 + PA-002).
> Visual development workflow fields added (PA-005).

---

## PURPOSE

The character profile is the single source of truth for how a character looks, speaks,
moves, and behaves. It serves two purposes simultaneously:
1. **Creative** — defines personality, relationships, and role
2. **Technical** — provides the exact prompt fragment AND the master reference image
   injected into every AI generation call for this character

Two-tier consistency system (see `specs/system/character_consistency.md`):
- `canonical_prompt_fragment` — text anchor, injected into every prompt
- `master_reference_image_path` — Level 0 image anchor, loaded by EXEC-VGEN Step 0

Both must be present and approved before the profile reaches APPROVED status.

---

## FILE NAMING

One file per character.
```
SS-[SEASON]-BIB-character_[name]-v[NN]-[STATUS].md
Example: SS-S01-BIB-character_sandy-v01-APPROVED.md
         SS-S01-BIB-character_inspector_stopwatch-v01-APPROVED.md
```

Note: Character profiles are series-level, not episode-level.

---

## SCHEMA

```yaml
character_id: string          # REQUIRED — snake_case, used in all other schemas
full_name: string             # REQUIRED — full character name
aliases:                      # OPTIONAL — nicknames or alternate names
  - string
role: string                  # REQUIRED — LEAD | RECURRING | SUPPORTING | BACKGROUND
series: string                # REQUIRED — e.g. "SandyStudio S01"

# ─────────────────────────────────────────────────────────
# VISUAL REFERENCE TIER (PA-001 / PA-002)
# Both fields required before profile can reach APPROVED.
# ─────────────────────────────────────────────────────────

master_reference_image_path: string | null
  # REQUIRED for APPROVED status. null only in DRAFT before visual development.
  # Path to Level 0 Master Reference Image.
  # Format: "H:/My Drive/SandyStudio_Media/approved/images/[character_id]-master-ref-v[NN]-APPROVED.png"
  # LOCKED after first Director approval. Design changes → new version + new path.
  # EXEC-VGEN Step 0: if null → STOP, escalate upstream.

reference_variants:           # OPTIONAL — records the visual development history
  approved_variant: string    # Which variant was selected (e.g. "B" or "A+C_combined")
  rounds: integer             # How many iteration rounds before approval
  date_approved: string       # ISO date
  approved_by: string         # "Director" always

# ─────────────────────────────────────────────────────────
# VISUAL APPEARANCE
# Every field here must be observable on screen — no internal states.
# Drives the canonical_prompt_fragment.
# ─────────────────────────────────────────────────────────

visual_appearance:
  body:
    build: string             # REQUIRED — proportions and build description
    height_relative: string   # REQUIRED — relative to other characters

  coloring:
    primary: string           # REQUIRED — main body color + hex
    secondary: string         # OPTIONAL — secondary color areas + hex
    accent: string            # OPTIONAL — accent color + hex
    outline: string           # REQUIRED — outline/line color + hex

  face:
    shape: string             # REQUIRED
    eyes: string              # REQUIRED
    nose: string              # REQUIRED
    mouth: string             # REQUIRED
    signature_expression: string  # REQUIRED

  costume:
    description: string       # REQUIRED
    colors: string            # REQUIRED
    always_wears: string      # OPTIONAL
    never_wears: string       # OPTIONAL

  signature_elements:         # REQUIRED — 2–4 instantly recognisable visual markers
    - string

# ─────────────────────────────────────────────────────────
# CANONICAL PROMPT FRAGMENT
# Exact text inserted into every generation prompt for this character.
# Written by ART-CAST AFTER master_reference_image_path is approved.
# Derived from the approved visual — not from abstract description.
# Tested: ≥8/10 test generations must match master reference.
# ─────────────────────────────────────────────────────────

canonical_prompt_fragment: string   # REQUIRED

fragment_test:
  tested: boolean             # REQUIRED — true = automated technical check done
  pass_rate: string           # e.g. "9/10" — must be ≥8/10 per human review
  test_log: string            # path to fragment test review file
  tested_by: string           # "EXEC-VGEN" — automated technical check only
  reviewed_by: string         # REQUIRED — human who reviewed the images visually
                              # Director name or designated human approver.
                              # NEVER an agent ID. If blank → not approved.
  tested_date: string         # ISO date

# ─────────────────────────────────────────────────────────
# PHYSICS / MECHANICAL STATES
# Character-specific state vocabulary used by EXEC-SB and EXEC-VGEN.
# Only for characters with physics-driven visual states (e.g. Sandy's sand, Inspector's shaft).
# ─────────────────────────────────────────────────────────

physics_states:               # OPTIONAL — define only if character has state-driven appearance
  - state_id: string          # e.g. "sand_high", "inverted_upside_down"
    description: string       # observable physical description of this state
    prompt_addendum: string   # text appended to canonical_prompt_fragment in this state

# ─────────────────────────────────────────────────────────
# PERSONALITY
# ─────────────────────────────────────────────────────────

personality:
  core_traits:                # REQUIRED — 3–5 adjectives or short phrases
    - string
  comedic_style: string       # REQUIRED
  speech_patterns: string     # REQUIRED (e.g. "never speaks — zero dialogue")
  motivation: string          # REQUIRED
  never_does:                 # REQUIRED — 2–4 hard creative constraints
    - string

# ─────────────────────────────────────────────────────────
# MOVEMENT
# ─────────────────────────────────────────────────────────

movement_style: string        # REQUIRED

# ─────────────────────────────────────────────────────────
# RELATIONSHIPS
# ─────────────────────────────────────────────────────────

relationships:                # OPTIONAL
  - character_id: string
    relationship: string
    dynamic: string

# ─────────────────────────────────────────────────────────
# CONTINUITY
# ─────────────────────────────────────────────────────────

continuity:
  first_appears: string       # REQUIRED
  established_facts:          # OPTIONAL
    - string

# ─────────────────────────────────────────────────────────
# METADATA
# ─────────────────────────────────────────────────────────

version: string               # REQUIRED
status: string                # REQUIRED — DRAFT | REVIEW | APPROVED | LOCKED
created_by: string            # REQUIRED — "ART-CAST"
reviewed_by: string           # OPTIONAL — "ART-AD"
date: string                  # REQUIRED — ISO date
approved_by: string           # REQUIRED when APPROVED — always "Director/CEO"
approved_date: string         # REQUIRED when APPROVED
```

---

## RULES

1. `master_reference_image_path` must be filled (not null) before status can move to APPROVED. EXEC-VGEN Step 0 blocks production if null.
2. `canonical_prompt_fragment` must be written AFTER master reference is approved — it must describe the approved visual, not an abstract intention.
3. `fragment_test.pass_rate` must be ≥8/10 before profile can move to REVIEW.
4. Characters must not be described in terms of other IP characters — descriptions must be self-contained.
5. `never_does` is a hard constraint. Scripts must be revised, not the profile.
6. Design changes (any visual element) → new profile version + new master reference image. Old version stays LOCKED.
7. `canonical_prompt_fragment` text-only changes → re-test required, version patch (e.g. v01a).
8. Do not change `master_reference_image_path` during an active production run.

---

## APPROVAL STATUS GATE

Profile cannot reach APPROVED unless all of these are true:

```
✅ master_reference_image_path: not null
✅ fragment_test.tested: true
✅ fragment_test.pass_rate: ≥8/10
✅ All REQUIRED fields present
✅ reviewed_by: ART-AD (visual check)
✅ approved_by: Director/CEO
```

---

## EXAMPLE (abbreviated, Sandy)

```yaml
character_id: "sandy"
full_name: "Sandy"
role: "LEAD"
series: "SandyStudio S01"

master_reference_image_path: null   # DRAFT — to be filled after visual development
reference_variants:
  approved_variant: null
  rounds: null
  date_approved: null
  approved_by: null

visual_appearance:
  body:
    build: "tall hourglass shape, two rounded bulbs connected by narrow waist"
    height_relative: "taller than Inspector Stopwatch"
  coloring:
    primary: "pale cream translucent silicone, #e8dcc8"
    outline: "thin clean black outline"
  face:
    signature_expression: "no face — expression conveyed entirely through sand distribution"
  costume:
    always_wears: "small white cotton gloves on hands"
  signature_elements:
    - "visible heavy gold amber sand shifting inside silicone body"
    - "thin black cord arms and legs"
    - "sand position = emotional state — 100% upper = confident, 100% lower = defeated"

canonical_prompt_fragment: >
  tall hourglass-shaped figure made of smooth translucent pale cream silicone,
  two rounded bulbs connected by a narrow waist, filled with visible heavy gold
  amber sand, thin black cord arms and legs, small white cotton gloves on hands,
  cartoon character design, bold graphic style, clean outlines

fragment_test:
  tested: false    # pending visual development phase
  pass_rate: null
  test_log: null
  tested_by: null
  tested_date: null

physics_states:
  - state_id: sand_high
    description: "sand 100% in upper bulb — confident, full, heavy top"
    prompt_addendum: "gold sand filling upper bulb completely, lower bulb empty and slim"
  - state_id: sand_mid
    description: "sand 50/50 — uncertain, transitional"
    prompt_addendum: "gold sand distributed equally between both bulbs"
  - state_id: sand_low
    description: "sand 100% lower bulb — defeated, heavy bottom"
    prompt_addendum: "lower bulb filled heavy with gold sand, upper bulb empty and slim"
  - state_id: inverted_upside_down
    description: "full handstand — smeared lower bulb raised, clean upper at bottom"
    prompt_addendum: "fully inverted handstand, smeared lower bulb at top, clean upper bulb at bottom"

personality:
  core_traits:
    - "unshakeable self-confidence"
    - "oblivious to own situation"
    - "committed to the plan regardless of evidence"
  comedic_style: "the gap between her confidence and reality is the entire joke"
  speech_patterns: "zero — no dialogue, no sound, no vocal expression"
  motivation: "to get inside the club"
  never_does:
    - "acknowledges defeat explicitly"
    - "speaks or vocalises"
    - "shows fear"

movement_style: "walks with unhurried swagger, cord legs barely touching carpet;
                 gloves move ahead like advance scouts;
                 in handstand: methodical, glove-by-glove precision"

version: "v01"
status: "APPROVED"
created_by: "ART-CAST"
reviewed_by: null
date: "2026-04-24"
approved_by: "Director/CEO"
approved_date: "2026-04-24"
```

---

*SandyStudio character_profile.md schema | v0.2 | Status: DRAFT*
*PA-001: master_reference_image_path added | PA-002: fragment_test + physics_states added*
