---
name: backlog_td_music_bake_animatic_selection
description: Deferred deep bug — music bake targets newest animatic of ANY status while timeline displays newest APPROVED only; version divergence bakes music into an invisible animatic.
metadata: 
  node_type: memory
  type: project
  originSessionId: 80441284-da45-4c79-bbe9-328744f6caa0
---

**Deferred follow-up (2026-07-13, after the music-in-timeline fix `b536aa91`).**

The DISPLAY symptom («залил+заапрувил музыку — нет в таймлайне») is fixed: the
timeline now falls back to the newest APPROVED `AUD-music*` whenever the active
contract carries no music (both real-animatic AND synthetic branches), and
`newestApprovedMusic` uses `startsWith('AUD-music')` + `staging_path` (was exact
`=== 'AUD-music'`, which dropped the composer's real `AUD-music-main`). See
`webapp/lib/api/animatic-shotlist.ts` + `webapp/components/timeline/EpisodeTimelineSection.tsx`.

**Still OPEN — the deeper bake bug I did NOT touch:** `bakeMusicIntoEpisodeAnimatic`
(`webapp/lib/api/ingest-music.ts:187-194`) selects the animatic to re-bake by
**newest `version`, ANY status**, while the timeline displays the newest
**APPROVED/LOCKED** (`EpisodeTimelineSection.tsx:219-235`). If a DRAFT/REVIEW vNN
sits above the APPROVED animatic, music is baked into a version the timeline never
renders. `bakeApprovedMusic` (`webapp/lib/agents/music.ts:33,62-64`) also swallows
all errors → a bake miss is silent. The display fallback masks this for the
timeline PREVIEW, but the PERSISTED animatic contract stays music-less, which can
bite the final render/stitch path if it reads baked audio.

**Why it exists:** the two selectors diverged (bake = newest-any-status, display =
newest-APPROVED). **How to apply:** reconcile the two — make the bake target the
same animatic the timeline displays (newest APPROVED/LOCKED), or make it re-bake
ALL approved animatics; and stop `bakeApprovedMusic` from swallowing errors
silently (log/surface the miss). Runtime-verify against a real episode
(`AUD-music-main` + a silent auto-EDL) before/after. [[verify_real_results_not_logs]]
