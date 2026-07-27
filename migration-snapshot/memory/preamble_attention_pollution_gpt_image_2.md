---
name: preamble-attention-pollution-gpt-image-2
description: Hard «MUST / Do not» directives in multi-image-edit preamble starve identity refs in gpt-image-2 — characters with unconventional shapes fall back to nearest trained archetype. Use advisory phrasing + explicit identity-preservation counter-directive.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b41f1ebd-4fef-4c43-9f47-a6201dcdffb8
---

# gpt-image-2 multi-image-edit preamble attention pollution

**Rule:** When writing a prompt preamble that prepends every gpt-image-2
`/v1/images/edits` call (multi-ref edit mode), do NOT use absolute language
like «MUST appear in the same positions», «Do not move», «Do not change»,
«MUST not» — even when the intent is to lock layout to one specific
reference image.

**Why:** The provider's attention budget is finite. Strong directives
applied to one role («the layout master must be preserved exactly») bleed
into the entire generation — identity refs get starved regardless of slot
position. Characters whose canonical shape is **outside common trained
archetypes** (e.g. Sandy Hourglass = transparent two-bulb hourglass with
limbs, not a typical anthropomorphic creature) lose lock first and fall
back to the nearest familiar form. Sandy → yellow cub / bear / squirrel
is the canonical failure mode of this pollution.

Conventional shapes (anvil = recognizable anvil silhouette, mirror_vanity
= recognizable furniture) auto-anchor from their refs even with weak
attention, so the bug is **silent for typical characters** and only
surfaces when an unconventional canon enters the lineup.

**How to apply:**

- Replace absolute directives with **advisory phrasing**: «Use as the
  spatial guide», «The other refs are CHARACTER CANON», «Identity
  preservation takes precedence over layout exactness».
- Add an **explicit identity-preservation counter-directive** that names
  the failure mode by archetype: «Sandy is a transparent two-bulb
  hourglass character... NOT an animal, NOT a bear, NOT a cub, NOT a
  squirrel, NOT any furry creature».
- Naming the role of each ref in the prompt («the scene continuity
  master», «the other attached references are CHARACTER CANON») helps
  the model resolve disambiguation without our pipeline having any way
  to label refs at API level (refs are sent as anonymous binary in
  `image[]` array).

**Don't bother:**

- Changing ref slot order — empirically irrelevant when preamble strength
  is the real driver (SS-S15-E01 SH09 v01-v07 cycled через scene_master
  slot 1 → identity slot 1, all squirrel).
- Pre-composite refs into a single character sheet — heavy engineering
  that wasn't actually needed. Prompt-only fix sufficient.
- Switching provider to Flux — same outcome reachable via prompt change.

**First incident:** 2026-05-26 SH09 anchor pair v01-v07 (all squirrel
despite correct Sandy canon ref in payload), fixed at v08 by [[backlog-td61-td62-pipeline-blockers]] TD-65a.

**Source of truth in code:** `webapp/lib/agents/runners/episode-references.ts`
constant `ANCHOR_LAYOUT_LOCK_PREAMBLE` — the TD-65a version is the working
template. Future preambles for new anchor / animation chains should
follow the same advisory-phrasing pattern.

**Cross-references:** [[sandy-canon-visual-identity]] (what Sandy looks
like), [[backlog-td61-td62-pipeline-blockers]] (full incident timeline).
