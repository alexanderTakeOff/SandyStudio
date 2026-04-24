# SS-S01 — World Bible
## SS-S01-BIB-world_model-v01-DRAFT.md
## Agent: ART-WB | v0.1 | DRAFT

---

## Universe Rules

```yaml
world_id:         SS-S01-world
series_id:        SS-S01
version:          v01

physics:
  - "Living objects operate under exaggerated cartoon physics — squash, stretch, and
     bounce are real physical forces, not stylistic choices."
  - "Mass and gravity are the dominant forces. Heavy objects fall. Heavy things tire.
     A character filled with dense material at the top will topple forward."
  - "Rigid objects (metal, brass, clockwork) follow strict real-world physics.
     No bending. Only right-angle folds at defined joints."
  - "Silicone and elastic materials stretch without tearing — but release when released."
  - "Sand obeys gravity at all times, without exception. This is the world's core law."
  - "Emotions are not internal states. They are physical states. No character
     'feels' anything — they ARE their physical configuration."

tone_of_reality:  "heightened — cartoon logic applied rigorously and consistently"
time_period:      "contemporary but timeless — no specific decade, no phones visible"
technology_level: "mechanical and analogue only — no screens, no digital displays,
                   no smartphones. Inspector's clockface is the most advanced technology shown."
```

---

## Locations

```yaml
locations:

  - location_id:       club_exterior_entrance
    name:              "The Club — Exterior Entrance"
    description: >
      A wide red carpet leads to heavy brass-framed double doors.
      A single hard spotlight cone descends from directly overhead, illuminating a
      two-metre circle of deep red carpet in front of the velvet rope.
      Beyond the spotlight: deep cobalt darkness. The crowd outside exists only as
      silhouettes and murmur — never individualised.
      A brass pedestal stands left of the rope: Inspector's station.
    lighting_default:  "single overhead hard spotlight (white-hot centre, warm amber edge),
                        deep cobalt fill in all shadows, brass surfaces catch specular highlights"
    objects_present:
      - "red carpet (runs from frame left to the double doors)"
      - "velvet rope (dark burgundy, on brass stanchions)"
      - "brass double doors (closed — entry beyond)"
      - "inspector's pedestal station (left of rope)"
      - "spotlight cone (implied source overhead, not visible)"
    objects_forbidden:
      - "windows"
      - "natural light"
      - "visible crowd faces (silhouettes only)"
      - "phones or digital devices"
      - "signage or text"
    established_in:    "series_bible"

  - location_id:       club_interior
    name:              "The Club — Interior"
    description: >
      Same palette as the exterior but enclosed. A polished dark floor reflects the
      overhead spotlights. Tables and crowd shapes exist only in peripheral darkness —
      never detailed. The centre of the floor is a second spotlight circle where
      Sandy performs her inverted walk. The crowd is ambient presence only:
      geometric silhouettes, murmur, occasional implied reaction.
    lighting_default:  "multiple overhead spotlights creating pools of white light on
                        dark polished floor, deep cobalt fills between pools,
                        crowd exists only in peripheral shadow"
    objects_present:
      - "polished dark floor (reflective — shows Sandy's inverted reflection)"
      - "abstract table shapes in darkness (silhouette only)"
      - "crowd silhouettes (background, never individualised)"
    objects_forbidden:
      - "windows or natural light"
      - "identifiable crowd faces"
      - "bar or drink props (not relevant to this episode's action)"
      - "signage or text"
    established_in:    "SS-S01-E01"
```

---

## Objects

```yaml
objects:

  - object_id:       velvet_rope
    name:            "Velvet Rope"
    appearance:      "thick dark burgundy rope, brass clip at centre, mounted on two
                      brass stanchions approximately waist height to Sandy"
    behaviour_rules: "static — it does not move. Inspector controls access, not the rope."
    canonical_owner: "club_exterior_entrance"

  - object_id:       inspectors_pedestal
    name:            "Inspector's Pedestal Station"
    appearance:      "a short brass cylinder, slightly tarnished, at Inspector's
                      operational height. His telescopic shaft connects to it when stationary."
    behaviour_rules: "Inspector detaches and glides on his shaft when active. Returns
                      to pedestal when idle."
    canonical_owner: "club_exterior_entrance"

  - object_id:       trash_smear
    name:            "Black Sticky Debris"
    appearance:      "irregular blob of viscous black material with slight iridescent
                      sheen — cartoon tar consistency, not photorealistic"
    behaviour_rules: "sticks immediately on contact. Does not drip or spread once adhered.
                      Visible from any angle — it does not hide."
    canonical_owner: null   # environmental — not owned by location or character
```

---

## Established Facts

```yaml
facts:

  - fact_id:       admission_by_appearance
    statement:     "Entry to the club is granted or denied solely by Inspector-Stopwatch's
                   visual scan. No other criteria exist."
    established_in: "series_bible"

  - fact_id:       inspector_incorruptible
    statement:     "Inspector-Stopwatch cannot be bribed, argued with, or charmed.
                   He responds only to what his scan reads."
    established_in: "series_bible"

  - fact_id:       sand_position_determines_status
    statement:     "Sandy's social confidence and physical capability are directly
                   determined by where her sand is. Sand high = capable and proud.
                   Sand low = heavy, slow, and diminished."
    established_in: "series_bible"

  - fact_id:       gravity_always_wins
    statement:     "No matter what position Sandy holds, gravity will eventually
                   redistribute her sand downward. This is the world's only unbeatable rule."
    established_in: "series_bible"

  - fact_id:       world_is_silent
    statement:     "No character speaks. Communication is through physical action,
                   sound design, and mechanical indicators only."
    established_in: "series_bible"
```

---

## Forbidden Elements

```yaml
forbidden:
  - "any character speaking or mouthing words"
  - "text, signs, labels, or readable graphics of any kind"
  - "natural outdoor environments (series is interior/threshold only)"
  - "smartphones, screens, or digital technology"
  - "realistic human characters (crowd is silhouettes only)"
  - "natural lighting (sunlight, moonlight — spotlight only)"
  - "bright green or pastel colours (palette violation)"
```

---

## Change Log

```
v01 — Initial World Bible. Two locations: club_exterior_entrance + club_interior.
      Three objects: velvet_rope, inspectors_pedestal, trash_smear.
      Five canonical facts established. Forbidden elements locked.
      Established in: series_bible + SS-S01-E01.
```

---

*SS-S01-BIB-world_model-v01-DRAFT.md | ART-WB output | Pending Director approval*
