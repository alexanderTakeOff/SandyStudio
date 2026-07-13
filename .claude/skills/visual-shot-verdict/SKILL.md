---
name: Visual Shot Verdict
description: Post-render vision rubric — a critic LOOKS at the rendered pixels of a shot (reference image or video frames) and judges whether they actually depict what the shot contract (storyboard) and the style canon (Bible) require. Emits PASS / REVISE / FAIL with per-check findings. Use whenever a rendered IMG-episode_ref or VID-shot needs to be checked against intent by an agent that can see images.
flavor: process
status: ACTIVE
owner: Director
applies_when:
  stage: [episode_reference, video_shot]
  input: rendered_pixels
---

# Visual Shot Verdict — the critic that has EYES

The factory's text critics judge the **plan** before render. This rubric judges the
**rendered output** after render, by actually looking at the pixels. It exists because
defects that a human catches in a glance — a player with no racket, two opponents on the
same side of a net, an off-model extra limb — are invisible to a text critic and slip
through unless someone studies the image.

You are given, by ROLE (never hardcode a specific series/character/prop/genre):

- **Rendered frames** — one still for a reference image; several evenly-sampled frames for a video shot.
- **Shot contract** (from the storyboard): `action_prose`, `characters[]` (each with `bible_slug`,
  `role_in_shot`, `expected_action`, `expected_emotion`), `expected_gag`, `props_in_frame`,
  `location` (slug + sub_area + any geometry the location implies), `key_beat`, `camera_angle`.
- **Style canon** (from the Bible + Brief): declared style/medium, genre, per-character model sheet
  (materials, silhouette, limb design), and any negative/forbidden list.

Compare the pixels to intent. Report what you SEE versus what was EXPECTED.

## The checklist — run IN ORDER, do not skip

The order is deliberate: the cheapest, most human-obvious failures first. The #1 check exists
because the reviewer's classic blind spot is verifying the presence of what they're looking for
while never checking what is REQUIRED but ABSENT on the other participants.

1. **Equipment / prop completeness — PER CHARACTER, symmetric.**
   For EVERY character with an action role, is the prop their action requires actually present in
   the frame? If the activity needs the same prop for multiple participants (a racket sport needs a
   racket for each active player; a duel needs a weapon for each duelist), check EACH one — not just
   the subject. A `props_in_frame` entry that the action implies for a character but is missing on
   that character is a REVISE. (This is the check most often missed. Do it first, do it for everyone.)

2. **Activity coherence — the whole scene reads as the stated action.**
   Does the frame make sense as the activity named in `action_prose` / `key_beat` as a WHOLE, not
   just for the hero? A match with one unequipped player, a serve with no server motion, a chase with
   no pursuer — these are incoherent even if the hero looks fine. Judge the situation, not one figure.

3. **Physics & spatial geometry.**
   Does the space obey the logic the location implies? Dividers/boundaries in the right place and
   doing their job (a net SEPARATES the two sides — opponents must be on OPPOSITE sides, not sharing
   one); gravity, support, and contact plausible; trajectories consistent with the described path;
   scale/eyelines coherent. Spatial contradictions with the location contract are REVISE (or FAIL if
   they make the beat impossible to read).

4. **Anatomy & on-model integrity.**
   Are all limbs/appendages present, correctly attached, correct count — no missing, duplicated,
   melted, or fused parts? Does each character match its Bible model sheet (material, silhouette,
   limb design)? A character rendered with a limb/hand type it does not have in canon (e.g. a detailed
   articulated hand where the model sheet specifies a simple mitt) is off-model → REVISE.

5. **Fidelity to the shot contract.**
   Do the pixels deliver what was authored? Each character's `expected_action` and `expected_emotion`
   readable; the `expected_gag` legible as a gag (setup/impact/reaction present as the beat needs);
   camera framing consistent with `camera_angle`. If the intended meaning does not come across, REVISE
   and say precisely which expectation is not met.

6. **Style, genre & quality.**
   Consistent with the declared style/medium and genre (per Bible + Brief); nothing on the negative/
   forbidden list; no rendering artifacts that break readability; text — if any — is intentional and
   correct. Style drift or forbidden-term presence is REVISE.

## Verdict rules

- **PASS** — no check fails; the shot depicts the intended situation clearly and on-model. Minor
  cosmetic nits may be noted as low-severity findings without blocking.
- **REVISE** — one or more checks fail in a way a regenerate can plausibly fix (missing prop, wrong
  net side, off-model limb, unreadable gag). List each as a finding with `what_seen` vs `what_expected`
  so the generator gets a concrete hard-contract to fix.
- **FAIL** — the render is fundamentally unusable or contradicts the contract so badly that a targeted
  regenerate won't help, OR a hard limit is violated. Escalate to the Director.

Severity per finding: `critical` (breaks the beat / hard limit), `major` (clear defect, must fix),
`minor` (cosmetic). A single `critical` or any `major` → at least REVISE.

## Output schema (structured, no prose-only verdicts)

```json
{
  "verdict": "PASS | REVISE | FAIL",
  "findings": [
    {
      "check": "equipment_completeness | activity_coherence | physics_geometry | anatomy_on_model | contract_fidelity | style_genre",
      "severity": "critical | major | minor",
      "character": "<bible_slug or 'scene'>",
      "what_seen": "<what the pixels actually show>",
      "what_expected": "<what the contract/canon required>"
    }
  ],
  "summary": "<one-line human-readable verdict>"
}
```

An empty `findings` array is only valid with `verdict: PASS`.

## Conflict resolution

If the sources of truth disagree on an invariant (Bible says one material/silhouette, storyboard's
`action_prose` implies another; Brief style vs Bible style), **do NOT reconcile silently** — emit a
finding of severity `critical`, set `verdict: FAIL`, name both sources in `what_expected`, and let the
Director resolve. Picking a winner hides drift that surfaces downstream.

## Abstraction guardrails (why this skill stays reusable)

- Refers to characters/props/locations/genre **by role**, read from the shot contract and Bible — it
  hardcodes **no** series, character name, prop, sport, or genre. It works for a padel comedy, a 3D
  drama, or a stop-motion documentary because it judges "does the render match its declared contract",
  not "is this Sandy playing padel".
- Numeric thresholds and style vocabulary live in Bible/Brief, not here. This skill supplies the
  **sequence and the judgment protocol**; the concrete "what counts as on-model / on-style" comes from
  the canon it is handed.
- The opposite-genre test: every check above holds for an opposite-medium, opposite-genre production.
  If a future check would only make sense for one series, it belongs in that series' Bible, not here.
