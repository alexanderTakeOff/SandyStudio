# SandyStudio — Generation Prompt Schema
## specs/schemas/prompt.md | v0.2 | APPROVED

> Defines the exact format of an AI generation prompt file.
> Produced by: EXEC-VGEN (video/image), EXEC-MGEN (music), EXEC-THUMB (thumbnails)
> Consumed by: External APIs (Veo3, Kling, Midjourney, Suno, Udio)
> Prompt files are stored in prompts/ and versioned like all other assets.

---

## PURPOSE

A prompt file is the written instruction sent to an AI generation API.
It is stored as a file (not just an API call) for three reasons:
1. **Auditability** — every generated asset traces back to its exact prompt
2. **Reproducibility** — a prompt file can be re-run to regenerate an asset
3. **Learning** — successful prompts are archived as the studio's prompt library

Every generated asset (`raw/video/`, `raw/images/`, `raw/audio/`) must have
a corresponding prompt file in `prompts/`.

---

## FILE NAMING

```
SS-[SEASON]-[EPISODE]-PRO-[type]_[subject_id]-v[NN]-[STATUS].md
Examples:
  SS-S01-E01-PRO-video_S01E01-A1-SC02-SH03-v01-DRAFT.md
  SS-S01-E01-PRO-music_scene_act2-v01-DRAFT.md
  SS-S01-E01-PRO-image_thumbnail-v01-DRAFT.md
```

---

## SCHEMA

```yaml
prompt_id: string             # REQUIRED — same as filename without extension
prompt_type: string           # REQUIRED — VIDEO | IMAGE | MUSIC

target_contract: string       # REQUIRED — the generation contract to call.
                              # Resolved to actual provider via config/providers.yaml.
                              # Never hardcode a model name here.
                              # VIDEO:  "video_generation" | "character_video_generation"
                              # IMAGE:  "image_generation"
                              # MUSIC:  "music_generation" | "sfx_generation"
                              # See specs/system/api_integrations.md for contract definitions.

# --- SOURCE REFERENCE ---
# Links this prompt back to the asset it is generating.
shot_id: string               # REQUIRED for VIDEO/IMAGE — links to approved shot schema
music_brief_section: string   # REQUIRED for MUSIC — which section of music brief
thumbnail_for: string         # REQUIRED for IMAGE thumbnails — episode_id

source_version: string        # REQUIRED — version of source document (shot/brief)
                              # If source changes version, prompt is INVALIDATED

# --- THE PROMPT ---
prompt_text: string           # REQUIRED — the full prompt sent to the API
                              # For VIDEO/IMAGE: includes canonical_prompt_fragment
                              #   for every character in frame
                              # For MUSIC: mood, instrumentation, duration, reference

negative_prompt: string       # OPTIONAL — what to avoid (supported by some APIs)
                              # Example: "text, watermarks, realistic photography,
                              #           live action, 3D render"

# --- CHARACTER FRAGMENTS INJECTED ---
# Documents which canonical_prompt_fragments were used and from which profile version.
# Critical for consistency tracking and debugging.

character_fragments:          # REQUIRED for VIDEO/IMAGE if characters present
  - character_id: string      # character_id from approved profile
    profile_version: string   # which version of profile the fragment came from
    fragment_used: string     # the exact fragment text that was injected

# --- API PARAMETERS ---
parameters:
  duration_seconds: number    # REQUIRED for VIDEO/MUSIC — must match shot duration
  aspect_ratio: string        # REQUIRED for VIDEO/IMAGE — e.g. "16:9" | "9:16" | "1:1"
  resolution: string          # REQUIRED for VIDEO/IMAGE — from specs/system/media_formats.md
  seed: integer               # OPTIONAL — fixed seed for reproducibility
                              # Always record seed of successful generations
  additional_params: object   # OPTIONAL — contract-specific parameters (see api_integrations.md)
                              # Do NOT include model name — resolved by providers.yaml at runtime

# --- RESULT ---
generation_attempts:          # OPTIONAL — log of each generation attempt
  - attempt_number: integer
    timestamp: string
    result_file: string       # path to generated file
    qa_result: string         # PASS | FAIL | PENDING
    qa_report_id: string      # links to QA report

final_result_file: string     # OPTIONAL — path to the accepted generated file
                              # Populated after QA PASS

# --- METADATA ---
version: string               # REQUIRED
status: string                # REQUIRED — DRAFT | REVIEW | APPROVED | INVALIDATED
created_by: string            # REQUIRED — agent_id e.g. "EXEC-VGEN"
date: string                  # REQUIRED — ISO format
```

---

## PROMPT CONSTRUCTION RULES

### For VIDEO and IMAGE prompts

Prompt text must be constructed in this order:
```
1. Style anchor        — from Style Bible (e.g. "1960s animated cartoon style, MGM aesthetic")
2. Shot description    — from shot.action field
3. Camera direction    — from shot.camera_angle + shot.camera_movement
4. Character fragment  — canonical_prompt_fragment for each character in frame
5. Location            — from World Bible location description (condensed)
6. Lighting            — from shot.lighting_condition
7. Mood                — from shot.mood
8. Special effects     — from shot.special_effects (if any)
```

**Do not** include character descriptions written from scratch. Always use
`canonical_prompt_fragment`. If the fragment is insufficient, update the profile —
do not patch the prompt.

### For MUSIC prompts

Prompt text must include:
```
1. Duration in seconds  — must match scene timing from storyboard
2. Mood descriptor      — from music brief
3. Instrumentation      — from music brief
4. Tempo                — from music brief
5. Reference feel       — from Style Bible audio aesthetic
6. Structural notes     — e.g. "builds to peak at 0:45, resolves quietly"
```

### Negative prompts (where supported)

Standard negative prompt for all video/image generations:
```
"realistic photography, live action footage, 3D CGI render, human actors,
 text overlays, watermarks, blurry, low quality, inconsistent art style"
```

Add shot-specific negatives if needed.

---

## EXAMPLE — VIDEO PROMPT

```yaml
prompt_id: "SS-S01-E01-PRO-video_S01E01-A1-SC02-SH02-v01-DRAFT"
prompt_type: "VIDEO"
target_contract: "video_generation"
shot_id: "S01E01-A1-SC02-SH02"
source_version: "v01"

prompt_text: |
  1960s animated cartoon style, MGM Pink Panther aesthetic, clean lines,
  flat colour with soft shading.
  Medium shot, static camera.
  Pink Panther stands frozen, staring at the oven door in wide-eyed dread
  as cartoon ripple wave lines travel through the kitchen air toward the oven.
  Warm morning light from window left, soft yellow-cream tones, soft shadows.
  Mood: slow-motion comic dread, anticipation of disaster.
  Cartoon ripple lines effect in foreground.
  tall slender anthropomorphic pink panther, dusty rose pink fur, charcoal outline,
  heavy-lidded cool expression, walks upright, languid graceful movement,
  1960s animated cartoon style, clean lines, flat colour with soft shading,
  expressive tail.
  Kitchen setting: warm domestic interior, 1960s style appliances,
  large chrome oven with glass door centre frame, white tile floor.

negative_prompt: "realistic photography, live action, 3D render, text, watermarks,
                  blurry, inconsistent art style, modern appliances"

character_fragments:
  - character_id: "pink_panther"
    profile_version: "v01"
    fragment_used: "tall slender anthropomorphic pink panther, dusty rose pink fur,
                    charcoal outline, heavy-lidded cool expression, walks upright,
                    languid graceful movement, 1960s animated cartoon style,
                    clean lines, flat colour with soft shading, expressive tail"

parameters:
  duration_seconds: 3.0
  aspect_ratio: "16:9"
  resolution: "1920x1080"
  # model resolved at runtime via config/providers.yaml → video_generation contract

version: "v01"
status: "DRAFT"
created_by: "EXEC-VGEN"
date: "2026-04-23"
```

---

*SandyStudio prompt.md schema | v0.1 | Status: DRAFT*
