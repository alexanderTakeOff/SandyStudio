# SS-S01 — Character Profile: Sandy
## SS-S01-BIB-character_sandy-v01-DRAFT.md
## Agent: ART-CAST | v0.1 | DRAFT

---

```yaml
character_id:     sandy
display_name:     "Sandy"
role:             protagonist

# ── PERSONALITY ──────────────────────────────────────────────

archetype:        "The Self-Deceiver"
motivation:       "To be seen as important, elegant, and in control at all times."
fatal_flaw:       "Her sense of status is entirely physical — she has no actual substance
                   to back it up. When physics corrects her, she has no other resources."
speech_pattern:   "N/A — zero dialogue. Sandy communicates exclusively through
                   physical action and the position of her mass."
comedy_function:  "chaos agent who believes she is the straight man.
                   She sets up every disaster through overconfidence."

# ── APPEARANCE ───────────────────────────────────────────────

age_appearance:   "adult — ageless, indeterminate"
build: >
  Living hourglass approximately 1.5 human heights tall. Two silicone bulbs connected
  by a narrow waist. Upper bulb and lower bulb are equal in volume capacity.
  The body is soft, smooth, translucent cream-coloured silicone — slight sheen,
  no texture.
distinctive_features:
  - "gold sand filling — distribution between bulbs is always visually clear and narratively legible"
  - "thin black cord arms and legs — simple, almost skeletal against the rounded body"
  - "white cotton gloves — always worn, even upside down, even in distress"
typical_wardrobe:  "No clothing beyond white gloves. The silicone body IS the form.
                    Gloves are white, clean, and slightly oversized — cartoon standard."
colour_signature:  "gold amber sand (#d4a017) against pale cream silicone (#e8dcc8),
                    black cord limbs, white gloves"

# ── CANONICAL PROMPT FRAGMENT ────────────────────────────────
# LOCKED after first Director approval.
# Injected verbatim into every image/video prompt where sandy appears.
# Does NOT describe action, expression, or location.

canonical_prompt_fragment: >
  tall hourglass-shaped figure made of smooth translucent pale cream silicone,
  two rounded bulbs connected by a narrow waist, filled with visible heavy gold
  amber sand, thin black cord arms and legs, small white cotton gloves on hands,
  cartoon character design, bold graphic style, clean outlines

# ── PHYSICS RULES (animation directives) ─────────────────────
# These are not personality notes — they are generation constraints.

physics_rules:
  sand_high:
    visual:   "upper bulb full and rounded, lower bulb narrow and light"
    posture:  "upright, chest forward, slight forward lean — buoyant walk"
    movement: "springy, fast, light footfall — cord legs barely touch ground"
  sand_low:
    visual:   "lower bulb heavy and distended, upper bulb flat and collapsed"
    posture:  "hunched, dragging — centre of gravity below waist"
    movement: "slow, effortful, each step visibly heavy"
  sand_mid:
    visual:   "roughly equal distribution — stable hourglass silhouette"
    posture:  "neutral — neither proud nor burdened"
  inverted_upside_down:
    visual:   "entire figure rotated 180°. What was lower bulb is now upper (and filling).
               White gloves visible on 'feet' now acting as hands on floor."
    sand_behaviour: "sand immediately begins migrating toward new gravitational low point
                     (which is now the original upper bulb — her 'head')"
    movement: "walking on hands — gloved hands plant and push, cord legs in air"

# ── RELATIONSHIPS ─────────────────────────────────────────────

relationships:
  - character_id: inspector_stopwatch
    dynamic:       "Sandy sees Inspector as an obstacle to overcome. Inspector sees
                    Sandy as a data point to evaluate. Neither is wrong."

# ── CONTINUITY ───────────────────────────────────────────────

established_in:          "series_bible"
first_appearance_visual: null   # to be filled after first generation round
```

---

*SS-S01-BIB-character_sandy-v01-DRAFT.md | ART-CAST output | Pending Director approval*
*canonical_prompt_fragment LOCKS on first Director approval — version increment required for any change*
