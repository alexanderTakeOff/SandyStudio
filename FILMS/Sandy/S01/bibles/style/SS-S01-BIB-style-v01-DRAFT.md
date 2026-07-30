# SS-S01 — Style Bible
## SS-S01-BIB-style-v01-DRAFT.md
## Agent: EXEC-STY | v0.1 | DRAFT

---

## 1. STYLE ANCHOR

```
style_anchor_text: "Bold graphic modernism, Art Deco nightclub atmosphere.
  Smooth synthetic surfaces, deep cobalt darkness, hard white spotlight cones.
  Extreme squash-and-stretch on organic materials. Mechanical rigidity on metal
  surfaces. Flat colour planes, strong silhouettes, zero photorealism."
```

This string is injected verbatim as the opening segment of every EXEC-VGEN prompt.

---

## 2. COLOUR PALETTE

```yaml
palette:
  primary:
    cobalt_shadow:  "#1a1a4e"   # deep night fill — dominant background
    spotlight_white: "#f5f5f0"  # hard light cone — Sandy's stage
  secondary:
    sand_amber:     "#d4a017"   # Sandy's gold sand — warm, heavy, luminous
    brass_worn:     "#b5a642"   # Inspector's body — dull, scratched, authoritative
  accent:
    velvet_red:     "#8b1a1a"   # carpet and rope — high-status, slightly decayed
    silicon_pale:   "#e8dcc8"   # Sandy's empty bulb — translucent cream
  forbidden:
    - "bright green (no natural vegetation in this world)"
    - "pastel tones (wrong era, wrong mood)"
    - "photorealistic skin tones"
```

---

## 3. VISUAL STYLE

```yaml
visual_style:
  rendering:          "flat graphic cartoon — no gradient shading except spotlight cone"
  line_weight:        "bold outlines on characters (4–6px equivalent), thin on props"
  texture_approach:   "smooth and clean — Sandy's silicone has slight sheen, Inspector has subtle scratch marks"
  depth_treatment:    "limited parallax — two planes: characters in spotlight, background in darkness"
  background_complexity: "minimal — shapes and geometry only, no detail behind main action"
  shadow_style:       "hard cast shadows from single overhead spotlight source"
  highlight_style:    "single specular point on Inspector's brass surface, none on Sandy"
```

---

## 4. CHARACTER VISUAL RULES

```yaml
character_rules:
  sandy:
    deformation_type:   "extreme squash-and-stretch — bulbs change proportion freely"
    sand_visibility:    "gold sand level always legible — viewer must read distribution at a glance"
    cord_limbs:         "always thin black cords — never thicken, never shorten"
    gloves:             "white, always present — even when upside down"
    expression_source:  "ONLY sand position and body silhouette — no drawn facial expression"

  inspector_stopwatch:
    deformation_type:   "none — only right-angle folds at joints"
    arrow_brow:
      skeptical:        "pointing to 6 o'clock (straight down)"
      neutral:          "pointing to 3 o'clock (horizontal right)"
      approving:        "pointing to 12 o'clock (straight up)"
      suspicious:       "oscillating 7–5 clock positions (ticking)"
    movement_style:     "telescopic shaft extends/retracts — glide, never step"
    surface_wear:       "scratches and dents consistent across all shots — continuity critical"
```

---

## 5. CAMERA

```yaml
camera:
  valid_angles:
    - "WIDE"
    - "MEDIUM"
    - "CLOSE-UP"
    - "EXTREME-CLOSE-UP"
    - "LOW-ANGLE"
    - "OVERHEAD"
  # NOT in valid set: POV, TWO-SHOT, DUTCH-ANGLE — not appropriate for this style

  preferred_for_comedy:
    setup:      "WIDE — establishes physical context"
    reaction:   "CLOSE-UP — sand level, arrow-brow position"
    punchline:  "MEDIUM or WIDE — full body needed for physical payoff"
    reveal:     "WIDE — audience needs full spatial context"

  movement:
    default:          "STATIC — comedy timing requires stable frame"
    permitted:        ["STATIC", "TRACK-IN", "TRACK-OUT", "PAN-LEFT", "PAN-RIGHT"]
    forbidden:        ["handheld shake", "whip pan", "dutch tilt"]
    note: "Camera moves only to follow physical action. Never for style."
```

---

## 6. PACING

```yaml
pacing:
  target_runtime_seconds: 60
  shots_per_episode_target: 10         # ~6 seconds average per shot
  shots_per_episode_range: [8, 14]

  dialogue_ratio_max: 0.00             # ZERO dialogue — visual determinism only

  comedy_timing:
    setup_duration_seconds: [2.0, 4.0]
    hold_before_punchline_seconds: [1.5, 3.0]   # the pause IS the comedy
    punchline_duration_seconds: [2.0, 5.0]

  cut_rhythm:
    standard: "cut on physical beat completion"
    never:    "cut mid-squash or mid-stretch — deformation must land before cut"
```

---

## 7. AUDIO AESTHETIC

```yaml
audio:
  overall_aesthetic: >
    Zero dialogue. Sound design is the emotional language. Sandy's physics are always
    audible: sand cascading (weight shift), silicone stretch (effort/distress), cord
    snap (sudden movement). Inspector communicates through mechanical sounds only:
    brass click (decision), tick-tick (evaluation), single chime (pass/fail).
    Music is sparse, percussive, and tracks Sandy's physical state — fast when sand
    is high, heavy and slow when sand is low.

  sound_design_palette:
    sandy:
      - "gold sand cascading — dry, dense, like a weighted rain stick"
      - "silicone stretch — high-pitched rubber squeak under tension"
      - "cord snap — thin metallic ping on sudden limb movement"
    inspector:
      - "brass click — single decisive tick for every judgment"
      - "telescopic shaft extend/retract — smooth hydraulic hiss"
      - "chime — ascending (pass), descending (fail)"
    environment:
      - "crowd murmur — low, indistinct, used as pressure texture"
      - "spotlight hum — barely perceptible electrical buzz"

  forbidden_sounds:
    - "dialogue or voice of any kind"
    - "text-to-speech narration"
    - "recognisable music with lyrics"
```

---

## 8. STANDARD NEGATIVE PROMPT

```
standard_negative_prompt: "photorealistic, hyperrealistic, human skin texture,
  natural organic materials, green vegetation, watermarks, text overlays, speech
  bubbles, subtitles, low contrast, muddy colours, soft focus background blur,
  3D render shading, subsurface scattering, film grain"
```

Applied to every image and video generation prompt. Additions per shot go in
`shot.special_effects` with prefix `NEGATIVE:`.

---

## 9. PROMPT CONSTRUCTION ORDER

Per `specs/schemas/prompt.md` IMAGE/VIDEO rules:

```
1. style_anchor_text      (verbatim from §1 above)
2. composition            (shot.camera_angle + shot.camera_movement)
3. visual_moment          (shot.action — what the lens sees)
4. character_fragments    (canonical_prompt_fragment per character_id in shot.characters_present)
5. location_atmosphere    (World Bible location description, condensed)
6. lighting               (shot.lighting_condition)
7. mood                   (shot.mood)
8. effects                (shot.special_effects, if any)
NEGATIVE: standard_negative_prompt + shot-specific negatives
```

---

## 10. VERSION NOTES

```
v0.1 — Initial Style Bible for S01 PILOT.
       Palette, anchor text, camera set, pacing parameters all from creative_direction v01.
       Arrow-brow clock positions defined here — canonical for Inspector across all episodes.
       Calibrate pacing.shots_per_episode after PILOT storyboard is approved.
```

---

*SS-S01-BIB-style-v01-DRAFT.md | EXEC-STY output | Pending Director approval*
