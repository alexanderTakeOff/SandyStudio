---
name: locked-canon-asset-replace
description: >
  Safely replace the IMAGE and/or canon TEXT of an already-LOCKED Bible asset
  (SBL-*) in place, behind a Director approval gate, without breaking the lock,
  the Drive backup, or the browser cache. Use whenever the Director asks to
  "redraw / fix / re-style / re-color / update" an existing LOCKED canon
  character, location, prop, or style — where a new version is NOT wanted and the
  asset id + filename must stay the same.
flavor: process
status: DRAFT
owner: Director
created: 2026-07-23
applies_when:
  agent: [orchestrator, EXEC-CONC, EXEC-ARCH]
---

# Replace a LOCKED canon asset in place

A LOCKED Bible asset must never be edited as bytes-in-the-dark. Replacing its
picture or its canon text is a **gated, verified, five-way-consistent** operation:
DB text ↔ DB image row ↔ Google Drive backup ↔ served media bytes ↔ browser cache.
Miss any one and the studio silently drifts (stale picture in the drawer, a Drive
link pointing at a deleted file, a critic judging against outdated text).

This skill is the invariant sequence. It hardcodes **no** character, style, colour,
or provider — those come from the Bible + Brief + the Director's instruction. The
style anchor is referred to **by role** ("the series' canonical style reference"),
never by a specific character name.

## The gate (never skip, never reorder)

```
locate → (draft text) → generate image → DIRECTOR APPROVAL → write DB → Drive → in-place swap → bump freshness → verify
                                          ▲ nothing is written before this ▲
```

The Director's own rule: **image → approval → database**. Generate and SHOW a
candidate first. No DB/Drive write happens until the Director approves the picture.
Writing canon text is a FILM-content write → requires `===5===` (EDIT MODE).

## Steps

1. **Locate the asset.** Find the LOCKED `SBL-*` row by `file_type`/`filename`
   (id, current `content`, `metadata`, `drive_file_id`, `version`, `status=LOCKED`).
   Read the full current canon text — you are editing it, not replacing blind.

2. **Draft the new canon text (only if the concept changes).** A pure re-style /
   re-color of the same character may need no text change. If the identity, body,
   colours, or movement change, rewrite the affected sections so the text and the
   new picture agree — a critic reads the text, not your intent. Use **exact
   1-match guarded** replacements (fail loudly if a find-string matches 0 or >1
   times) so you never silently drift a section. Fix any dangling references you
   create (e.g. a movement rewrite that leaves a stale sound-cue).

3. **Generate the image, anchored on the canonical style reference.** Follow the
   library-style-first protocol: pass the series' **canonical style/character
   reference image(s)** as the style anchor (multi-ref) and describe the NEW
   subject in the prompt. Do NOT feed the OLD off-style image as a reference if the
   whole point is to leave that style behind. Put negative terms as a single
   advisory line at the END of the prompt (hard MUSTs up front starve the identity
   refs — the attention-pollution finding).

4. **Director approval gate.** Show the candidate (before/after). Iterate on the
   picture until the Director approves. Nothing below runs before approval + `===5===`.

5. **Write the package in ONE pass** via the muscle script
   `webapp/scripts/replace-locked-canon-image.ts` (it does 5–8 atomically-ish):
   - apply the guarded text replacements (if any);
   - `persistBinary` the approved PNG → Google Drive (**abort the whole write if
     the Drive upload fails** — never point a row at a missing file);
   - update the row's `staging_path`/`drive_path`/`drive_file_id`/`drive_web_view_url`
     and the `image_prompt.history` tail;
   - **the v01 row stays LOCKED** — you are replacing bytes under a fixed id +
     filename, NOT cutting a v02.

6. **Bump preview freshness.** The media route serves `Cache-Control: immutable,
   max-age=1y`; the UI cache-busts via `metadata.image_prompt.current_version`
   (`asset-preview-resolver.ts`). An in-place swap that does NOT bump it leaves the
   browser showing the OLD picture even after Ctrl+Shift+R. The muscle script calls
   `bumpPreviewFreshness` for you — this is the step that was forgotten twice by
   hand (`[[canon_inplace_image_swap_bump_freshness]]`).

7. **Verify against runtime, not assumptions.** Refetch the row (new
   `drive_file_id`, bumped `current_version`). If the app is up, fetch
   `/api/media/<filename>` and confirm the served bytes **md5-match** the approved
   candidate. Re-read the changed text sections. Runtime evidence overrides "the
   script printed OK".

## The muscle script

`webapp/scripts/replace-locked-canon-image.ts` is the deterministic, gotcha-proof
half (steps 5–7). It is parameter-driven and reusable for any LOCKED asset:

```
npx tsx scripts/replace-locked-canon-image.ts \
  --id <assetId> \
  --image scripts/_candidate.png \
  [--text-replacements scripts/_replacements.json] \   # [{label,find,replace}], exact-1-match guarded
  [--dry-run]                                           # locate + guard-check, write nothing
```

Image generation stays ad-hoc (the prompt/refs differ per asset) — use the
existing `openAIEditsMultiProvider` (gpt-image-2 multi-ref edits) with the style
anchor. Everything downstream of "Director approved this PNG" goes through the
muscle script so the freshness bump and the Drive-fail abort can never be skipped.

## What this skill deliberately does NOT contain

- No character/prop/location names, no colours, no "2D vs 3D" — those are Bible +
  Brief + the Director's instruction for this task.
- No provider version specifics — the muscle script names the provider; if the
  provider version bumps, update the script, not this process.
- If the new picture and the canon text disagree on an invariant, **HALT and ask
  the Director** — do not silently reconcile.
