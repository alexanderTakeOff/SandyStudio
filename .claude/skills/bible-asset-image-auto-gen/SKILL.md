---
name: Bible Asset Image Auto-Generation
description: Automatically triggers image generation for a Bible asset that has NO image yet, immediately after its text content is set, without a separate Director approval for the enrichBible step. Never fires on an asset that already carries an approved image.
status: ACTIVE
owner: Director
applies_when:
  agent: [EXEC-CONC]
hard: false
created: 2026-07-17
updated: 2026-07-30
---
When a Bible asset (`SBL-*`) is created or its text content is updated via
`setBibleContent`, and its section implies a visual representation (character,
location, object, style), call `enrichBible` on that asset. This does not need a
separate Director approval — it is a direct follow-up to the asset's textual
definition.

## Do NOT fire when the asset already has an image

Check first: if the asset already carries an image (`staging_path` /
`drive_file_id` set), **stop and ask** instead of enriching.

Two reasons, both observed on 2026-07-30:

- **It pays twice and returns a DIFFERENT picture.** `enrichBible` generates a
  new reference image. When the existing one was approved by the Director, the
  replacement is not an improvement — it is the loss of an approved frame plus a
  paid call.
- **It overwrites the text.** `enrichBible` rewrites `content` with what the
  author agent produces, and it seeds that author from the asset's short
  `description`, not from `content`. So verbatim canon the Director dictated
  through `setBibleContent` is discarded, not extended.

For an asset that already has an image and needs a new one, the motion is
`regenerateBibleImage` (omit `prompt` — the route derives it from the entry's
`## RENDER` block), not `enrichBible`.
