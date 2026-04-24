# SS-S01 — Character Profile: Inspector Stopwatch
## SS-S01-BIB-character_inspector_stopwatch-v01-DRAFT.md
## Agent: ART-CAST | v0.1 | DRAFT

---

```yaml
character_id:     inspector_stopwatch
display_name:     "Inspector Stopwatch"
role:             antagonist   # recurring — appears at every entry point episode

# ── PERSONALITY ──────────────────────────────────────────────

archetype:        "The Incorruptible System"
motivation:       "To enforce the entry standard. Perfectly. Without exception. Always."
fatal_flaw:       "He has no capacity for nuance. He reads surfaces. He is correct
                   about surfaces. He is completely blind to what is underneath."
speech_pattern:   "N/A — zero dialogue. Inspector communicates exclusively through
                   mechanical sounds and arrow-brow position."
comedy_function:  "straight man who is always technically right and entirely wrong.
                   His correctness is the source of every gag."

# ── APPEARANCE ───────────────────────────────────────────────

age_appearance:   "ancient — indeterminate, worn"
build: >
  Compact rectangular brass body, approximately human torso height, mounted on a single
  telescopic shaft that extends and retracts vertically. No legs. No feet.
  Two short rectangular brass arms fold at right angles only — no curves.
  The shaft can rotate 360° on its base and extend to scan objects at any height.
distinctive_features:
  - "white clockface head with single black arrow that functions as both clock hand and expressive brow"
  - "scratched and dented brass surface — wear is consistent and specific, not random"
  - "telescopic shaft — the only organic-looking movement in an otherwise rigid form"
typical_wardrobe:  "No wardrobe. The brass body IS the form. Surface wear (specific dents
                    and scratches) is consistent across all appearances — these are
                    continuity markers, not decoration."
colour_signature:  "worn brass (#b5a642) with white clockface (#f5f5f0),
                    single black arrow-brow, cobalt shadow fill"

# ── CANONICAL PROMPT FRAGMENT ────────────────────────────────
# LOCKED after first Director approval.

canonical_prompt_fragment: >
  compact rectangular brass robot body, worn and scratched tarnished brass surface,
  mounted on single telescopic vertical shaft, two short rectangular brass arms,
  round white clockface head with single black clock-hand arrow acting as eyebrow,
  no legs, mechanical cartoon character design, bold graphic style, clean outlines

# ── ARROW-BROW POSITIONS (emotional states) ──────────────────
# Canonical clock positions — used in shot action descriptions and prompts.
# These are the ONLY emotional indicators available for this character.

arrow_brow_positions:
  neutral:          "3 o'clock — horizontal right"
  skeptical:        "6 o'clock — pointing straight down"
  approving:        "12 o'clock — pointing straight up"
  suspicious:       "oscillating between 7 and 5 — ticking back and forth"
  processing_scan:  "spinning slowly clockwise — full rotation during scan"
  shocked:          "9 o'clock — horizontal left (opposite of neutral)"
  deciding:         "moving from 6 toward 12 — deliberate arc upward"

# ── PHYSICS RULES ─────────────────────────────────────────────

physics_rules:
  movement_type:    "glide — shaft extends/retracts, body rotates smoothly, no step or bounce"
  deformation:      "none — no squash, no stretch, no bending except at defined right-angle joints"
  scan_behaviour:   "extends shaft to height of subject, rotates body to face subject directly,
                     arrow-brow spins during scan, then snaps to verdict position"
  verdict_animation:
    pass:   "shaft extends full height, arrow to 12, single ascending chime"
    fail:   "shaft retracts to minimum height, arrow to 6, single descending chime"

# ── RELATIONSHIPS ─────────────────────────────────────────────

relationships:
  - character_id: sandy
    dynamic:       "Sandy is input data. Inspector evaluates, decides, moves on.
                    He holds no grudge and no admiration. He simply reads what is in front of him."

# ── CONTINUITY ────────────────────────────────────────────────

established_in:          "series_bible"
first_appearance_visual: null
surface_wear_reference:  null   # to be filled after first approved visual — wear is then LOCKED
```

---

*SS-S01-BIB-character_inspector_stopwatch-v01-DRAFT.md | ART-CAST output | Pending Director approval*
*canonical_prompt_fragment LOCKS on first Director approval — version increment required for any change*
*surface_wear_reference LOCKS after first approved visual — Inspector's dents must be consistent across all episodes*
