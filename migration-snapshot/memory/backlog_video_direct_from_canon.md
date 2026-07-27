---
name: backlog_video_direct_from_canon
description: "TODO — next run, try generating VIDEO directly from description + canon refs, skipping the pre-generated reference-image step"
metadata: 
  node_type: memory
  type: project
  originSessionId: dac17679-229b-4b22-9353-451b864af467
---

**Director idea (2026-06-21, after E11 ref review):** next time **try generating
video straight from the shot DESCRIPTION + canon references, WITHOUT first
generating per-shot reference images (`episode_ref`).**

**Why:** Sandy's forms are simple and clear, the canons are well-defined. With a
clean canon (see [[backlog_skill_abstraction_audit]] / the 2026-06-21 Sandy
hand/feet canon-text fix), the video model may render the shot acceptably — and
often MORE EASILY — directly from the text description + the LOCKED canon
reference images (character + location + objects + style), skipping the whole
EREF Designer→Critic→Artist→approve chain per shot. Fewer stages = fewer failure
points (the E11 run had stuck/failed EREF artists, ECONNRESET waves, regen caps).

**How to apply (experiment for a NEXT run, not E11):**
- Pick one shot. Feed the video provider (seedance/veo img2vid OR a text+multi-ref
  path) the canon refs (SBL-character_sandy_hourglass, SBL-location_*, object refs,
  style) + the storyboard shot description directly — no `episode_ref` image first.
- Compare quality/effort vs the current ref-image-first pipeline.
- If good: this could collapse the EREF stage for simple-canon series → big
  subtraction (anti-additivity). If the video drifts without a per-shot still,
  keep the ref-image step.
- Note: today's video path is img2vid and REQUIRES a reference image
  (`requires_reference_image` throws otherwise) — so this needs either a
  text-to-video / multi-ref-to-video provider or feeding a canon image as the ref
  directly. Scope the provider capability before committing.

**Provider multi-ref check (Director 2026-06-21, «это надо проверить»):** the idea
needs a video provider that accepts MULTIPLE reference images in ONE shot
(character + location + object + style canons together). Findings so far:
- Our CURRENT Seedance integration (`lib/agents/providers/fal-seedance.ts`) is
  SINGLE-ref: `payload.image_url` (one start frame) + optional `end_image_url`
  (end frame of the same shot). Model = `bytedance/seedance-2.0/image-to-video`
  (and `.../fast/image-to-video`). It does NOT pass an array of subject refs.
- fal public page for `bytedance/seedance-2.0` is "early access", no multi-ref
  param docs visible → confirm via fal docs/endpoint when running the experiment.
- TO VERIFY: whether Seedance 2.0 has a multi-reference / "reference-to-video"
  variant (e.g. an `image_urls`/`reference_images` array), OR use a fal sibling
  that does multi-subject reference (candidates to check: Kling "elements",
  Vidu reference-to-video, Pixverse, Veo). If a multi-ref endpoint exists, wire a
  new provider path; if not, fall back to feeding one composite canon image.

Related: [[anchor_mode_orbit_ref_only]], [[backlog_shot_centric_paradigm]], [[seedance_prompting]].
