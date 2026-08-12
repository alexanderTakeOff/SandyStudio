# SandyStudio — Brief Schema
## specs/schemas/brief.md | v0.2 | APPROVED

> Defines the exact format of a creative episode brief.
> Produced by: ART-HW
> Consumed by: EXEC-SW (screenwriter)
> A brief must be APPROVED by Director before EXEC-SW may begin writing.

---

## PURPOSE

The brief is the creative contract between the Head Writer and the Screenwriter.
It defines what an episode must contain, without prescribing how to write it.
Every mandatory field must be filled. No optional field may contradict a mandatory one.

---

## FILE NAMING

```
SS-[SEASON]-[EPISODE]-SPC-brief-v[NN]-[STATUS].md
Example: SS-S01-E01-SPC-brief-v01-DRAFT.md
```

---

## SCHEMA

```yaml
brief_id: string            # REQUIRED — same as filename without extension
episode_id: string          # REQUIRED — e.g. "S01E01"
series: string              # REQUIRED — e.g. "SandyStudio Pink Panther"
season: string              # REQUIRED — e.g. "S01"
episode_number: string      # REQUIRED — e.g. "E01" or "PILOT"
title_working: string       # REQUIRED — working title, may change

logline: string             # REQUIRED — one sentence: who wants what, what stops them
                            # Max 25 words. Must name the lead character.
                            # Example: "The Pink Panther attempts to cook a soufflé
                            #           while Inspector Clouseau mistakes the kitchen
                            #           for a crime scene."

premise: string             # REQUIRED — 2–4 sentences expanding the logline.
                            # Describes the core comic situation and emotional arc.

act_structure:              # REQUIRED — three-act breakdown
  act_1:
    summary: string         # REQUIRED — one sentence: setup and inciting incident
    end_state: string       # REQUIRED — where characters are at end of Act 1
  act_2:
    summary: string         # REQUIRED — one sentence: escalation and complication
    end_state: string       # REQUIRED — lowest point / maximum chaos
  act_3:
    summary: string         # REQUIRED — one sentence: resolution
    end_state: string       # REQUIRED — final state of characters

characters:                 # REQUIRED — list of character_ids from approved profiles
  - character_id: string
    role_in_episode: string # REQUIRED — one sentence on their role this episode

locations:                  # REQUIRED — list of locations from World Bible
  - location_name: string
    scenes_set_here: string # OPTIONAL — rough description of which scenes

comedy_beats:               # REQUIRED — ОДИН НА КАДР, а не «3–8 на эпизод».
                            # 2026-08-06 (решение Директора): старая вилка 3–8
                            # разрешала четыре длинных кадра на 30-секундный
                            # ролик. Единица измерения — КАДР: 30 с → ~10 кадров
                            # → ≥10 РАЗЛИЧНЫХ битов; 45 с → 10–20 кадров.
                            # Числа выводит `resolveGagPlan()` из хронометража
                            # эпизода и отдаёт одной строкой И Сценаристу, И
                            # Раскадровщику; Директор переопределяет через
                            # `episode.metadata.gag_plan`.
  - beat: string            # One sentence describing a specific comic moment to hit
                            # Example: "Panther attempts to hide soufflé under hat
                            #           as Clouseau enters — hat slowly rises"
                            # «Различный» — ключевое слово: тот же бит в новом
                            # костюме не считается вторым.

tone_notes: string          # OPTIONAL — specific tone guidance for this episode
                            # e.g. "More melancholy than usual, Buster Keaton influence"

music_mood: string          # OPTIONAL — overall music direction for ART-MS
                            # e.g. "Light jazz, playful, 1960s caper feel"

runtime_target: string      # REQUIRED — target episode length e.g. "3–5 minutes"

constraints:                # OPTIONAL — things EXEC-SW must avoid in this episode
  - constraint: string

references:                 # OPTIONAL — reference episodes, films, or moments
  - reference: string

version: string             # REQUIRED — e.g. "v01"
status: string              # REQUIRED — DRAFT | REVIEW | APPROVED | LOCKED
created_by: string          # REQUIRED — agent ID e.g. "ART-HW"
date: string                # REQUIRED — ISO format e.g. "2026-04-23"
approved_by: string         # REQUIRED when APPROVED — "Director/CEO" or "AI-EP"
approved_date: string       # REQUIRED when APPROVED — ISO format
```

---

## RULES

1. `logline` must name the lead character and the core obstacle. Max 25 words.
2. `act_structure` must cover all three acts. Each `end_state` must be meaningfully different from the previous.
3. `characters` must reference only character IDs that exist in `bibles/characters/` with APPROVED status.
4. `locations` must reference only locations defined in the APPROVED World Bible.
5. `comedy_beats` must include at least one physical comedy beat and one character-driven beat.
6. A brief with status DRAFT or REVIEW cannot be used by EXEC-SW to begin writing.
7. If Director revises a brief after a script has begun, the script is INVALIDATED — see `specs/protocols/version_cascade.md`.

---

## EXAMPLE (abbreviated)

```yaml
brief_id: "SS-S01-E01-SPC-brief-v01-DRAFT"
episode_id: "S01E01"
series: "SandyStudio Pink Panther"
season: "S01"
episode_number: "E01"
title_working: "The Soufflé Affair"

logline: "The Pink Panther's perfect soufflé is repeatedly destroyed
          by Inspector Clouseau's incompetent investigation of a non-existent crime."

premise: "The Pink Panther has spent three days perfecting a soufflé recipe.
          On the day of his triumph, Inspector Clouseau bursts in convinced a jewel
          thief is hiding in the kitchen. Each attempt Clouseau makes to 'investigate'
          collapses the soufflé. The Panther must choose between his masterpiece
          and keeping the peace."

act_structure:
  act_1:
    summary: "Panther completes soufflé; Clouseau arrives with wrong address"
    end_state: "Soufflé #1 destroyed. Panther decides to make another."
  act_2:
    summary: "Three more soufflés destroyed by escalating Clouseau incompetence"
    end_state: "Kitchen destroyed. Panther has one egg left."
  act_3:
    summary: "Final soufflé succeeds — by accident, because of Clouseau"
    end_state: "Clouseau takes credit. Panther shrugs. They share it."

characters:
  - character_id: "pink_panther"
    role_in_episode: "Protagonist — obsessive chef undone by external chaos"
  - character_id: "inspector_clouseau"
    role_in_episode: "Antagonist by incompetence — means well, destroys everything"

locations:
  - location_name: "Panther's Kitchen"
    scenes_set_here: "All scenes"

comedy_beats:
  - beat: "Panther tiptoes past sleeping Clouseau — floorboard creaks, soufflé collapses"
  - beat: "Clouseau's magnifying glass creates heat spot that browns soufflé unevenly"
  - beat: "Final soufflé rises perfectly the moment Clouseau's sneeze blows it onto plate"

runtime_target: "4–5 minutes"
version: "v01"
status: "DRAFT"
created_by: "ART-HW"
date: "2026-04-23"
```

---

*SandyStudio brief.md schema | v0.2 | Status: APPROVED*
*Changes: approved_by field — "Sandy" → "Director/CEO" or "AI-EP"*
