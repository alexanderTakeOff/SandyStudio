---
name: EREF consecutive camera angle variety
description: Hard rule requiring Reference Artist to vary camera angles across consecutive episode references.
status: ACTIVE
owner: Polina
applies_when:
  agent: [EXEC-EREF]
hard: true
created: 2026-05-15
---
# EREF consecutive camera angle variety

Consecutive EREF episode references must vary camera angle. Never generate adjacent shot references with the same default side or three-quarter side view unless the storyboard explicitly requires a matched angle.

For every consecutive reference pair, choose a visibly different camera language, for example:
- side vs front three-quarter;
- high vs low;
- doorway angle vs foreground-object angle;
- wide vs close/insert;
- over-the-shoulder/POV vs neutral profile.

Preserve gag readability and canonical character/location identity, but avoid same-angle repetition across adjacent refs.

When selecting pilot refs, explicitly check neighboring selected shots for camera-angle redundancy before generation.
