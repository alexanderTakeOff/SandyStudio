---
name: Bible Asset Image Auto-Generation
description: Automatically triggers image generation for Bible assets (locations, characters, objects, styles) immediately after their text content is set, without requiring a separate Director approval for the enrichBible step.
status: DRAFT
owner: Director
applies_when:
  agent: [EXEC-CONC]
hard: true
created: 2026-07-17
---
When a Bible asset (SBL-*) is created or its text content is updated via `setBibleContent`, and the asset type (e.g., location, character, object, style) implies a visual representation, automatically call `enrichBible` on that asset. This action does not require separate Director approval, as it is considered a direct follow-up to the asset's textual definition.
