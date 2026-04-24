# SandyStudio — Shot Schema
## specs/schemas/shot.md | v0.1 | DRAFT

> Defines the exact format of a single shot in a storyboard.
> Produced by: EXEC-SB
> Consumed by: EXEC-WCHK (world check), EXEC-VGEN (generation), ART-MS (music timing)
> A storyboard of shots must be APPROVED by Director before generation begins.

---

## PURPOSE

The shot is the atomic unit of production. Every video file generated maps to exactly one shot.
The shot schema is the bridge between narrative (script) and generation (EXEC-VGEN).
It must contain everything a Visual Generator needs to create the correct image/video —
without ambiguity, without reference to anything not in the approved specs.

---

## FILE NAMING (storyboard files)

One storyboard file per act, containing all shots for that act.
```
SS-[SEASON]-[EPISODE]-STB-act[N]-v[NN]-[STATUS].md
Example: SS-S01-E01-STB-act1-v01-DRAFT.md
```

Each storyboard file contains an array of shot blocks in sequence order.

---

## SINGLE SHOT SCHEMA

```yaml
shot_id: string             # REQUIRED — globally unique
                            # Format: [episode_id]-A[act]-SC[scene]-SH[shot]
                            # Example: "S01E01-A1-SC02-SH03"
scene_id: string            # REQUIRED — links to scene in approved script
episode_id: string          # REQUIRED — e.g. "S01E01"
shot_number: integer        # REQUIRED — sequential within scene, starting at 1
script_version: string      # REQUIRED — version of script this shot is based on
                            # If script changes version, shot is INVALIDATED

# --- CAMERA ---
camera_angle: string        # REQUIRED — one of:
                            # WIDE | MEDIUM | CLOSE-UP | EXTREME-CLOSE-UP |
                            # OVERHEAD | LOW-ANGLE | POV | TWO-SHOT
camera_movement: string     # REQUIRED — one of:
                            # STATIC | PAN-LEFT | PAN-RIGHT | TILT-UP | TILT-DOWN |
                            # TRACK-IN | TRACK-OUT | TRACK-LEFT | TRACK-RIGHT

# --- CONTENT ---
location: string            # REQUIRED — must match World Bible location name exactly
time_of_day: string         # REQUIRED — MORNING | DAY | AFTERNOON | EVENING | NIGHT
lighting_condition: string  # REQUIRED — from World Bible lighting rules
                            # e.g. "warm morning light, window left, soft shadows"

characters_present:         # REQUIRED — list of character_ids visible in frame
  - string                  # Use [] if no characters (establishing shot etc.)

action: string              # REQUIRED — what happens in this shot, one sentence.
                            # Written as a camera direction: what the lens sees.
                            # Must include: subject, movement, expression or reaction.
                            # Example: "Pink Panther tiptoes past sleeping Clouseau,
                            #           freezes mid-step as floorboard creaks, eyes wide."

dialogue: string            # OPTIONAL — spoken line heard during this shot (if any)
                            # Must match script exactly

mood: string                # REQUIRED — emotional tone of the shot
                            # e.g. "tense anticipation", "gleeful chaos", "quiet defeat"

duration_seconds: number    # REQUIRED — estimated shot length in seconds
                            # Minimum: 1.5 | Maximum: 8.0 for a single shot
                            # Used by: ART-MS (music sync), assembly tool

# --- COMEDY ---
comic_beat: string          # OPTIONAL — if this shot is a gag or punchline, describe it
                            # e.g. "Soufflé collapses in perfect sync with Clouseau's sneeze"
is_punchline: boolean       # OPTIONAL — true if this is the payoff of a comedy sequence

# --- GENERATION HINTS ---
props_in_frame:             # OPTIONAL — specific props visible, from World Bible inventory
  - string
special_effects: string     # OPTIONAL — visual effects needed
                            # e.g. "cartoon steam from ears", "speed lines on dash"
style_notes: string         # OPTIONAL — any deviation from standard style bible for this shot
                            # Use sparingly. Example: "silhouette only, backlit"

# --- STATUS ---
status: string              # REQUIRED — DRAFT | REVIEW | APPROVED | LOCKED | INVALIDATED
qa_result: string           # OPTIONAL — PASS | FAIL | PENDING
qa_report_id: string        # OPTIONAL — links to QA report if reviewed
generation_file: string     # OPTIONAL — path to generated video/image once created
```

---

## RULES

1. `shot_id` must be unique across the entire project, not just within an episode.
2. `duration_seconds` is mandatory — no shot may be storyboarded without an estimated duration. The sum of shot durations in a scene must align with the target runtime in the brief.
3. `characters_present` must use exact character IDs from approved Character Profiles. EXEC-WCHK cross-references this against the World Checker's appearance rules.
4. `location` must exactly match a location name in the approved World Bible. No improvised locations.
5. `lighting_condition` must derive from the World Bible's lighting rules for that location.
6. If `script_version` of any shot differs from the current approved script version, shot status becomes INVALIDATED automatically (see `specs/protocols/version_cascade.md`).
7. EXEC-VGEN may not generate a shot with status INVALIDATED or DRAFT.
8. A shot with `is_punchline: true` should be generated last for its scene, after surrounding shots are QA-approved, to confirm the build-up is correct.

---

## DURATION GUIDELINES

| Shot type | Typical duration |
|-----------|-----------------|
| Establishing / wide shot | 2.0–4.0 sec |
| Action / reaction | 1.5–3.0 sec |
| Dialogue shot | 2.0–5.0 sec |
| Comic beat / punchline | 2.5–5.0 sec |
| Hold / pause (comedy timing) | 1.5–3.0 sec |

---

## EXAMPLE

```yaml
shot_id: "S01E01-A1-SC02-SH02"
scene_id: "S01E01-A1-SC02"
episode_id: "S01E01"
shot_number: 2
script_version: "v01"

camera_angle: "MEDIUM"
camera_movement: "STATIC"

location: "Panther's Kitchen"
time_of_day: "MORNING"
lighting_condition: "warm morning light from window left, soft shadows, yellow-cream tones"

characters_present:
  - "pink_panther"
  - "inspector_clouseau"

action: "Pink Panther watches in frozen horror as Clouseau's door slam sends
         a shockwave across the room, visibly rippling the air toward the oven."

dialogue: ""

mood: "dread — slow-motion comic anticipation"
duration_seconds: 3.0

comic_beat: "Shockwave shown as cartoon ripple lines travelling across the kitchen"
is_punchline: false

props_in_frame:
  - "kitchen oven (glass door visible)"
  - "five backup timers on counter"
special_effects: "cartoon ripple wave lines through air"

status: "DRAFT"
```

---

*SandyStudio shot.md schema | v0.1 | Status: DRAFT*
