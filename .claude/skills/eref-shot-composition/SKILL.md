---
name: eref-shot-composition
description: How EXEC-EREF-DESIGNER composes Reference Plans for storyboard shots — dramatic intent, emotional read, continuity function, camera language, contrastive picking, location anchoring, character anchors, and cross-shot spatial continuity.
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

## Dramatic Intent / Emotional Read / Continuity Function (MANDATORY)

Every Reference Plan MUST open with a compact production block BEFORE
any prompt body, subjects, camera, or style sections. Camera and
composition are downstream of dramatic intent — pick framing AFTER you
have decided what the shot must convey.

The block is six fields. All six are required for every Plan:

- **Dramatic intent** — what the viewer must understand in 0.5 seconds.
  One sentence, in plain language. The audience read, not the technical
  description.
- **Emotional read per subject** — every living character AND every
  hero-grade object (story-prop with character status, per
  [[hero-prop-canon-classification]]) gets a readable emotion / attitude
  / animate state. Lifeless background props are exempt.
- **Continuity-in** — what visual / action / spatial / emotional state
  is inherited from the previous shot. Cite the previous shot id when
  one exists, or note "first shot of scene / episode" when none.
- **Continuity-out** — what state THIS reference must hand to the next
  shot for the scene to flow. Cite the next shot id when known, or note
  "scene-end cut-out" when this is the last shot of the scene.
- **Gag function** — the role of this shot in its gag arc. One of:
  `setup` · `escalation` · `impact` · `reaction` · `cut-out` · `bridge`.
  Comedy genres require this; drama/thriller substitute with `beat`
  taxonomy from the Bible.
- **Static-frame translation** — re-express the action as a single
  readable frozen moment, not motion prose. gpt-image-2 visualises
  text literally; «runs across the room» renders worse than «mid-stride,
  legs scissored, body inclined forward, dust kicked up at trailing
  foot».

This block is the bridge between storyboard intent and prompt mechanics.
Without it, the Designer technically delivers anchors / layout / identity
but is not obliged to articulate what the audience must read, what each
subject feels, or how the shot couples to its neighbours. Plans that
skip this block compose images that look correct but say nothing.

**Sources to consult before composing the block:**

- Storyboard shot `expected_gag` + `action_prose` + `continuity_notes`
- Storyboard `characters_v2[].expected_emotion` + `expected_action`
- Previous and next storyboard shots (same fields) for continuity-in /
  continuity-out
- Bible character / prop entries for emotional palette per subject
- Bible style / world entries for the dramatic register of the series

**The block flows top-down into the prompt:**

- Camera choice from `## Camera language vocabulary` should make the
  dramatic intent landable in 0.5 seconds.
- Each subject's `current_action` + `current_mood` in the prompt body
  cites the emotional read from the block.
- Continuity-in shapes the temporal anchor reference attached to the
  shot; continuity-out shapes the "state delivered" that the next
  shot's Plan will list as its continuity-in.

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

## Provider-safe vertical source dimensions for Shorts

For `youtube_shorts` / vertical episode references, do **not** require the canonical Shorts delivery canvas (for example `1024x1792`) at the Reference Image stage when the current image provider cannot reliably produce that exact size.

Use the nearest provider-supported vertical source size instead — currently `1024x1536` for gpt-image reference generation — and state the rationale explicitly in the Plan: `provider-safe vertical source; Seedance/video stage crops/adapts to Shorts`.

Critic / reviewer logic must not request revision solely because a Shorts Reference Plan uses `1024x1536` rather than `1024x1792`, when `1024x1536` is the provider-safe source size. The Plan should still declare the intended downstream format as Shorts / vertical; the mismatch is an intentional provider-capability accommodation, not a composition error.

This rule prevents infinite plan-regeneration loops and provider failures caused by asking the image model for unsupported Shorts-sized stills. Delivery aspect compliance is handled downstream by the video provider/crop stage.

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

1. Did I open the Plan with the mandatory **Dramatic Intent / Emotional
   Read / Continuity Function** block, with all six fields populated?
2. Does every living character AND every hero-grade object in the shot
   have a declared emotional read?
3. Did I cite continuity-in (previous shot id or scene-start) and
   continuity-out (next shot id or scene-end cut-out) explicitly?
4. Did I pick a framing token that contrasts with the previous shot in
   this scene?
5. If the location has multiple sub-areas in the Bible, did I pick a
   specific one and did it differ from the last shot's sub-area?
6. Did I attach the canonical character fragment for every character
   in `characters_present`?
7. Does my prompt body describe a still frame (static-frame
   translation), not a stage action?
8. Are the standard negative-prompt terms included?
9. For sequential shots, did I compare against the deterministic
   continuity anchor and preserve continuity-critical spatial facts?
10. For Shorts / vertical references, am I using the provider-safe source size (`1024x1536` when required) and not forcing an unsupported delivery canvas (`1024x1792`) at the still-image stage?

## Cross-references

- Bible character canonical fragments — your anchor source.
- Bible location refs (incl. sub-areas) — your wall/area source.
- Storyboard shot fields — `location.slug`, `location.sub_area`,
  `characters[].bible_slug`, `characters[].expected_emotion`,
  `characters[].expected_action`, `expected_gag`, `action_prose`,
  `continuity_notes`. Continuity-in / continuity-out blocks read the
  previous and next shot's storyboard rows.
- `seedance-prompting` skill (Animator capability) — your EREF feeds
  the Animator's reference slot. The cleaner your reference, the less
  prompt-engineering Seedance needs downstream. Animator inherits the
  Dramatic Intent block when chaining anchors → video.
- `[[hero-prop-canon-classification]]` — what makes an object a
  hero-grade subject vs background prop. The Emotional Read field
  applies to hero-grade objects, not to lifeless background props.
- `~/.claude/rules/common/skill-creation.md` §"Two skill flavors" —
  this skill is `flavor: process` and stays generalizable across
  series. Project-specific characters / emotions / gag thresholds
  belong to Bible + Brief, not here.
