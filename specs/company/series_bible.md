# Series Bible — Specification

> **Status:** v0.1 DRAFT · 2026-05-01
> **Scope:** Series-level canonical artefacts that bind every episode in the series.
> **Replaces / formalises:** the previously-implicit "world bible / character profile / style guide" concept used by EXEC-* agent prompts.

## What a Series Bible is

A Series Bible is the **single source of truth for the canon of a series**. Episode pipeline cannot produce visuals (Episode references onward) until the parent series has at least a minimum LOCKED Bible.

Bible content is split between **descriptive text** (the General idea) and a **visual + audio Library** (Heroes, Locations, Objects, Style, Audio) — every Library entry has both a text description AND media (image, audio sample, video clip).

A **text-only Bible is incomplete.** Final Bible = description + media for every asset.

## Structure

```
Series Bible
│
├── General idea  (one markdown document — premise, philosophy, world rules, tone)
│
└── Library  (visual + audio canon, per-section feeds)
    ├── Heroes        — characters that recur across episodes
    ├── Locations     — places that recur
    ├── Objects       — props that recur (e.g. Sandy's hourglass)
    ├── Style         — art direction sample frames + style notes
    └── Audio         — theme music, leitmotifs, ambient palette
```

### Section asset types

| Section | file_type prefix | What's stored |
|---|---|---|
| General idea | `SBL-general_idea` | one markdown doc per series, content in `assets.content` |
| Heroes | `SBL-character_*` | LoRes thumbnail + HiRes ref image; description in `assets.content` |
| Locations | `SBL-location_*` | LoRes + HiRes ref image; description |
| Objects | `SBL-object_*` | LoRes + HiRes ref image; description |
| Style | `SBL-style_*` | one ref frame per style entry; description |
| Audio | `SBL-audio_*` | audio sample (MP3/WAV) + description |

The `*` is a free slug describing the entry, e.g. `SBL-character_sandy`, `SBL-location_cafe`, `SBL-object_hourglass`.

## Lifecycle of a Bible asset

```
DRAFT (new, unedited)
  ↓ Director edits text or regenerates media
REVIEW (Director ready to lock)
  ↓ Director clicks Lock
LOCKED (immutable — episode pipeline can anchor on it)
```

A LOCKED asset can only become "active again" via **fork** — Director creates a new version (`v(N+1)`) which starts as DRAFT. The LOCKED v(N) stays in place for episodes that already reference it.

See [`specs/rules/canon_versioning.md`](../rules/canon_versioning.md) for the policy details.

## Episode pipeline gate

`EXEC-EREF` (Episode Reference Generator) precondition (enforced by `webapp/lib/agents/gate.ts`):

> The parent series MUST have at least:
> - 1 LOCKED `SBL-character_*` and
> - 1 LOCKED `SBL-style_*`
>
> ELSE: gate fails with reason "Series Bible canon not provisioned — add and LOCK at least one character and style entry in the series Bible."

This is the minimum. Real productions extend with locations, objects, audio, etc. Director can manually relax the gate per episode (post-MVP feature) but the default protects canon.

## Cross-references

When `EXEC-EREF` produces an episode reference image, it records the Bible asset ids it anchored on:

```
metadata.bible_ref_ids: ["<sbl-character-uuid>", "<sbl-location-uuid>", ...]
```

The Bible UI's hero card kebab "Used in [episode_code]" list is built from this field — search `IMG-episode_ref` rows where `bible_ref_ids` contains the hero's id, group by parent episode.

## API surface (Step 4 implementation)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/series/[id]/bible` | GET | List all Bible assets for the series, grouped by section |
| `/api/series/[id]/bible` | POST | Create a new Bible section asset (DRAFT) |
| `/api/series/[id]/bible/[assetId]` | GET | Single asset fetch (delegates to existing `/api/assets/[assetId]`) |
| `/api/series/[id]/bible/[assetId]/lock` | POST | Director-only LOCK transition |
| `/api/series/[id]/bible/generate-image` | POST | Director-triggered gpt-image-1 generation; returns staging URL for preview, Director then POSTs the bible-create endpoint to persist |

## UI contract

Hierarchy: `Sidebar > Series > [series name] > Bible`.

Tabs: **General idea** | **Library**.

- General idea — one large markdown editor (CodeMirror), text only. Save button persists into `SBL-general_idea` content.
- Library — vertical-stacked feeds: Heroes, Locations, Objects, Style, Audio. Each feed is a labelled section with an "Add" button and a grid of cards.

### Card kebab menu

For each section card:
- **Edit description** — opens the right-side detail drawer (text + media)
- **Replace media** — regenerate the image via gpt-image-1 (paid)
- **Lock / Unlock-fork** — Director-only state transitions
- **Used in** — list of episodes that reference this canonical asset (clickable cross-links)
- **Delete** — only valid for v01 DRAFT entries that no episode references

### Add Hero / Location / Object modal

1. **Name** — combobox: dropdown of existing canonical characters/locations/objects across **all series** the Director has access to (cross-series suggestion list) + free text input for new entries. Selecting an existing one pre-fills description and pre-loads media (Director can keep, replace, or fork).
2. **Description** — markdown textarea. Has a companion `[ ✨ Concierge fill ]` button (muted in Step 4 — placeholder; will be wired in a later Concierge slice).
3. **Generate ref image** — calls gpt-image-1 with description + Style guide context. Live cost display (~$0.04). Staged on Drive.
4. **Save as DRAFT** — persists the asset; card appears in the feed.

## Pre-pilot Sandy bootstrap

`webapp/scripts/seed-sandy-bible.ts` creates a minimum Bible for the Sandy series so episode pipelines can pass the EREF gate without manual UI work:

- `SBL-general_idea` v01 DRAFT — Sandy series premise (silicone hourglass character, 2D flat world, visual comedy, VISUAL DETERMINISM principle)
- `SBL-style_visual` v01 DRAFT — "Flat 2D bold black outlines, soft pastel gradients"
- `SBL-character_sandy` v01 DRAFT — generated via gpt-image-1
- `SBL-location_cafe` v01 DRAFT — generated via gpt-image-1

Director then opens the UI and LOCKs each one. Total cost ~$0.10.

## Out of scope (Step 4)

- Multi-angle turnaround sheets per character
- Audio media generation (text-only Audio section in Step 4)
- Fork/diff UI between Bible versions
- Multi-language Bible
- Bulk import / export of Bible

## Change log

- **v0.1** · 2026-05-01 · Initial spec. Step 4 of the contract pipeline rollout.
