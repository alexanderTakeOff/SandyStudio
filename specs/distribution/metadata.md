# SandyStudio — Metadata Spec
## specs/distribution/metadata.md | v0.1 | DRAFT

> Defines the format and rules for episode title, description, and tags.
> Produced by: EXEC-COPY
> Consumed by: EXEC-PUB (YouTube upload), EXEC-THUMB (thumbnail context)

---

## PURPOSE

Every episode needs a title, description, and tags before it can be published.
These are not just administrative — they directly affect YouTube discoverability,
click-through rate (CTR), and algorithmic distribution.
EXEC-COPY writes them; Director approves them.

---

## FILE NAMING

```
SS-[SEASON]-[EPISODE]-SPC-metadata-v[NN]-[STATUS].md
Example: SS-S01-E01-SPC-metadata-v01-DRAFT.md
```

---

## SCHEMA

```yaml
metadata_id: string           # REQUIRED — same as filename without extension
episode_id: string            # REQUIRED
title: string                 # REQUIRED — YouTube video title
                              # Max 100 characters
                              # Must include series name + episode hook
                              # No clickbait — accurate to episode content
                              # Example: "Pink Panther vs. The Perfect Soufflé 🐾"

description: string           # REQUIRED — YouTube video description
                              # Structure defined below (see Description Template)
                              # Max 5000 characters (YouTube limit)
                              # First 2 lines visible before "Show more" — make them count

tags:                         # REQUIRED — 10–15 tags
  - string                    # Mix of: series name, character names, genre, mood, platform tags
                              # Max 500 characters total (YouTube limit)
                              # Example tags: "Pink Panther", "animated comedy",
                              #   "cartoon", "slapstick", "funny animation",
                              #   "SandyStudio", "short film animation"

playlist: string              # REQUIRED — YouTube playlist name to add episode to
                              # Example: "SandyStudio — Pink Panther Series S01"

category: string              # REQUIRED — "Film & Animation" (YouTube category)
language: string              # REQUIRED — "en" (ISO 639-1)

end_screen_elements:          # OPTIONAL — YouTube end screen (last 20 seconds)
  - type: string              # "subscribe" | "video" | "playlist"
    description: string       # what to show

cards:                        # OPTIONAL — YouTube cards (mid-video annotations)
  - timestamp: string         # e.g. "0:45"
    type: string              # "video" | "playlist" | "channel"
    description: string

version: string               # REQUIRED
status: string                # REQUIRED — DRAFT | REVIEW | APPROVED | LOCKED
created_by: string            # REQUIRED — "EXEC-COPY"
date: string                  # REQUIRED — ISO format
approved_by: string           # REQUIRED when APPROVED
```

---

## TITLE FORMULA

```
[Character name] + [vs./and/in] + [The Episode Hook] + [optional emoji]
```

Rules:
- Maximum 60 characters for titles displayed fully in search (hard limit: 100)
- Must not be misleading — must reflect actual episode content
- Series identifier embedded or implied (not always explicit)
- A/B title variants: EXEC-COPY provides 2–3 options; Director chooses

**Examples:**
- "Pink Panther vs. The Perfect Soufflé 🐾"
- "The Pink Panther's Kitchen Catastrophe"
- "Pink Panther: Chef Mode ON 🍳"

---

## DESCRIPTION TEMPLATE

```
[HOOK — 1–2 lines. What happens in this episode. Written as a teaser, not a spoiler.]

[BLANK LINE]

🐾 New episodes every [day]! Subscribe so you don't miss one →

[BLANK LINE]

In this episode: [one sentence episode summary — slightly more detail than hook]

[BLANK LINE]

—

SandyStudio is an AI animation studio producing comedy animated series.
[SERIES NAME] — animated in the spirit of the classic Pink Panther cartoons.

[BLANK LINE]

#PinkPanther #AnimatedComedy #SandyStudio #Cartoon #Shorts
```

---

## TAGS STRATEGY

### Always include (series-level tags):
- Series name variants
- "animated comedy", "cartoon", "animation"
- "SandyStudio"
- Primary character names

### Episode-specific tags:
- Theme of episode (e.g. "cooking", "chef", "kitchen")
- Key prop or location (e.g. "soufflé", "French cooking")
- Tone (e.g. "slapstick", "silent comedy")

### Platform/discovery tags:
- "#Shorts" if a Short
- Season/episode identifiers

---

## QA CHECKLIST (EXEC-SREV or Director reviews)

| Check | Pass criteria |
|-------|--------------|
| Title length | ≤100 characters |
| Title accuracy | Reflects actual episode content |
| Description hook | First 2 lines are compelling and non-spoiler |
| Tags count | 10–15 tags |
| Tags total length | ≤500 characters |
| Hashtags | Present in description (3–5) |
| Subscribe CTA | Present in description |
| No misleading claims | Title and description don't overpromise |

---

## EXAMPLE

```yaml
metadata_id: "SS-S01-E01-SPC-metadata-v01-DRAFT"
episode_id: "S01E01"

title: "Pink Panther vs. The Perfect Soufflé 🐾"

description: |
  Three days of preparation. One perfect soufflé. One very confused inspector.

  🐾 New episodes every Tuesday! Subscribe so you don't miss one →

  In this episode: The Pink Panther's culinary masterpiece is under constant threat
  from Inspector Clouseau, who mistakes the kitchen for a crime scene.

  —

  SandyStudio is an AI animation studio producing comedy animated series.
  Pink Panther — reimagined with AI animation in the spirit of the classic MGM cartoons.

  #PinkPanther #AnimatedComedy #SandyStudio #Cartoon #Slapstick

tags:
  - "Pink Panther"
  - "animated comedy"
  - "cartoon"
  - "slapstick comedy"
  - "animation"
  - "SandyStudio"
  - "AI animation"
  - "Inspector Clouseau"
  - "funny cartoon"
  - "cooking comedy"
  - "soufflé"
  - "silent comedy"
  - "short animation"

playlist: "SandyStudio — Pink Panther Series S01"
category: "Film & Animation"
language: "en"

version: "v01"
status: "DRAFT"
created_by: "EXEC-COPY"
date: "2026-04-24"
```

---

*SandyStudio metadata.md | v0.1 | Status: DRAFT*
