# Rule — Canon Versioning Policy

> **Status:** v0.1 · 2026-05-01
> **Scope:** Series Bible canonical assets (`SBL-*` file_types) and the Episode references they anchor.
> **Why this is a Rule, not a Glossary entry:** the glossary defines terms; this document defines **policy** — what Director and agents must DO when an asset changes.

## Versioning policy

| Change | Outcome | File system | Status |
|---|---|---|---|
| **Costume change in a single episode** (e.g. Sandy wears a hat in S03E04) | Episode-level reference. Bible canon unchanged. | New `IMG-episode_ref` per shot/pose | DRAFT → APPROVED in episode |
| **Permanent appearance change** (e.g. Sandy's bow tie becomes new canon from S04 forward) | New canonical version. | New Bible asset version (`v02`); v01 stays LOCKED for back-compat | v02 DRAFT → LOCKED |
| **Error or regression** in a draft Bible asset (typo, bad image generation) | Revision of current version. | Edit the same DRAFT/REVIEW asset content | DRAFT → REVIEW → DRAFT (or APPROVED) |
| **Want to try a different look** without losing canon | Fork as new version. | New Bible asset `v(N+1)` from the LOCKED v(N) | v(N+1) DRAFT |
| **Series Bible already LOCKED but episode has a new prop** | Episode-only object reference. Not promoted to Bible. | New `IMG-episode_ref` for that prop | episode-level only |

## LOCKED rules

1. A LOCKED asset is **immutable**. Editing is forbidden. The `/api/assets/[id]/content` PUT route refuses LOCKED.
2. Only the Director may LOCK or unlock-fork an asset (Category B → with Director sign).
3. Unlock-fork creates a new version (`v(N+1) DRAFT`); the LOCKED original stays in place.
4. Deletion of a LOCKED asset is forbidden. Hide-from-UI is allowed via a `hidden` flag (post-MVP).

## Cross-reference invariants

1. Every Episode reference (`IMG-episode_ref`) MUST trace to at least one LOCKED Bible asset id, recorded in its `metadata.bible_ref_ids[]`.
2. Episode references that anchor on `v01 DRAFT` are themselves DRAFT only — they cannot be APPROVED until their Bible anchor is LOCKED.
3. If a Bible asset is forked to `v02 LOCKED`, all existing Episode references that anchored on `v01 LOCKED` remain valid (back-compat). New episode references must use `v02` unless Director explicitly opts back to `v01`.

## Continuity Check enforcement

The `EXEC-CONT` validator (Step 6 of the contract pipeline rollout) reads APPROVED storyboard JSON and validates:
- Every `location` value is one of LOCKED `SBL-location_*` for the parent series.
- Every `characters_present[]` entry maps to LOCKED `SBL-character_*` (by name match).
- Unknown locations / characters → REVISE verdict with per-shot violation list.

If Director wants to introduce a new character or location that does not exist in the Bible:
- They must **either** add it to the Series Bible first (extends canon), **or** explicitly mark it as episode-only via the storyboard's `episode_only_assets[]` array.
- The latter creates a parallel approval gate: Director must approve "create episode-only asset" before storyboard can advance.

## When this policy changes

This rule is part of the studio constitution. Changes go through the same Director-approval workflow as `CLAUDE.md` updates. Bump `v0.1` → `v0.2` and record the rationale at the bottom.

## Change log

- **v0.1** · 2026-05-01 · Initial policy. Extracted from glossary §9 ("Versioning policy") because policy and definitions belong in separate documents.
