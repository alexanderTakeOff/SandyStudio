# Key Art Designer (EXEC-THUMB) — backlog sprint

**Filed:** 2026-05-15 (during E21 fanout review)
**Director directive:** ban from production runs until proper runner ships

## Current state — known incomplete

UI label «Key Art Designer» = legacy agent code `EXEC-THUMB`
(`lib/api/agent-names.ts:30` renames it; underlying spec is
`agents/exec/thumbnail_creator.md` v0.1 DRAFT).

Runner = `lib/agents/runner.ts:1227` `case 'EXEC-THUMB'`, prompt
composed by `buildThumbnailPrompt()` lines 257-267. It is hardcoded
generic, uses ONLY `episode_code` + `title_working`:

```
`YouTube thumbnail for an animated comedy short titled "${title}" (${code}).`
`Style: stylised 2D-ish animation aesthetic, vibrant colours, dynamic composition,
 a clear focal subject readable at 320×180, comedy/sketch art direction.`
`No text, no watermark, 16:9 framing, high contrast.`
```

Director's observation 2026-05-15: «какая-то просто картинка из ниоткуда
и не понять её целевой смысл если она как заставка для YouTube канала
то я извиняюсь она вообще ни о чём».

Result is just a generic comedy stock-style image with no link to:
- script's strongest visual moment
- approved character canonical fragments
- locked Style Bible anchor
- approved EREF references (already-generated per-shot keyframes)
- episode metadata title / subtitle from Publicist

## What proper runner needs (per spec thumbnail_creator.md)

| Input | Source | Used today |
|---|---|---|
| Approved script | `assets` SCR-script APPROVED | ❌ |
| Character canonical fragments | Bible (LOCKED) | ❌ |
| Style Bible anchor | Bible (LOCKED) | ❌ |
| Episode metadata title | SPC-metadata APPROVED | ❌ |
| EREF approved keyframe (best gag) | IMG-episode_ref* APPROVED | ❌ |
| Composition guidelines | config/defaults.yaml | ❌ |

All these are available in `inputs.upstream_assets` / `inputs.bible`
already — runner just doesn't read them.

## Proposed sprint shape (~1 day)

Three thin layers, no schema migration:

### Layer 1 — pick the visual moment
Read APPROVED storyboard JSON. Find the shot with `shot_role: 'punchline'`
OR the highest `expected_gag` density. If none, fall back to
`acts[0].shots[0]` (opening). Store the chosen `shot_id` + its
`action_prose` in metadata.

### Layer 2 — assemble prompt from real inputs
- Style anchor text from Style Bible's `style_anchor_text` (or
  Bible Style description).
- Character canonical fragment per character in the chosen shot
  (already exists in Bible character description).
- Composition guidelines from config (subject position, text-safe
  zone, contrast rule).
- Visual moment = the chosen shot's `action_prose` paraphrased to a
  single still description.
- Background = condensed location atmosphere.
- Negatives: «text, watermark, blurry, low quality, multiple subjects».

### Layer 3 — use the approved EREF keyframe as anchor image
If EREF for the chosen shot has APPROVED variant, pass it as
`anchor_image_asset_id` to the multi-image gen provider so the
thumbnail INHERITS the look of the actual production frame (not
some generic version). Director gets consistency between thumb and
episode opening.

## Verification
- New thumbnail prompt must reference: title, key beat verb chain,
  named characters, style anchor — none of these appear today.
- Visual smoke: thumbnail must be recognizable as the same series /
  character / location aesthetic, not generic comedy clip art.

## Why this is filed not shipped today
Sprint τ EREF fan-out visibility was the production-critical fix.
Key Art Designer doesn't block production — it ships post-publish
on YouTube. Director's ban keeps it from making garbage until a real
runner is written.

## Linked
- Memo: `~/.claude/projects/C--SandyStudio/memory/key_art_designer_backlog.md`
- Spec (DRAFT): `agents/exec/thumbnail_creator.md`
- Current runner: `lib/agents/runner.ts:1227`
- Prompt builder: `lib/agents/runner.ts:257-267`
