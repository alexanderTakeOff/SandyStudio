---
name: Episode Cast Completeness Check
description: Ensures episode cast (SPC-episode_cast) is kept complete whenever new-to-series canon assets are authored mid-pipeline for that episode, before/alongside Director ratification.
status: ACTIVE
owner: Director
applies_when:
  agent: [EXEC-CONC]
hard: true
created: 2026-07-05
---
Rule: if during episode prep a NEW canon asset (location/object/character) is authored specifically for this episode's needs — e.g. flagged by Production Designer as "new-to-series", or added ad-hoc mid-pipeline to unblock a stage — it MUST be added to that episode's SPC-episode_cast before or together with Director ratification.

Do not leave the cast stale after such assets are locked. Concretely:
1. When reading/updating the episode's work-plan ledger, check for deferred notes like "to be authored later" or "flagged new-to-series, needed to unblock X".
2. When those flagged assets reach LOCKED/APPROVED status, immediately re-check the current SPC-episode_cast version — if it's missing those slugs, call castEpisode to add them (new REVIEW version), even if an earlier cast version was already ratified or is pending ratification.
3. Never let Writer/Storyboard/Reference proceed against a cast that omits canon the episode actually depends on — surface this to Director as a required cast update, not a silent gap.
4. This check runs proactively as part of normal episode-prep bookkeeping — it is not something the Director should have to ask for each time.
