---
name: match-cut-doctrine
description: "end_image (seedance-with-end-image) only valid when next shot's start frame visually continues current shot's end at SAME angle. Cuts to different angles must use seedance-standard with no end anchor."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f0a3593b-9989-42e0-b220-580d55abe0ba
---

# Match-cut doctrine for end_image

**Empirical discovery 2026-05-27 — SH19 manual direct-fal-vgen test.**

## Rule

When Animator chooses `seedance-with-end-image` provider, the `end_image.eref_asset_id` MUST be a frame that:

- **Visually continues** the current shot's natural action terminus
- **At the same camera angle / composition** as the current shot's last frame

If next shot K+1 is a **cut to a different angle / composition**, end_image is the WRONG tool. Use `seedance-standard` with `end_image: null` — let the provider freely interpolate to a coherent terminal pose.

## Why this rule exists

**Why:** Seedance interpolates from start_frame to end_frame at the pixel level over the duration. If end_frame depicts a wildly different composition (different angle, missing characters, different scene), the model has to «evacuate» everything to reach that endpoint. Result: characters fly through walls, lose canonical identity, end up wrong.

SH19 v09 attempt: start frame = Sandy + Anvil + trumeau, end frame = SH20 ref (close-up on wall hole, no characters). Seedance solution: Anvil flew through the wall and out the hole, lost canon. Wrong tool for the cut.

Same gag with SH22 ref v04 as end frame (Anvil pat squashes Sandy, characters still in frame, dyra in background) — Seedance kept characters in scene, canon preserved.

## How to detect match-cut vs different-angle cut

✅ **Match-cut (end_image OK):**
- K+1's start frame is what camera sees at K's last beat, same composition continuing forward
- e.g. K ends with character looking offscreen-right, K+1 opens with the character STILL looking right but camera is half-step closer — angle preserved, motion blended

❌ **Different-angle cut (end_image WRONG — use seedance-standard):**
- K+1 cuts to a close-up on a detail K wasn't framing
- K+1 cuts to a different subject (was characters, now wall close-up)
- K+1 is a wide after K was tight, or vice versa
- ANY composition change

## How to apply

Animator's Critic V09 should validate: if `end_image.eref_asset_id` is set, the asset's `metadata.shot_reference.shot_id` should be either:
- Current shot's own paired anchor (TD-49 anchor pair, same shot)
- OR explicitly K+1's ref AND Animator's `policy_notes` justifies the match-cut

Without justification → REVISE «end_image lacks match-cut justification — switch to seedance-standard or attach paired anchor».

## Related doctrines

- [[train-personnel-doctrine]] — TD-82 must teach this match-cut detection in Animator skill
- [[critic-revision-cap-doctrine]] — same applies to V09 enforcement; cap at 2-3 attempts then HALT
