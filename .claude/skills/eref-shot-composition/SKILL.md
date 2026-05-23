---
name: eref-shot-composition
description: How EXEC-EREF-DESIGNER composes Reference Plans for storyboard shots — camera language, contrastive picking, location anchoring, character anchors, and cross-shot spatial continuity.
status: ACTIVE
owner: Director
applies_when:
  agent: [EXEC-EREF-DESIGNER]
hard: false
created: 2026-05-16
---
# EREF — Shot Composition

This is your craft playbook for composing reference keyframes. EREF
produces ONE canonical reference image per storyboard shot — the
image the downstream Animator (EXEC-VGEN) will use as the anchor for
motion generation. A well-composed reference makes the animator's job
trivial; a poorly-composed one cascades into 22 broken seconds of
finished video.

This playbook is structured guidance for **runner-side logic**, not for
verbatim injection into the image-gen prompt. gpt-image-1 visualizes
text literally; meta-instructions belong in your decision-making, not
in the prompt body. The runner translates your decisions into concrete
output-medium parameters (specific camera framing words, reference
asset selection, negative prompt).

## When to apply this skill

- You are picking the framing, angle, and reference inputs for a new
  EREF asset for one storyboard shot.
- You are reviewing whether the current set of EREF refs for an episode
  is visually varied enough (e.g. fan-out review).
- The storyboard has multiple consecutive shots in the same location
  and you must decide how to avoid same-look repetition.

## Camera language vocabulary

A working closed vocabulary for EREF framing decisions. The runner
turns these tokens into the actual prompt phrasing for gpt-image-1.

| Token | Visual character | When to use |
|---|---|---|
| `wide_frontal` | Whole space + subject head-on | Establishing the location; subject anchored centrally |
| `low_angle_hero` | Camera below subject, looking up | Subject feels imposing / dominant |
| `high_angle_overhead` | Camera above, looking down | Subject feels small / surveilled |
| `over_shoulder` | Frame is behind one character's shoulder | Two-character dynamic; viewpoint anchor |
| `close_insert` | Tight on object/hand/prop, subject implicit | Prop-driven gag; isolating a beat |
| `reverse_angle` | Opposite of preceding shot's POV | Cut-on-action with new info; subject reveal |
| `medium_3q_left` | Subject facing 3-quarter from left | Standard composition; readable face + body |
| `medium_3q_right` | Mirror of above | Pair with `medium_3q_left` for shot-reverse-shot |
| `dutch_tilt` | Camera tilted off-horizontal | Disorientation; world askew |
| `pov_subject` | Camera literally is the subject | Subjective; what the subject sees |

These are EREF references. Final animation framing decisions belong to
the Animator and may differ from EREF (e.g. EREF wide → VGEN close-up
via push-in).

## Contrastive picking across consecutive shots

For each new EREF, glance at the **previous 1-2 shots' camera picks**
in this scene. If you would otherwise produce the same token twice in
a row, switch to a contrasting choice. Some contrast pairs that work
reliably:

- `wide_frontal` → `close_insert` — establishing then prop
- `medium_3q_left` → `medium_3q_right` — shot-reverse-shot
- `high_angle_overhead` → `low_angle_hero` — power dynamic flip
- `wide_frontal` → `over_shoulder` — environment → relationship
- `medium_3q_left` → `dutch_tilt` — stable → disoriented

Repetition is allowed when it serves a visual rhyme (same trap a second
time, same gag escalating). Otherwise default to contrast — adjacent
same-angle refs read as visual stutter, not style.

## Location sub-area anchoring

When the Bible has **multiple sub-area reference images** for one
location (e.g. `gym_wall_a_back_window`, `gym_wall_b_right_pullup`),
prefer picking different sub-areas across consecutive shots over
prompt-engineering different angles of the same wall. Physical anchors
outperform text variations — the image-gen model returns more
believably different frames when handed different reference images.

Decision rule: storyboard `location.sub_area` field (if populated) is
authoritative. If empty and the Bible has multiple sub-areas, pick the
one that best matches the action prose; vary across consecutive shots
in the same location.

## Character canonical fragment anchoring

For every shot with `characters_present`, fetch each character's
LOCKED canonical reference (the head-and-shoulders portrait or
full-body pose from the Character Bible). Pass these as anchor inputs
to gpt-image-1 with explicit slug attribution. Without anchors,
character identity drifts across the episode — Sandy's proportions
shift, sand colour wanders, cap angle changes.

The Bible character slug is verbatim the slug in the storyboard
shot's `characters[].bible_slug` field. Never invent a slug. If a
character has multiple canonical fragments (e.g. neutral, smitten,
angry), pick the one closest to the shot's `expected_emotion`.

## Cross-shot spatial continuity

Continuity anchors are a **Plan contract**: `Plan.continuity_anchors[]` holds zero or more entries of kind `spatial_same_location` (TD-30) or `temporal_previous_shot` (TD-33). The runner surfaces both candidates in the user prompt with explicit "use this when / don't emit when" guidance — pick deliberately, per shot. The executor enforces freshness at generation time: if an anchor has been superseded by a newer APPROVED reference, the runner returns `PLAN_ANCHOR_STALE` and blocks the image-only regen. **For continuity drift, regen MUST go through `regenerateRefPlan` (plan-level), not `regenerateImageFromPlan` (image-only).**

Beyond the anchor contract, when composing the prompt body **preserve established spatial facts** unless the storyboard explicitly changes them:

- key object placement in the room/environment;
- attachment/contact relationships between objects and surfaces;
- screen side / left-right relationship of important elements;
- shape, size, orientation, and position of damage marks, openings, stains, props, plugs, labels, or other continuity-critical details;
- whether an object is in foreground/background, against a surface, on a surface, inside/outside another object, hidden/revealed, intact/damaged.

A follow-up shot may change action, pose, camera angle, or character emotion, but it must not silently move established objects, flip sides, resize/reshape continuity marks, or detach an object from the surface/environment that caused the previous beat.

Self-check:

1. What was the last approved visual state of this physical setup?
2. Which objects/marks/props are continuity-critical?
3. Did their side, position, size, shape, contact point, and room relationship survive into this shot?
4. If something changed, is that change explicitly motivated by the storyboard?

## Worked examples

### Example A — Two-shot variety in the gym (E21 SH01 → SH02)

- SH01 — bicep rack establishing:
  - camera: `wide_frontal`
  - sub_area: `gym_wall_a_back_window`
  - anchors: Sandy neutral, location wall A
- SH02 — dumbbell foot-drop:
  - camera: `close_insert` (on the falling dumbbell + foot)
  - sub_area: `gym_floor_with_rack`
  - anchors: Sandy mid-hop, location floor

Notice: different framing token, different sub-area, different anchor
emotion. The two refs don't look like the same shot retitled.

### Example B — Reaction beat after a gag

- SH04 — punchline (something explodes):
  - camera: `wide_frontal`
- SH05 — reaction (Sandy stares):
  - camera: `medium_3q_left` (close to face, readable expression)
  - emotion anchor: `wide-eyed surprise`

The reaction is intentionally narrower framing — it lets the audience
register the joke landing.

## Common pitfalls

- **Same-side three-quarter repetition.** Three consecutive
  `medium_3q_left` refs read as a single still picture, not a
  sequence. Break with `reverse_angle`, `low_angle_hero`, or a wider
  framing.
- **Adjective wallpaper in the prompt.** Stuffing the gpt-image-1
  prompt with «massive, gleaming, dramatic, cinematic» drags the
  reference toward generic stock. Concrete framing words win.
- **Forgetting the sub-area.** Two shots in the same gym with no
  sub-area discrimination produce two near-identical wall renders.
- **Skipping the character anchor.** First shot without canonical
  fragment anchor → Sandy looks slightly different. Every subsequent
  shot inherits the drift. Anchor always.
- **Mismatched emotion anchor.** Shot's `expected_emotion` is
  "smitten" but you pass the neutral canonical fragment → reference
  reads dead. Match emotion to the fragment available.

## Known quirks (gpt-image-1)

- The model over-interprets stage-direction prose. «He moves
  intimidatingly toward the rack» gets visualized as the words "moves
  intimidatingly" appearing in the frame more than once during E21
  probes. Use static-frame phrasing: «He stands at the rack, low
  angle, looking up at it».
- The model prefers concrete framing language («low-angle, looking up
  at subject») over film-school jargon («worm's-eye Dutch»). Translate
  vocabulary tokens into plain English at prompt-build time.
- Multiple character anchors compete. If you pass 3 character refs,
  the model often blends two of them; cap at 2 unless the shot
  legitimately needs a 3-character composition, and rely on the
  storyboard's `role_in_shot` (subject / co-star / background) to
  rank.
- Negative prompts substantially reduce defect rate. Always include
  `no text, no logos, no watermarks, no extra limbs, no melting
  objects` as a baseline.

## Self-check before emitting an EREF prompt

1. Did I pick a framing token that contrasts with the previous shot in
   this scene?
2. If the location has multiple sub-areas in the Bible, did I pick a
   specific one and did it differ from the last shot's sub-area?
3. Did I attach the canonical character fragment for every character
   in `characters_present`?
4. Does my prompt body describe a still frame, not a stage action?
5. Are the standard negative-prompt terms included?
6. For sequential shots, did I compare against the deterministic continuity anchor and preserve continuity-critical spatial facts?

## Cross-references

- Bible character canonical fragments — your anchor source.
- Bible location refs (incl. sub-areas) — your wall/area source.
- Storyboard shot fields — `location.slug`, `location.sub_area`,
  `characters[].bible_slug`, `characters[].expected_emotion`.
- `seedance-prompting` skill (Animator capability) — your EREF feeds
  the Animator's reference slot. The cleaner your reference, the less
  prompt-engineering Seedance needs downstream.
