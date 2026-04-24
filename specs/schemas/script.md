# SandyStudio — Script Schema
## specs/schemas/script.md | v0.1 | APPROVED

> Defines the exact format of a screenplay file.
> Produced by: EXEC-SW
> Consumed by: EXEC-SREV (QA), EXEC-SB (storyboard)
> A script must be APPROVED by Director before storyboarding begins.

---

## PURPOSE

The script is the narrative source of truth for one episode.
Everything downstream — storyboard, shots, generation prompts — must trace back to it.
Format is adapted screenplay style optimised for AI storyboarding (not for human actors).

---

## FILE NAMING

```
SS-[SEASON]-[EPISODE]-SCR-[description]-v[NN]-[STATUS].md
Example: SS-S01-E01-SCR-the_souffle_affair-v01-DRAFT.md
```

---

## SCHEMA

```yaml
script_id: string           # REQUIRED — same as filename without extension
brief_id: string            # REQUIRED — links to the approved brief this script fulfils
episode_id: string          # REQUIRED — e.g. "S01E01"
title: string               # REQUIRED — final episode title (may differ from brief working title)
runtime_estimate: string    # REQUIRED — e.g. "4–5 minutes"

acts:                       # REQUIRED — array of acts (typically 3)
  - act_number: integer     # REQUIRED — 1, 2, or 3
    scenes:                 # REQUIRED — array of scenes within this act
      - scene_id: string    # REQUIRED — e.g. "S01E01-A1-SC01" (episode-act-scene)
        location: string    # REQUIRED — must match a location in the World Bible
        time_of_day: string # REQUIRED — MORNING | DAY | AFTERNOON | EVENING | NIGHT
        characters_present: # REQUIRED — list of character_ids
          - string
        action: string      # REQUIRED — prose description of what happens.
                            # Written for a storyboarder, not an actor.
                            # Describes movement, physicality, comic timing.
                            # Minimum 2 sentences. Maximum 1 paragraph.
        dialogue:           # OPTIONAL — only if characters speak
          - character: string     # character_id
            line: string          # spoken line
            direction: string     # OPTIONAL — delivery note e.g. "(whispering)"
        comic_beat: string  # OPTIONAL — if this scene contains a specific gag from brief
        transition: string  # OPTIONAL — CUT TO | FADE TO | SMASH CUT | MATCH CUT
                            # Omit for standard cuts

version: string             # REQUIRED — e.g. "v01"
status: string              # REQUIRED — DRAFT | REVIEW | APPROVED | LOCKED
created_by: string          # REQUIRED — "EXEC-SW"
date: string                # REQUIRED — ISO format
brief_version: string       # REQUIRED — version of brief this script is based on
                            # If brief changes version, script is INVALIDATED
approved_by: string         # REQUIRED when APPROVED
approved_date: string       # REQUIRED when APPROVED
```

---

## RULES

1. Every scene must have at least one character from the approved Character Profiles.
2. Every location must exist in the approved World Bible.
3. Dialogue is minimal by default — this is a visual comedy series. Aim for ≤30% scenes with dialogue.
4. The `action` field drives storyboarding. It must describe what a camera would see, not what a character feels internally.
5. Comic beats from the brief must appear in the script. EXEC-SREV checks this.
6. If the brief is revised (new version), the script is INVALIDATED. EXEC-ARCH flags it.
7. Scripts do not include camera directions — that is the storyboarder's role.
8. Maximum 3 revision cycles before Director decides path forward.

---

## WHAT EXEC-SREV CHECKS (Script QA)

| Check | Pass Criteria |
|-------|--------------|
| Brief compliance | All mandatory comedy beats from brief are present |
| Character consistency | All characters behave per approved profiles |
| World consistency | All locations exist in World Bible |
| Dialogue ratio | No more than 40% of scenes contain dialogue |
| Act structure | Each act ends at the state defined in the brief |
| Runtime alignment | Scene count and action density matches target runtime |
| Visual writability | Every action can be storyboarded (no internal states) |

---

## EXAMPLE (single scene, abbreviated)

```yaml
script_id: "SS-S01-E01-SCR-the_souffle_affair-v01-DRAFT"
brief_id: "SS-S01-E01-SPC-brief-v01-APPROVED"
episode_id: "S01E01"
title: "The Soufflé Affair"
runtime_estimate: "4–5 minutes"

acts:
  - act_number: 1
    scenes:
      - scene_id: "S01E01-A1-SC01"
        location: "Panther's Kitchen"
        time_of_day: "MORNING"
        characters_present:
          - "pink_panther"
        action: "The Pink Panther stands at the kitchen counter, surrounded by
                 precisely arranged ingredients. He cracks an egg with surgical
                 precision, adds it to the bowl, and checks the oven temperature
                 with a thermometer — then double-checks with a second thermometer.
                 He slides the soufflé into the oven and sets a timer, then sits
                 in a chair directly facing the oven, arms folded, ready to wait."
        comic_beat: "He sets five backup timers, lines them up by size."
        transition: "CUT TO"

      - scene_id: "S01E01-A1-SC02"
        location: "Panther's Kitchen"
        time_of_day: "MORNING"
        characters_present:
          - "pink_panther"
          - "inspector_clouseau"
        action: "The door explodes open. Inspector Clouseau enters dramatically,
                 badge extended, scanning the room with exaggerated suspicion.
                 The Pink Panther watches in horror as the vibration from the door
                 sends a ripple through the oven window — the soufflé begins to sink."
        dialogue:
          - character: "inspector_clouseau"
            line: "Do not move! I am looking for a jewel thief."
            direction: "(loud, wrong apartment)"
        comic_beat: "Clouseau holds up a photo of a cat. Wrong address, wrong everything."

version: "v01"
status: "DRAFT"
created_by: "EXEC-SW"
date: "2026-04-23"
brief_version: "v01"
```

---

*SandyStudio script.md schema | v0.1 | Status: DRAFT*
