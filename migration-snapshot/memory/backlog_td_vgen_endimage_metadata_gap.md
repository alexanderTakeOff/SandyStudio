---
name: backlog_td_vgen_endimage_metadata_gap
description: "TD backlog — VGEN render metadata never records end_image_asset_id; can't confirm two-anchor plans actually render with the end frame. Surfaced E10 SH25 smoke 2026-06-17."
metadata: 
  node_type: memory
  type: project
  originSessionId: 1cdf7435-577c-487c-82dc-ec725e78672d
---

**Finding (E10 SH25/SH26 anchor-mode smoke, 2026-06-17):** the VGEN render path
(`exec-vgen/single-shot`, plan-driven, fired on plan APPROVE) does **not stamp
`end_image_asset_id` into the VID-shot asset metadata for ANY E10 shot** — all 24
(now 26) rendered shots show `end_image: none`, including the ones the session
treats as legit two-anchor (SH02/04/06/13/19).

**Why it matters:** SH25's APPROVED plan explicitly declared `provider.id =
seedance-with-end-image` + `end_image.eref_asset_id = b64e2a79-3c00-4f8c-84f2-744adf4db2ac`
(a real APPROVED end-anchor exists). The render came back with no end_image in
metadata. So from data alone we **cannot tell** whether the render honoured the
two-anchor intent or silently degraded to ref-only. Two possibilities, both worth
closing:
1. **Metadata-only gap** (benign): the runner DOES pass end_image to the provider
   but never records it on the asset → observability hole; fix = stamp
   `end_image_asset_id` (and provider vocab) onto the VID-shot metadata at render.
2. **Real silent-degrade** (bug): the plan-driven VGEN path drops the plan's
   `end_image.eref_asset_id` and renders ref-only regardless → a two-anchor plan
   never gets its end frame. This is exactly the silent-degrade [[anchor_mode_orbit_ref_only]]
   B-surfaces fail-loud against — but B guards the regenerate-video REST/GUI/PA
   path, NOT the plan-approve→exec-vgen/single-shot auto-fire path.

**Not blocking** — Director accepted the smoke (SH25 static reads fine either way;
SH26 orbit ref-only is the headline and is correct). Low urgency.

**How to apply / next step:** when touched, trace `runner.ts` plan-driven VGEN
path: does it read `plan.end_image.eref_asset_id` and pass `endImageBase64` to the
provider? Then ensure the render stamps end_image + resolved provider vocab onto
VID-shot metadata so two-anchor vs ref-only is verifiable from data, not just by
eye. Folds into the broader observability/silent-failure theme
([[backlog_observability_failures_not_surfaced]]).
