---
name: backlog_kebab_video_reference_zones
description: Kebab/per-shot dossier UX — split into REFERENCE zone + VIDEO zone; smarter Generate-video button (check plan exists/approved). Director feedback 2026-07-02 E13 SH05.
metadata: 
  node_type: memory
  type: project
  originSessionId: 2bf21679-e377-4301-b1e4-7da4f5b89c20
---

# Kebab dossier: split into Reference/Video zones + smarter Generate button

**Director feedback 2026-07-02 (E13 SH05 kebab).** The live process-as-text in the kebab
(«генерится видео / работает дизайнер») is **«супер, не ожидал»** — KEEP IT.

## Problem
The kebab is built from blocks styled slightly differently; one says «реф-план», another just
«план» — unclear what relates to what. On SH05 it showed: ref plan v02 APPROVED / v01 INVALIDATED,
plan v01 REVIEW, ref v02 REVIEW, ▶ v01 APPROVED on-screen, no VID-shot yet, «🎬 Generate video».

## Ask 1 — split the dossier into TWO clearly-labelled zones
- **REFERENCE zone:** the ref **plan** (SPC-ref_plan) v1/v2/v3 + the **reference image** (IMG-episode_ref) v1/v2/v3.
- **VIDEO zone:** the **video/shot plan** (SPC-shot_plan) v1/v2/v3 + the **video** (VID-shot) v1/v2/v3.
Then each version stack reads unambiguously (which plan, which artifact, which version).

## Ask 2 — Generate-video button must be plan-aware BEFORE firing (live bug)
Pressing «Generate video» on SH05 **re-fired the Designer** (wasted spend). Current behaviour
(commit `3d29b73`, "plan-aware: render if approved plan else design") re-runs the Designer whenever
no APPROVED plan exists — even when a plan EXISTS in REVIEW. Desired:
- **No plan at all** → create one (Designer) — OK.
- **Plan exists & APPROVED** → immediately run video generation (render).
- **Plan exists but REVIEW/REVISION** → do NOT re-fire the Designer; TELL the presser the plan
  awaits approval (surface it), let them approve first.

## Status
✅ SHIPPED 2026-07-02 (branch `claude/e13-nudge-badge-casting-fixes`, commit `dd3bfe1`) —
awaiting Director browser check on live E13.
- **Ask 1** — kebab dossier (`AnimaticPlayer.tsx` popover) regrouped into two accent-tinted
  zones: REFERENCE {ref plan + image} / VIDEO {shot plan + video}; mirrored `plan`+artifact
  rows, `none yet` placeholder. Pure reorder + 2 headers; open/approve/on-screen behaviour
  untouched.
- **Ask 2** — `handleGenerateVideo` (`EpisodeTimelineSection.tsx`) now 3-way: no plan→Designer;
  APPROVED/LOCKED→render(VGEN); plan pending REVIEW/REVISION→don't re-fire, surface
  "approve it first" + open the plan. (Closed the gap `3d29b73` left where a REVIEW plan
  still re-fired the Designer.)
- Verify tsc 0 / vitest 1089 / replay-pilot 30. Sibling cluster (#1–3 drawer fixes) = `faec572`.
Related: [[backlog_shot_centric_paradigm]], [[plan_preview_drawer_doctrine]].
