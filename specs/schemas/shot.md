# SandyStudio — Shot Schema
## specs/schemas/shot.md | v0.1 | APPROVED

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

timing: string              # REQUIRED — start and end timecode within the episode
                            # Format: mm.ss-mm.ss  (minutes.seconds – minutes.seconds)
                            # Example: "00.08-00.15" = starts at 0:08, ends at 0:15
                            # All shots must be contiguous: shot N end = shot N+1 start
                            # Episode total must equal brief target_runtime_seconds
                            # Used by: EXEC-SB (planning), EXEC-MGEN (music sync),
                            #          assembly tool (cut points)

duration_seconds: number    # DERIVED — calculated from timing (end - start). Do not set manually.
                            # Formula: parse mm.ss end − parse mm.ss start
                            # Kept for backwards compatibility with generation APIs

# --- COMEDY ---
comic_beat: string          # OPTIONAL — if this shot is a gag or punchline, describe it
                            # e.g. "Soufflé collapses in perfect sync with Clouseau's sneeze"
is_punchline: boolean       # OPTIONAL — true if this is the payoff of a comedy sequence

# --- DELIVERY / FRAMING ---
vertical_safe: boolean      # OPTIONAL — set only on gag/punchline peaks in episodes whose
                            # delivery_targets include a 9:16 Shorts surface. true = the peak
                            # frame reads inside the central vertical-safe column (the 9:16
                            # center-crop, ~31.6% of width). See skill
                            # storyboarder-situational-comedy §"Vertical-safe framing".
landscape_only: boolean     # OPTIONAL — true on a peak whose gag is inherently lateral and
                            # cannot be restaged vertically. Declares "won't yield a Short".

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
2. `timing` is mandatory — every shot must have an explicit `mm.ss-mm.ss` timecode. `duration_seconds` is derived from timing and must not be set manually. Shot timecodes must be contiguous (no gaps, no overlaps). Episode sum must equal `target_runtime_seconds` from the brief (±2 seconds tolerance).
3. `characters_present` must use exact character IDs from approved Character Profiles. EXEC-WCHK cross-references this against the World Checker's appearance rules.
4. `location` must exactly match a location name in the approved World Bible. No improvised locations.
5. `lighting_condition` must derive from the World Bible's lighting rules for that location.
6. If `script_version` of any shot differs from the current approved script version, shot status becomes INVALIDATED automatically (see `specs/protocols/version_cascade.md`).
7. EXEC-VGEN may not generate a shot with status INVALIDATED or DRAFT.
8. A shot with `is_punchline: true` should be generated last for its scene, after surrounding shots are QA-approved, to confirm the build-up is correct.
9. `vertical_safe` / `landscape_only` are set ONLY on gag/punchline peaks and ONLY when the episode's `delivery_targets` include a 9:16 Shorts surface. On landscape-only episodes both stay unset. A gag/punchline peak in a short-target episode must carry exactly one of the two (authored by EXEC-SB, verified by EXEC-CREAD). See skill `storyboarder-situational-comedy` §"Vertical-safe framing for Shorts delivery".

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

location: "club_exterior_entrance"
time_of_day: "NIGHT"
lighting_condition: "harsh white spotlight cone from above, deep cobalt shadows, brass gleam on surfaces"

characters_present:
  - "sandy"
  - "inspector_stopwatch"

action: "Sandy floats toward the velvet rope, sand fully in upper bulb, chest out.
         Inspector-Stopwatch swivels on his telescopic shaft to face her, arrow-brow at 9 o'clock."

dialogue: ""

timing: "00.08-00.15"
duration_seconds: 7.0

mood: "smug confidence meets cold authority"

comic_beat: ""
is_punchline: false

# vertical_safe / landscape_only omitted — this is a landscape-only (non-Shorts) episode

props_in_frame:
  - "velvet rope"
  - "red carpet"
special_effects: "subtle bounce springs under Sandy's step — sand weight visible as slight sway"

status: "DRAFT"
```

---

*SandyStudio shot.md schema | v0.1 | Status: DRAFT*
