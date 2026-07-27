---
name: backlog_animatic_dedup_ref_vs_video
description: "Video-animatic timeline IS a superset of the reference gallery — the cell-resolver already does video→review→image-fallback→placeholder per shot. Reference 'animatic' is a static gallery (no player), pure duplicate. Subtract the VISUAL surface (fold into timeline cells); keep the EREF creation/review pipeline. Blocker: timeline today gates on an APPROVED VID-animatic, so it can't be the always-open shot-centric home yet."
metadata: 
  node_type: memory
  type: project
  originSessionId: 3a812bff-e255-4d62-ad4e-00e0ef9cb60b
---

# Animatic dedup — reference gallery vs video animatic

Director's hypothesis (2026-06-20): two animatics duplicate each other; the video animatic is broader and basically a superset; eliminate the reference animatic as a separate VISUAL surface and let the video-animatic timeline cells be the single home (empty→ref/anchor→video→done). Converges with [[backlog_shot_centric_paradigm]].

**Verdict up front: hypothesis is CORRECT for the VISUAL surface, with one caveat about the gate.** The "reference animatic" is not actually a player — it's a static gallery. The video-animatic timeline's per-shot cell-resolver ALREADY renders the best-current-visual per shot (video → review-video → reference-image fallback → placeholder), which is exactly the superset cell the Director describes. The reference gallery can be subtracted as a visual surface and folded into the timeline. The EREF *creation + review* pipeline must stay. The real blocker is that the timeline currently refuses to render without an APPROVED `VID-animatic`, so it cannot yet be the always-open home.

---

## 1. Reference "animatic" — what it actually is

It is **not** a player/animatic. It is a **static gallery**.

- **Component:** `webapp/components/episode/EpisodeReferencesGallery.tsx` — grid of reference images grouped by shot, APPROVED variant shown prominent, others collapsible. No timeline, no scrub, no playback, no audio.
- **Drawer detail:** `webapp/components/assets/EREFv2Sections.tsx` (TestPlanCard, VerdictPill, ScoreBars, IssuesList, CandidatesStrip, AttemptsStrip) — per-asset review detail, opened from the gallery.
- **Progress pill:** `webapp/components/pipeline/EREFPilotPillbar.tsx` (PENDING_REVIEW → FANOUT_RUNNING → FANOUT_COMPLETE → COMPLETE).
- **Mount:** `webapp/app/(studio)/episodes/[id]/page.tsx` — rendered only when `selectedStage === 'episode_references'` (workstation panel), alongside `EREFPilotPillbar`.
- **Asset types it shows:** `IMG-episode_ref*` and `IMG-anchor*`, fetched via `/api/assets?...&file_type_prefix=IMG-episode_ref,IMG-anchor&limit=200`.
- **Metadata contract:** `episode_references@v2` (`webapp/lib/api/shot-reference.ts`), stored in `assets.metadata.shot_reference` (shot_id, shot_role, test_plan, generation_history, review verdict + 5 scores, objects).
- **Shot enumeration:** from the **set of generated reference assets** grouped by `metadata.shot_reference.shot_id`; `totalShots` falls back to `episode.metadata.eref_total_shots` (persisted at approve-pilots) or the count of unique generated shot_ids. It does NOT independently render the storyboard's full shot list — shots without any generated ref simply don't appear.
- **Builder agents/events:**
  - `EXEC-EREF-DESIGNER` (`webapp/lib/agents/runners/episode-reference-designer.ts`) — per-shot LLM planner, event `sandystudio/exec-eref-designer/plan` {episodeId, shotId}; emits `SPC-ref_plan-<shot_id>`.
  - Critic `EXEC-EPREV` — event `sandystudio/exec-eprev/review-plan`.
  - `EXEC-EREF` (`webapp/inngest/functions/exec-eref.ts`) — calls the image provider (`gpt-image-2`), writes `IMG-episode_ref` rows. Events `sandystudio/exec-eref/start|fanout-trigger|upscale-final`.

So the "reference animatic" = a gallery of `IMG-episode_ref`/`IMG-anchor` per shot + its review machinery. There is no second player.

## 2. Video animatic — what it is

- **Player:** `webapp/components/animatic/AnimaticPlayer.tsx` — RAF playback, per-shot duration/trim, music/audio tracks, hybrid mode that overlays `VID-shot` mp4s when present. **Does not itself require an approved animatic** — it renders whatever `AnimaticContract` it's handed (even empty shot_list → "No shots yet" placeholder cells).
- **Section wrapper:** `webapp/components/timeline/EpisodeTimelineSection.tsx` — the unified episode review surface. **This is where the gate lives** (see §5).
- **Contract:** `animatic@v1` (`webapp/lib/api/animatic-shotlist.ts`). `AnimaticShot` = { shot_id, asset_id, image_url, duration_seconds, shot_role?, caption? }. Plus `director_overrides`, `audio_tracks`, `music_url`, `total_duration`.
- **Shot-list builders (both walk STORYBOARD order via `extractShotsFromStoryboard`):**
  - `buildShotListFromApprovedEREF()` — matches each storyboard shot to its APPROVED `IMG-episode_ref` by `metadata.shot_reference.shot_id`.
  - `buildShotListFromAnchorChain()` — START anchor per shot, episode_ref fallback, duration from APPROVED `SPC-shot_plan`.
  - `assertCompleteShotList()` THROWS if even one storyboard shot fails to resolve to an approved image — so the contract is all-or-nothing on approved refs.
- **Cell resolver (the superset logic):** `webapp/lib/api/timeline-cell-resolver.ts` → `resolveTimelineCells(contract, vidShotAssets)`. Per shot, priority: latest VID-shot APPROVED/LOCKED (`video-canonical`) → latest VID-shot REVIEW (`video-review`) → animatic image (`image`, = the reference frame) → `placeholder` (no asset, "No shots yet"). Filters INVALIDATED, picks latest by version then created_at. Media URL via the same `/api/media/<id>` route as `asset-preview-resolver.ts`.
- **Create-animatic agent/event:** `EXEC-EDIT` (`webapp/inngest/functions/exec-edit.ts`), event `sandystudio/exec-edit/create-animatic`, runner `webapp/lib/agents/runners/animatic-slideshow.ts` → writes the `VID-animatic` asset carrying `metadata.animatic_v1`. Gate (`webapp/lib/agents/gate.ts`): requires ≥1 APPROVED `IMG-episode_ref` (or anchor START + shot_plan). It needs NO `VID-shot` to build.

## 3. Overlap analysis — is the video animatic a superset?

**Yes, per-shot the timeline cell is a strict superset of the reference gallery cell.** The reference gallery's per-shot tile shows the approved reference image. The timeline cell's `image` kind shows the *same* approved reference image (same `IMG-episode_ref` asset, same `/api/media/<id>` URL) — and ON TOP of that promotes to the rendered video when one exists. So the timeline already displays everything the reference gallery displays, plus the video layer the gallery cannot show.

Where they diverge today (these are the real gaps, not value-adds of the gallery):
- **Temporal availability.** References exist BEFORE any video and BEFORE the animatic is created. The gallery is the only surface during the EREF stage; the timeline is empty/hidden until `VID-animatic` is APPROVED.
- **Enumeration source.** Gallery enumerates from generated assets (missing shots invisible). Timeline enumerates from `contract.shot_list`, which is built from storyboard order but only AFTER all refs are approved (else `assertCompleteShotList` throws). Neither currently renders an empty grid straight from the storyboard shot count.
- **Review depth.** The gallery drawer (`EREFv2Sections`) surfaces the EREF Critic verdict + 5 scores + issues + attempt history + candidate variants. The timeline drawer (`PreviewDrawer`) is the generic asset drawer. This review DATA must survive subtraction — it's the part the timeline cell doesn't replicate inline.

## 4. Subtraction feasibility (anti-additivity)

**The VISUAL surface can be subtracted; the CREATION/REVIEW pipeline must stay.**

Removable (visual-only):
- `EpisodeReferencesGallery.tsx` as a *separate stage panel*. Its job — "show me the reference image per shot, grouped by status, click to review" — is already done by the timeline cell + its drawer, IF the drawer surfaces the EREF review data.

Must stay (load-bearing):
- The entire EREF authoring/review chain: `EXEC-EREF-DESIGNER`, `EXEC-EPREV`, `EXEC-EREF`, the `episode_references@v2` contract, `EREFPilotPillbar` pilot/fanout state machine, the approve-pilots / advance routes. This is *production*, not a duplicate view. References must still be generated, reviewed and approved — that's what fills the timeline cells.
- `EREFv2Sections.tsx` review detail — must be reachable from the timeline-cell drawer (move it under `PreviewDrawer` for EREF assets, don't delete it).

Minimal data a timeline cell needs to resolve "best current visual" (all already available):
- Storyboard `shots[]` (canonical shot_id list + duration + role) — already parsed by `extractShotsFromStoryboard`.
- Per shot: latest APPROVED `IMG-episode_ref`/`IMG-anchor` (image fallback) and latest `VID-shot` by status (video). Already what `resolveTimelineCells` + `asset-preview-resolver.ts` do.
- For the EMPTY state: nothing but the storyboard shot count (→ starfield placeholder cell).

Net delta of the subtraction: remove one stage-panel component + its mount branch; reuse the existing cell resolver and preview drawer. Negative/flat line delta. No new entity required for the cell logic — it exists.

## 5. Timeline-as-home gaps (what blocks it being the always-open home)

1. **HARD GATE on APPROVED VID-animatic.** `EpisodeTimelineSection.tsx` lines 119-135 + 251-274: it picks only `VID-animatic` rows with status APPROVED/LOCKED and `isAnimaticV1`; if none, the whole section returns the "Animatic not generated yet" empty card. So today the timeline cannot appear from the storyboard alone — it needs the EXEC-EDIT animatic built AND approved. This is the #1 thing to change.
2. **`shot_list` is ref-gated, not storyboard-gated.** The contract's `shot_list` is built by `buildShotListFromApprovedEREF` / `buildShotListFromAnchorChain`, both of which `assertCompleteShotList` → THROW unless every storyboard shot already resolves to an approved image. There is no path today that yields a shot_list of placeholder cells from the storyboard before refs exist.
3. **No storyboard-driven empty grid.** To be the home "from the moment the storyboard yields a shot count", the timeline needs a shot_list source = storyboard `shots[]` with `asset_id: null` cells (kind `placeholder`/starfield) that the resolver progressively upgrades. The resolver already emits `placeholder` for an empty cell — but it only runs over an existing contract, and an empty/asset-less `AnimaticShot` violates the current `AnimaticShot` shape (`asset_id`/`image_url` are required, non-null).

Bridging move (smallest): add a storyboard-derived contract path (shot_list from `extractShotsFromStoryboard`, `asset_id: null`, `image_url: ''`) and let `EpisodeTimelineSection` fall back to it when no APPROVED `VID-animatic` exists — rendering the empty/starfield grid. The cell resolver then upgrades each cell to ref → video as assets land. No new player, no new resolver.

## 6. Risks

- **Downstream stitch gate.** `EXEC-STITCH` (gate.ts) requires `VID-animatic` + `VID-shot`. The animatic asset is also the carrier of `director_overrides` (per-shot durations/trims) and `audio_tracks`/music that STITCH bakes into the final cut. If the timeline becomes storyboard-driven, the APPROVED `VID-animatic` asset (and its pacing/audio metadata) must STILL be produced by EXEC-EDIT before stitch — don't conflate "render an empty home grid" with "skip building the animatic asset". The home grid is a VIEW; the `VID-animatic` remains the contract artifact for pacing + audio + stitch.
- **Pacing data location.** Per-shot durations and music currently live only inside the `animatic_v1` contract. A pre-animatic storyboard-driven grid has no overrides/audio yet — fine for viewing, but the pacing edit UI must remain tied to the real `VID-animatic` once it exists.
- **EREF review-data loss.** Removing `EpisodeReferencesGallery` without re-homing `EREFv2Sections` (verdict/scores/issues/attempts/candidates) under the timeline drawer would lose the EREF Critic surface. Re-home, don't delete.
- **Enumeration mismatch.** Gallery `totalShots` (from `eref_total_shots` / generated assets) and timeline shot count (from storyboard) can disagree if the storyboard count and the fanout count drift. Making storyboard the single source for the home grid is actually the FIX for this, but it will expose any existing drift.
- **`assertCompleteShotList` throw.** If a storyboard-driven path reuses the existing builders, the all-or-nothing throw will fire while refs are still incomplete. The empty-grid path must NOT route through `assertCompleteShotList`.

---

**Verdict:** The video-animatic timeline is genuinely a per-shot SUPERSET — its cell resolver already does video → review-video → reference-image → placeholder. The "reference animatic" is a static gallery, a pure VISUAL duplicate of the timeline's image-fallback cells plus an EREF review drawer. **Subtract the reference gallery as a separate visual stage-panel; fold its cell into the timeline (already done by `resolveTimelineCells`) and re-home its review drawer (`EREFv2Sections`) under `PreviewDrawer`. KEEP the full EREF creation/review pipeline — that's production, not duplication.** The one structural blocker to the timeline-as-home is the APPROVED-`VID-animatic` gate in `EpisodeTimelineSection` + the ref-gated `shot_list` builders; add a storyboard-derived empty-grid contract path so the home appears the moment the storyboard yields a shot count.

**Why:** the product unit is the shot; the timeline cell already resolves the single best visual per shot, so a second reference-image surface is duplicated UI that fragments context (the executor-centric pain in [[backlog_shot_centric_paradigm]]). Removing it is net-subtractive and converges the codebase on one shot-centric home.

**How to apply:** after a clean прогон, in slices — (1) add a storyboard-derived placeholder shot_list + drop the hard `VID-animatic` gate in `EpisodeTimelineSection` so the empty starfield grid renders from the storyboard shot count; (2) re-home `EREFv2Sections` review detail under the timeline cell drawer; (3) remove `EpisodeReferencesGallery` as a separate stage panel (keep `EREFPilotPillbar` + the EREF agents/events untouched). Do NOT touch the `VID-animatic`/EXEC-EDIT/STITCH pacing+audio contract — the home grid is a view layered over it. Spec the slice under `specs/` inside the refactor PR (needs ===5===). Related: [[backlog_shot_centric_paradigm]], [[backlog_eref_pipeline_node_spec]], [[backlog_td_pipeline_full_process_surface]].
