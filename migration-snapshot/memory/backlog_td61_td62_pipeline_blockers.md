---
name: backlog-td61-td62-pipeline-blockers
description: TD-61 (regenerateVideoFromPlan never plan-driven) + TD-62 (gpt-image-2 identity drift in anchor mode) — discovered 2026-05-26 anchor smoke retry.
metadata: 
  node_type: memory
  type: project
  originSessionId: b41f1ebd-4fef-4c43-9f47-a6201dcdffb8
---

# TD-61 + TD-62 — anchor-mode smoke retry blockers (2026-05-26)

Surfaced during the SH09 anchor pair + SH08 VGEN re-fire after Inngest restart.
Designer + Animator + Critic chain worked perfectly. **Executors broke in two
independent ways.**

## TD-61 — `regenerateVideoFromPlan` never engages plan-driven runner

**Evidence:**

- SH08 VID-shot v01 (07:12 UTC, before Inngest restart) and v02 (07:28 UTC,
  after restart) — both have identical fallback prompt («2D animated comedy
  short. Medium two-shot. Visual canon: # SANDY HOURGLASS — Character Bible
  Entry # ANVIL — Series Bible Entry...») length 461 chars
- `metadata.plan_asset_id` = absent in both
- SH08 Shot Plan v05 (`341b356a`) is REVIEW (rich 7608c content, json+SUBJECT
  present) — runner skipped it

**Strong hypothesis:** `lib/inngest/client.ts` schema declaration for
`sandystudio/exec-vgen/single-shot` does NOT include `planAssetId` field.
Inngest EventSchemas may strip undeclared fields → `data.planAssetId` on the
handler side is undefined → runner falls through to `buildShotPromptV2` legacy
template (which is where the «# SANDY HOURGLASS — Character Bible Entry»
markdown-header pollution comes from — it just stamps the file title without
content).

**Fix candidate:**

```ts
'sandystudio/exec-vgen/single-shot': {
  data: BaseEpisodeEvent & {
    shotId: string;
    aspect_ratio?: '16:9' | '9:16' | '1:1';
    quality_tier?: 'fast' | 'standard';
    duration_seconds?: number;
    planAssetId?: string;   // ← add this
  };
};
```

Plus verify approve-route + fan-out emit-single-shot already pass it.

**Smoke after fix:** Director approves SH08 Plan v05 → re-fire
`regenerateVideoFromPlan` → expect new VID-shot v03 with `metadata.prompt`
matching Plan v05 SUBJECT (cost colours `#F5C96A`, seedance-fast 2s).

## TD-62 — gpt-image-2 identity drift in anchor pair mode

**Evidence:**

- SH09 anchor pair both v02 (start `07242c5d`, end `6d0d2c1e`) show:
  - Sandy replaced by a yellow bear/cub character — canon is transparent
    two-bulb hourglass body with rubber-hose arms (see
    [[sandy-canon-visual-identity]])
  - Anvil canon held on START (smug face, rubber-hose arms visible)
  - Anvil dropped to a plain iron anvil with no face on END
- Refs that were ACTUALLY supplied (verified in metadata):
  - `scene_master_asset_id: 5df0a4a5...` (LOCKED bedroom location)
  - `identity_character_slugs: [sandy_hourglass, anvil]`
  - `provider_used: openai-edits-multi` (MAX_REFS=16, no limit issue)
- Bible LOCKED character art exists for both Sandy and Anvil — refs WERE
  supplied to OpenAI Edits API

**Root cause:** Provider attention budget. LAYOUT LOCK preamble («mirror_vanity
LOCKED at exact centre, IMMUTABLE») consumed model attention; with no
`strength` knob on `openai-edits-multi`, the provider can't be told «honour
identity refs harder than layout ref». Action prompt («frantic salvage», «yellow
rug»...) silently overrode identity, producing a generic cub.

**Fix candidates:**

1. **Sharpen prompt** — explicit «PRESERVE EXACT body shape from reference 2:
   Sandy is a TWO-BULB TRANSPARENT HOURGLASS, NOT a bear/cub/animal. Preserve
   reference 3 Anvil: black anvil-shape WITH FACE AND ARMS, NOT a plain metal
   object.» This goes inside `ANCHOR_LAYOUT_LOCK_PREAMBLE`.
2. **Switch provider to Flux Pro Ultra** — supports per-ref weight + strength;
   we can dial layout weight down and identity weight up. Risk: Flux only
   accepts ONE ref image, would need to pre-composite.
3. **Pre-composite refs** — paste character cutouts onto scene_master image,
   feed the composite as a single ref. Heaviest engineering.

**Recommendation:** start with (1) — cheapest. If SH09 v03 still drifts, escalate
to (3). Don't go straight to (2) — single-ref Flux loses the multi-character
guarantee.

## Order of operations

1. Fix TD-61 (schema declaration) — 1-line code change + verification
2. Director APPROVE SH08 Plan v05
3. Re-fire SH08 → verify VID-shot v03 metadata.prompt = Plan SUBJECT
4. Fix TD-62 prompt — extend `ANCHOR_LAYOUT_LOCK_PREAMBLE` with identity
   preservation directives
5. Re-fire SH09 anchor pair → visually verify Sandy is hourglass, Anvil has
   face
6. If TD-62 fix #1 fails — propose #3 to Director with cost estimate

## Cross-references

- [[sandy-canon-visual-identity]] — what Sandy and Anvil are SUPPOSED to look like
- TD-49 P2.3 — anchor pair authoring sprint that made this surface possible
- TD-50 — previous attempt to fix plan-driven manual triggerAgent VGEN (worked
  for one path, not for the regenerateVideoFromPlan tool path = TD-61 today)
- TD-57 — Designer max_tokens fix that unblocked Plans landing with anchor_pair
- TD-58 — Critic auto-chain enabled today; first production verdict still pending
