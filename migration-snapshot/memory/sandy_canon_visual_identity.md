---
name: sandy-canon-visual-identity
description: Sandy Hourglass visual canon — NEVER a bear/cub/squirrel. Two-bulb hourglass body with rubber-hose arms and mitten hands.
metadata: 
  node_type: memory
  type: project
  originSessionId: b41f1ebd-4fef-4c43-9f47-a6201dcdffb8
---

# Sandy Hourglass — canonical visual identity

Sandy Hourglass (SS-S15 protagonist) is **NOT** a furry animal. The model regularly
substitutes him with a yellow bear/cub/squirrel when identity refs are weak —
observed first time 2026-05-26 on SH09 anchor pair (TD-62).

**Canonical body** (SS-S15-SBL-character_sandy_hourglass-v01-LOCKED.png):

- Transparent two-bulb HOURGLASS body shape — upper bulb, narrow waist, lower bulb
- Sandy Gold `#F5C96A` fills inside both bulbs (sand-coloured)
- Rubber-hose dark-grey arms attached at waist, NOT shoulders
- Oversized mitten-style hands (no fingers)
- Eyes: enormous white circles with huge black pupils
- Mouth: animated, often a small O or wide grin
- Near-black warm outlines `#1A1008`
- Flat 2D cartoon, Pink Panther DePatie-Freleng style, NO 3D, NO realistic shading

**Anvil** (antagonist, SS-S15-SBL-character_anvil-v01-LOCKED.png):

- Classic horn-anvil silhouette as base, but as a CHARACTER (not real metal object)
- Face on the body: half-lidded smug eyes, cream-coloured mouth line
- Rubber-hose dark-grey arms, often folded
- Sky-blue `#6EC6E8` top-face highlight stripe
- Same flat 2D Pink Panther style

**Why:** gpt-image-2 multi-image edits sometimes silently drop identity refs and
decode characters from the action prompt alone. When the action says «frantic
salvage / innocent bafflement / bedroom with yellow rug» the model defaults to
generic cartoon cub + plain iron anvil. The refs WERE supplied (verified via
metadata `identity_character_slugs`) — provider just didn't honour them.

**How to apply:**

- Any prompt for Sandy must include the explicit body shape «transparent two-bulb
  hourglass character» phrase, NOT just `sandy_hourglass` slug
- Any prompt for Anvil must include «anvil body with face and rubber-hose arms,
  NOT a plain metal anvil»
- Sandy is NEVER any of: bear, cub, squirrel, dog, generic mascot
- If smoke shows a yellow furry creature instead of Sandy — open [[backlog-td62-anchor-identity-drift]]
- Reference image Sandy canon: SS-S15 series, file_type `SBL-character_sandy_hourglass`
- Reference image Anvil canon: SS-S15 series, file_type `SBL-character_anvil`

**First incident:** 2026-05-26 SH09 anchor pair both start+end showed yellow cub
instead of Sandy. Anvil canon held on start, dropped to plain metal on end.
