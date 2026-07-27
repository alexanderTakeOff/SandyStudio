---
name: backlog_shorts_delivery_targets_not_propagated
description: "Episode Settings \"SHORTS\" writes only generation_config.video.aspect_ratio; the canonical delivery_targets key stays empty so Storyboard/EREF/Writer never learn it's a short."
metadata: 
  node_type: memory
  type: project
  originSessionId: fe88b21d-f4b7-4294-9bf3-3d09a3e830d1
---

**E29 «Светский раут» (first wave-1 shorts episode) exposed this, 2026-07-15.**

Director set "SHORTS" in Episode Settings and expected Writer/Storyboard/EREF to
frame vertically. They didn't — refs would come out **landscape**. Runtime root
cause (verified against DB + code, not static reading):

- Episode Settings "format" control (`EpisodeGenerationConfig` → `/api/episodes/[id]/settings`)
  writes **only** `metadata.generation_config.video.aspect_ratio="9:16"`. The route
  comment literally says *"generation_config. FORMAT only"*. It drives the **video
  generator aspect** and nothing else.
- The canonical shorts-intent key is **`metadata.delivery_targets`**. It is READ by
  `storyboarder` (vertical-safe framing), `episode-reference-designer`/`episode-references`
  (image size + 9:16 via `SIZE_BY_DELIVERY_TARGET` / `ASPECT_BY_DELIVERY_TARGET`),
  `animator`, `thumbnail-designer`, `gate`, `runner`. **No write surface sets it** —
  not the settings route, not the brief schema. So it stays `undefined` and EREF
  **silently** falls back to `youtube_landscape` (1536×1024) — a fallback, not an error.
- **Writer (`screenwriter.ts`) does not read `delivery_targets` at all** (0 refs) —
  it is fully shorts-blind, so a short gets the same script as a long-form episode.

**Two fixes, different sizes:**
1. **Wiring (acute):** make the "SHORTS" choice write `delivery_targets` through the
   app (settings route + control). Since Storyboard/EREF/Animator/Thumbnail already
   read it, this one change makes them all shorts-aware at once. Anti-additive shape:
   treat `delivery_targets` as the single source of truth and DERIVE video aspect +
   image size from it, collapsing the duplicate `aspect_ratio` signal — rather than
   maintaining two parallel shorts flags. [[anti_additivity_principle]]
2. **Behavior (Writer):** new capability — Writer reads `delivery_targets` and adapts
   (shorter target runtime, single-punch structure for a short). Needs design; defer.

**Why it matters:** any episode authored as a short today produces a landscape
storyboard + landscape refs unless someone hand-writes `delivery_targets` into
metadata via a raw DB poke (which the app has no legit path for, and the auto-mode
classifier rightly blocks). The setting the Director actually toggles is disconnected
from the pipeline that needs it. Overlay-on-runtime confirmed it. [[overlay_agent_reports_on_server_logs]]

**Also in the same E29 session (smaller):**
- Manual trigger of `EXEC-EREF-DESIGNER` fires the event **without `shotId`** → instant
  fail ("requires shotId in event payload"). The auto fan-out always supplies per-shot
  shotId; the manual/Polina trigger path does not. [[nudge_polina_dont_act_for_her]]
- Manual approvals don't surface a decision event: approving the storyboard leaves the
  NEW continuity review in REVIEW, and nothing tells Director/Polina "approve the
  continuity review to advance." Critic PASS badge ≠ review asset APPROVED. (Director
  pt2 — key manual actions should emit decision events.)
- Budget approval lives in 3 places in `EpisodeSettingsCard` (Save budget / Save caps /
  approve toggle) — collapse to one. (Director pt3.)
