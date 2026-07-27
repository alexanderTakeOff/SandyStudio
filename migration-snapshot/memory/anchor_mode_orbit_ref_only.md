---
name: anchor_mode_orbit_ref_only
description: "Empirical — on camera-orbit shots, ref-only beats two-anchor (end_image fights the orbit). Director verdict 2026-06-17, A/B smoke validated."
metadata: 
  node_type: memory
  type: project
  originSessionId: e6a94a1a-919a-4cb3-bd3c-9ec5e98c18cb
---

**On camera-orbit shots, ref-only (single anchor) renders MUCH better than two anchors (start+end_image).** A pinned `end_image` fights the orbit → the camera hitches/morphs toward the locked frame instead of arcing freely. Without it, motion lives.

**Validated empirically, not theory.** 2026-06-17 A/B smoke on E10 SH07 (orbit 10°, Sandy's arm) + SH03 (orbit 10°, Sandy reaching final pose). Identical prompt/seed=77/4s/720p, varied ONLY `end_image`. Director verdict: «с рефом гораздо лучше». Direct fal-seedance renders (no pipeline), seed-locked → the only variable was the end frame.

**Rule:** orbit ⇒ **ref-only by default** (`seedance-standard`, `end_image=null`). Two anchors (`seedance-with-end-image`) reserved for **static / locked-frame non-orbit match-cut landings** only.

**Why it matters / why non-obvious:** the [[match_cut_doctrine]] previously only forbade `end_image` across *angle cuts*. It did NOT cover the subtler case the Director sensed: even with *valid* continuity, the end-lock kills the orbit. Since [[camera_orbit_signature_policy]] makes 80%+ of shots orbit, the practical default flips toward ref-only; two-anchor is the exception, not the norm.

**Status — A + B DONE (2026-06-17), C parked.** (A) Animator skill + V15 critic `checkOrbitEndImage()` coerce orbit+end_image → REVISE (`0718d9e`/`a3735eb`, on origin). (B) regenerate-mode surfaces, local-unpushed `cde49fd`+`48fe57f`: **B1** VGENShotPanel anchor toggle «🎯 только реф / 🔗 два якоря» (ref-only nulls end_image + hides picker; two-anchor reveals it; reuses ProviderControlPanel fields-whitelist, ProviderControlPanel untouched); **B2** `regenerateShot(shotId, anchorMode)` PA tool — thin wrapper over the EXISTING `regenerate-video` route, resolves shotId→newest VID-shot via `ilike`, fail-loud on two-anchor-without-end-frame, concierge.md rule 10. Both fail-loud: «ref-only» nulls end_image; «two-anchor» without an end frame surfaces «нет end-якоря», never silent-degrade. tsc·0/912/replay30. **C (regenerate the 8 infected E10 shots ref-only, ~$10-15) is PARKED** per Director «только построить B» — no renders spent; fire when Director gives go on spend. Infected list: SH03/07/10/12/14/17/18/23 (all REVIEW, two-anchor); legit two-anchor (leave): SH02/04/06/13/19.

**SMOKE-CONFIRMED on virgin shots (2026-06-17, Director accepted «принимаем»).** E10 SH25+SH26 (the first 2 of 4 ungenerated shots, run end-to-end by Polина autonomously via `authorized_principal` nudge): the Animator now DISCRIMINATES correctly — SH26 (orbit 10°) → authored `seedance-standard` ref-only, citing the doctrine in its rationale; SH25 (static match-cut) → `seedance-with-end-image` two-anchor (the legit exception). V15 critic PASS on both (no false REVISE on the legit two-anchor, no miss on the orbit). Both rendered; Director's eye: SH26 ref-only «нет дёрганий и явных косяков как с двумя якорями». So the A-layer (skill + V15) works on fresh shots, not just retro-fixes. Caveat surfaced → [[backlog_td_vgen_endimage_metadata_gap]].

**How to apply:** when reviewing/authoring any Animator plan or anchor decision, if the shot has camera orbit → default ref-only. Flag two-anchor on an orbit shot as a likely defect.
