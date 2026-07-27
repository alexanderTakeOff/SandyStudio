---
name: session-2026-06-14-arch-sprint-identity-casting
description: 2026-06-14 session — object contract + identity foundation (A1/A2) + Phase D casting core shipped; E09 verified; E10 deferred till all phases done
metadata: 
  node_type: memory
  type: project
  originSessionId: 933fcbb8-b0a4-4eed-b4c1-4b543c51d981
---

Big architecture session. Plan: `~/.claude/plans/lazy-swinging-sundae.md` (two-tier pipeline +
identity foundation). Director directives: pipeline = full traversable process surface;
fix recurring uuid fragility **systemically not patches**; **all phases before E10 launch**;
"don't blindly follow me — use judgment".

## Shipped — PUSHED to origin/master (…5ea1151) 2026-06-14
(+ later commits this session: `565f357` castEpisode PA tool, `c6819cd` PLAN, `5ea1151` regular-path
negative→provider. Phase D backend COMPLETE; casting UI panel deferred to a frontend session.)
- `fa10591` Thread 0+2 — episode cast scoping (`lib/agents/episode-cast.ts`) + TD-63 injector
  removed (root of E09 anvil/vanity in all 40 anchors) + object reference contract end-to-end
  (storyboarder emits `props_in_frame` → anchor attaches cast-scoped object refs → `negative`
  reaches provider, was dead) + `appears_in` projection.
- `6caf41e` Phase A1 — `episodes.series_id` code→UUID + FK. **Migration 0038 APPLIED to live DB**
  (all 11 episodes; deterministic backfill + guard). Healed 2 latent bugs: genre always-null +
  thumbnail "Series not found" (both did `series.eq('id', code)`). `seriesIdForEpisode` kept
  tolerant (UUID-first; legacy branches stay for replay-pilot mock).
- `c464cac` Phase D core — D1 ART-AD contract v0.2 (episode casting+breakdown+preflight) +
  `validateCanonExists` (HARD GATE); D2 casting API `POST /api/episodes/[id]/cast` (preflight →
  SPC-episode_cast DRAFT → approve locks scoping); D3 `casting` stage node in pipeline registry
  (before brief, ART-AD 🎭).
- `b900ad9` Phase A2 — `shot_id` SSOT: 3 divergent extractors → one `lib/api/shot-identity.ts
  resolveShotId`. No migration (old assets resolve via content fallback).

## Verified
- E09 visual proof: SH07 (cab) intruders GONE (`identity=["sandy_hourglass"]`); SH08 panel CANON
  (`object_slugs=["elevator_button_cluster"]`, consistent start/end). Panel proven via MANUAL
  `objects[]` inject into old E09 plans (old storyboards lack `props_in_frame`).
- tsc·0 / 829 tests / 30 replay-pilot green after every commit.

## NEXT (priority order)
1. Phase D tail — casting UI (LibraryFeeds bind-to-episode) + PA cast tool (Polина/Director cast
   in-app). Casting capability already works via API.
2. A3 — atomic mutation boundary (appears_in → RPC in approve tx). **Needs a CREATE FUNCTION
   migration = live-DB auth gate** (do deliberately, not tail-of-session).
3. Phase B — declarative stage registry; migrate next-events.ts behind `DECLARATIVE_DAG` flag.
4. Then Phase C (series tier lifecycle) → clean E10 run from E09 brief = integration test.

## Open / notes
- E09 anchors still polluted (only SH07/SH08 regenerated as proof) — regen happens on clean E10.
- 5 commits unpushed; prod server restart owed if env/flags changed.
- Mode: PLAN.md `Mode:` line is the hook's source of truth — keep it synced with Director's
  actual ===N=== (mismatch blocks writes; fixed once this session).
- SH02 call-button regen blocked by PLAN_ANCHOR_STALE (TD-35 freshness guard — working as intended).
- Related: [[backlog_td_pipeline_full_process_surface]], [[backlog_td_artdir_breakdown_role]],
  [[director_process_and_people_first]], [[anti_additivity_principle]].
