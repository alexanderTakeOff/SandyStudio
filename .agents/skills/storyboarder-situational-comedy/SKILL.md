---
name: storyboarder-situational-comedy
description: How EXEC-SB authors comedy storyboards — micro-cycle of try → fail → escalation → punchline, per-shot prose craft, comic timing rules, and Director-canon worked examples. The Storyboarder's full playbook for visual comedy of situations.
status: ACTIVE
owner: Director
applies_when:
  agent: [EXEC-SB]
  genre: [comedy]
hard: false
created: 2026-05-16
---

# Storyboarder — Situational Comedy

This is your craft playbook for storyboarding situational comedy. It is one
of your capabilities, not a rule imposed on you. Pull this in when the
episode is comedy and your job is to break the script into shots that read
as funny on the page (so the animator can deliver them as funny on screen).

Different genres need different playbooks — comedy of situations is
**physical**, **visible**, and **rhythmic**. If you have a tragedy or
mood-piece skill in your repertoire, that one applies elsewhere; the
techniques below assume the audience laughs at what they see.

## When to apply this skill

- The series genre is comedy (situational, slapstick, screwball, Pink-Panther-style).
- You are decomposing a script into per-shot `action_prose` plus per-shot
  `expected_gag`, `shot_role`, `camera_*`, and `key_beat` fields.
- The Brief or Style Bible flags physical comedy as the dominant register.

If the episode is dialogue-led or mood-led, this playbook is the wrong
choice and you should activate a different one (or none).

## The micro-cycle: try → fail → escalation → punchline

Every non-transition shot in a comedy storyboard ideally participates in a
**2-6 second micro-cycle**:

1. **TRY** — the character attempts something (reach, lift, jump, look).
2. **FAIL** — the attempt produces an unexpected physical consequence.
3. **ESCALATION** — the consequence cascades; one beat triggers the next.
4. **PUNCHLINE / POSE** — a clean visual punctuation that ends the cycle.

The cycle can live inside a single shot or span 2-3 consecutive shots. A
**setup** shot is valid if the **payoff** lands later in the sequence —
both halves participate in one cycle even when they are not adjacent.

Pure description ("the character stands by the window, ready") or pure ritual
("the character stretches, jumps, claps") is the anti-pattern: the action goes
nowhere and the audience has nothing to laugh at.

## Per-shot prose craft

When you write each shot's `action_prose`, run through this checklist:

1. **Verb chain present.** Count the verbs that drive visible motion.
   Three to seven verbs for an action beat; one or two for a reaction
   that ends on a pose.
2. **Each verb is a status change.** "He stands" is not a status change.
   "He lifts → it slips → falls on foot" is three status changes.
3. **No internal states.** Strip every word that names a feeling. The
   animator draws what the camera sees. Replace "he feels intimidated"
   with the physical consequence: the rack is so tall the dumbbells are
   out of reach, he tiptoes, the shelf tips.
4. **Concrete props.** Name the prop and what it does. Not "weight" —
   "the 30-pound cast-iron weight disc". Not "rope" — "the jump rope on
   the hook". Concrete means *unmistakable to someone who has never read
   your Bible* (see rule 7) — not merely specific.
5. **Punctuation at the end.** Close on a beat the audience can hang a
   laugh on: a pose, a freeze, a final ricochet, a blink.
6. **Continuity baked in.** The prose tells the next shot what to
   inherit (the weight disc is still on the floor, the rope is still
   around his head).
7. **Never write a word the world already owns.** Your prose is read by an
   image generator that has never seen your Bible. It resolves every noun
   with its OWN priors, and when a canon term also names a common everyday
   object, the everyday object wins — every time. So bind the word on first
   use **in that shot**: give it material, colour, or geometry. If you can't
   bind it, don't use it — pick a word the world doesn't already own.
   **Shots render INDEPENDENTLY.** A binding you wrote in SH04 does not
   travel to SH05. Re-bind in every shot that names the thing.

   Director's rule (2026-07-17): a term with two meanings is banned from
   `action_prose`. When the render comes back wrong, the ambiguity is the
   author's bug — never the generator's. It drew exactly what you wrote.

   Worked failure — E30, the same word, two shots, two fates:
   - SH04 wrote "Sandy's foot descends onto the **Dusty Violet** plate".
     Bound by colour → rendered correctly: a violet floor slab liquefying.
   - SH05 wrote "**the plate itself** bulges upward like a trampoline".
     Bare → the generator drew a literal **dinner plate** holding yellow
     goo, and dropped the trampoline launch entirely. The gag died.

   Count the meanings that one word carries: in a gym "plate" is a weight
   disc; on a hex-slab planet it is the floor; in a camera note a "flat
   plate" is a composition; to a generator with no context it is tableware.
   Four meanings, one word, and no glossary in the room. Write "the
   hexagonal floor slab under his foot" and the trap is gone. (Rules 4 and 6
   above used to say "plate" — they are rewritten, because this skill was
   itself laying the trap it now warns about.)
8. **No canon image behind it → describe it fully, in-shot.** The Reference
   Designer locks a thing one of two ways: either the shot's `props_in_frame`
   names a Bible object that HAS a LOCKED reference image (its pixels get
   attached at generation, so it can't be hallucinated), or — for everything
   else — the ONLY definition the generator receives is your prose. A prop
   that is not a canon object with an image (a transient item the action
   introduces, a new substance, a one-shot gizmo) falls entirely on the
   prose: it MUST carry material + colour + geometry inline, because nothing
   downstream will supply them. "A jelly" is under-specified; "a wobbling
   translucent violet jelly the size of a manhole cover" is a contract.
   Do NOT list a non-canon item in `props_in_frame` expecting it to lock —
   there is no image to attach; the field is for Bible objects only.
9. **A canon thing that TRANSFORMS must name its source.** When a shot melts,
   inflates, shatters or recolours something that IS canon (a location floor,
   a Bible prop), the generator only ties the new state to the locked colour/
   shape if your prose names the source object. "The violet floor slab
   liquefies into violet jelly" keeps the tie; "jelly plate" severs it and
   the generator repaints the substance from its own priors. Name the source,
   carry its canonical colour into the new state, THEN describe the change.
   (E30 SH05: "jelly plate" cut the tie to the locked violet floor, so the
   jelly rendered in the character's OWN gold — the one colour it must never
   be. The location anchor already held the right colour; the prose threw it
   away.)

A good `action_prose` reads like a stage direction for an animator
working in 2D limited animation: concrete, sequential, ending on a pose.

## Comic timing — letting the joke land

Match `camera_movement` and `duration_seconds` to the function of the
shot inside the micro-cycle:

- **Reaction / punchline shots** — prefer `static_locked_off`. Never let
  the camera compete with the face or the gag. The comic stop IS the
  punctuation; movement smears it.
- **Setup shots** — `slow_push_in` or `slow_pullback_reveal` works.
  The camera is doing the noticing the audience does.
- **Escalation shots** — `whip_pan_recover`, `rapid_shake_static_burst`,
  `dolly_with_subject`. The camera flinches with the cartoon, then
  recovers.
- **Reuse for visual rhymes.** If a setup→fail→escalation chain repeats
  (same trap a second time), the camera should repeat its move too —
  the repetition itself is part of the joke.
- **Duration breathes around the punchline.** Punchline shots can run
  slightly longer than action shots (~2-3s vs. 1-1.5s) — the laugh
  needs a beat.

## Camera VARIETY across shots — angle / orbit / vantage (anti-flat-plate)

> Added 2026-06-09 after a systematic defect: 22 shots in ONE bedroom (SS-S15-E03)
> came out with near-identical flat angles → the downstream Reference Critic
> REVISE-flagged 12 of them for insufficient camera variation. Root cause was
> HERE (storyboard), not downstream — the reference designer only inherits the
> angles the storyboard declares. The section above governs camera *movement per
> shot's comic function*; THIS governs camera *angle/vantage variation ACROSS
> the sequence*. Both must hold.

The rule: **consecutive shots — and ESPECIALLY multiple shots sharing one
location — must deliberately shift camera angle, height, and vantage so the
sequence does not read as one repeated flat plate.** Sand-physics comedy lives
on reading the space from new angles as the chaos escalates.

For every shot, when ≥2 shots share a `location`:
1. Look at the sibling shots' `camera_angle` + sub-area already chosen.
2. Pick a **deliberately different** vantage — change at least one of: angle
   (eye-level ↔ high ↔ low ↔ overhead), orbit position around the subject,
   or framed sub-area of the room (drawer wall ↔ bed ↔ vanity ↔ under-bed).
3. Never emit the same `camera_angle` for two consecutive same-location shots
   without an explicit in-shot reason (a deliberate repeat-for-rhyme per the
   Comic-timing section is the only exception, and must be labelled as such).

**Apply the project's camera-orbit signature** declared in the Style Bible
(SandyStudio: most shots favour an orbit / vantage drift; static frames need a
justification). Read the threshold and the orbit vocabulary from the Bible —
do NOT invent your own. If the Bible declares no camera signature, flag it
rather than defaulting to static repetition.

Cost of ignoring this: flat-plate fan-out → Reference Critic REVISE loops →
wasted regeneration. Variation is cheaper authored here than patched downstream.

## Vertical-safe framing for Shorts delivery (conditional)

> Added 2026-07-13. Origin: the first batch of Shorts read weak because they were a
> blind center-crop of a landscape episode — the sides, and the action living in them,
> were thrown away. The fix is HERE (staging), not in the cutter: if the gag's peak is
> composed to survive a vertical crop, the SAME landscape shot yields a native-quality
> Short at ≈ zero extra render cost. This governs *framing for a vertical crop*; the
> two camera sections above still govern movement and angle-variety — all three hold.

**When this rule is awake.** Only when the current episode's delivery targets include a
vertical/Shorts surface (the 9:16 delivery family named in the glossary —
`youtube_shorts` / `instagram_reels` / `tiktok`). The runner tells you whether the episode
is a short-target; do not assume. For a landscape-only episode this rule **sleeps entirely**
— storyboard for full 16:9 as usual and emit none of the flags below.

**What it constrains — peaks only, never whole shots.** The constraint rides ONLY the
gag/punchline PEAK beats (`shot_role ∈ {gag, punchline}`) — the 3-5 moments a Short is built
around. Every other shot breathes the full 16:9 frame. And within a marked shot it is only
the **peak FRAME** that must read inside the central vertical-safe column — NOT the whole
trajectory. The central column is the 9:16 center-crop of the frame: the middle **~31.6 % of
the width** (a 16:9→9:16 center-crop keeps full height and 9/16 ÷ 16/9 = 81/256 of the width;
≈ 608 px of 1920 at 1080p). This is exactly what dissolves the tension with the camera-orbit
signature above: the camera still orbits and sweeps the subject across frame — you only
guarantee that at the gag's punctuation the payoff lands inside that central keyhole, staged
**vertically** rather than by a lateral spread.

**Three-branch triage per marked peak** — do NOT collapse to a center-safe / landscape-only
binary:
1. **already center-safe** — the peak naturally lands in the central column → `vertical_safe: true`.
2. **restage-vertical** — change the staging AXIS, not the gag: a left→right move becomes
   top→down; a spread two-shot becomes a stacked one; the object drops INTO frame instead of
   sliding ACROSS it. Free on the page, the laugh is preserved. **Always attempt this before
   surrendering a beat to branch 3** — it is what turns a landscape episode into native Shorts.
   Peak now reads in the column → `vertical_safe: true`.
3. **inherently lateral** — a conveyor travelling across, a chase, a wide-establishing reveal
   whose whole joke IS the horizontal space. Do NOT deform the composition to force it vertical
   → `landscape_only: true`. That beat simply won't yield a Short, and that is an acceptable,
   *declared* outcome — not a failure.

**Predict fitness from the gag's kind (don't guess frame-by-frame).** Read the beat's gag
category against the project gag library *before* you stage it, and let it set your expectation:
gravity / vertical-native gags (sand falling, stacking, dropping) are already column-friendly;
body- and status-centred gags are axis-agnostic and restage to vertical trivially (branch 2);
gags whose engine is horizontal travel (chases, conveyors, "walks the length of…") are the usual
branch-3 laterals. Category sets the expectation; the peak frame confirms it.

**Emit the flags.** On every gag/punchline peak in a short-target episode, set `vertical_safe:
true` (branches 1/2) or `landscape_only: true` (branch 3). Leaving a peak with neither flag in a
short-target episode is an omission the readability critic will bounce back.

## Shorts retention shape — the first second and the length (conditional)

> Added 2026-07-23. Origin: Head-of-Growth pulled REAL retention on the two aged Shorts
> with enough processed data (Red Tape 52s, Car Wash 75s). Both bled 30-60% of viewers
> inside the first 10-20% of the clip, and `relativeRetentionPerformance` sat at/below the
> platform median (Car Wash bottom-15% at 75s; the shorter 52s Red Tape held ~2× better).
> Below-median retention is WHY the algorithm caps a Short at its ~1k test-push and it
> converts ~0 subscribers. This rule governs the Short's TIME axis; the vertical-safe rule
> above governs its SPACE axis — both hold on a short-target episode.

**When awake.** Same trigger as vertical-safe: only when delivery targets include a 9:16/Shorts
surface. Sleeps entirely for a landscape-only episode.

**Three constraints on a short-target storyboard:**
1. **Hook in the first beat.** The most intriguing / "what goes wrong" frame lands in shot 1,
   second 0-1 — no establishing runway, no slow build. The opening shot IS the hook; the first
   ~10% of the clip is where the most viewers leave.
2. **Tease the payoff up front.** The laugh that lands late (aged data: retention *rises* near the
   end for those who stay — the ending works, too few reach it) must be foreshadowed in the
   opening beat, so the viewer has a reason to stay for it.
3. **Cut to the gag — target ≤ ~35s of peak beats.** Length is the silent killer: the 75s cut bled
   to bottom-tier retention; the 52s held ~2× better. Drop dead air and setup shots that don't carry
   the hook — one tight try → fail → escalation → punch, not the full landscape runtime.

Provisional (2 aged data points + a strong length correlation) — firm up when the recent Shorts
clear the ~2-3 day Analytics lag. Feeds the growth loop: retention above the median is what unlocks
algorithmic escalation and therefore subscriber conversion.

## Worked examples — Director's canon

These examples are dictated by the Director on 2026-05-15. Treat them as
**samples to aspire to**, not as templates to copy verbatim.

### Example A — Dumbbell rack (try → fail → escalation → retry)

- ❌ Mundane: «Sandy picks up the dumbbell. He starts curling.»
- ✅ Canon:
  «Sandy reaches for the dumbbell. It's too heavy — slides off his palm,
  falls on his foot. He hops, spins, blows on his foot. Tries again, this
  time picking up only the BAR. The plates roll away across the floor.»

What this teaches: physical consequence (foot drop) cascades into a
secondary beat (hopping, blowing), then escalates to a tertiary visual
gag (rolling plates). One shot. One sentence per beat. No internal
states — only visible action.

### Example B — Jump rope (pull → snap → wall → head)

- ❌ Mundane: «Sandy grabs the jump rope and starts skipping.»
- ✅ Canon:
  «Sandy reaches for the jump rope on the hook. Pulls. It's stuck. Pulls
  harder, stretches like elastic. Snaps back, hits him in the face,
  ricochets off the wall, lands on his head like a hat. He blinks. Pose.»

What this teaches: every linear "and then" word marks a beat boundary
(Pulls → It's stuck → Pulls harder → Snaps back → ricochets → lands →
blinks → Pose). Seven beats in one shot, ending on a visual punctuation
that gives the audience time to laugh.

### Example C — Good `action_prose` shape

```
"action_prose": "Sandy plants both feet under the bar. Squats, grips.
Lifts. The bar bends like a banana. Plates slide off both ends
simultaneously, rolling toward camera. Sandy is left holding a slack
metal noodle. He blinks at it. POSE: the empty bar drooping in his
hands, plates rolling out of frame."
```

Notice: six verbs, one pose, zero adjectives describing his feelings,
and the next shot already knows where the plates are.

## Common pitfalls

Watch for these in your own draft before submitting:

- **Marching prose.** «Sandy rolls his arms, cracks his mitten-hands,
  marches to the dumbbell rack.» This is choreography, not comedy. It
  describes the character entering a state ("ready to lift") without
  any physical jeopardy. Rewrite so the trip TO the rack contains a
  micro-stumble or so the lift IS the gag.
- **Adjective wallpaper.** «Massive, gleaming dumbbells lit by golden
  hour light fill the wide-angle frame.» The animator will draw exactly
  what you wrote, and the result is wallpaper, not comedy. Adjectives
  describe; verbs joke.
- **State without consequence.** «He is intimidated by the size of the
  rack.» You don't draw intimidation; you draw the consequence. Cascade.
- **Generic ritual.** «Pre-workout routine: stretches, jumps, claps.»
  Routines are not jokes. Each ritual must FAIL in a specific way (the
  stretch dislocates, the jump dents the ceiling, the clap echoes back
  as feedback).
- **Mismatched camera.** A punchline shot with a whip-pan camera burns
  the joke. A setup shot with a static camera lets the audience get
  ahead of you.

## Self-check before submitting

Run this pass over the storyboard as a whole, not just per-shot:

1. **Read each shot aloud.** Insert audience pauses at every "and then" /
   beat boundary. If you can't find pauses, the shot has no rhythm.
2. **Point at the joke.** For every shot with `shot_role: "gag" | "punchline"`,
   you must be able to point at the verb in the prose that makes it funny.
   If `expected_gag` is non-null, the prose must visibly deliver it.
3. **Locate setups and payoffs.** Each setup should have a payoff later
   in the sequence; each payoff should have a setup earlier. Orphans
   are a sign of broken cycles.
4. **Confirm continuity carries.** The weight disc is still on the floor
   in the next shot. The rope is still on his head. Cascade is funny only
   if it persists.
4b. **Hunt your own ambiguous nouns (craft rule 7).** Go noun by noun and
   ask: *would a stranger who has never read the Bible draw this the way I
   mean?* Any noun that also names a common object — plate, bar, ring,
   spring, board, cell, crown, mount, chip — must carry a disambiguating
   descriptor **in every shot that names it**, not just the first one that
   introduced it. Grep the storyboard for each such noun and check the hits
   one by one; the shot that renders wrong is always the bare one.
5. **False-success beat is its OWN shot (formula stage 3).** For every
   try→backfire gag, point at the dedicated `reaction`/`pose` shot where
   Sandy believes he succeeded — it must sit BEFORE the backfire shot,
   never share a shot with it. If stage 3 and stage 4 live in one shot,
   SPLIT them (extend the shot count; see «False success is its own
   shot — hard rule»). This is the single most-bounced readability
   failure (R02) — catch it here, before the critic does. A gag with no
   separable false-success beat (pure reaction, no prior belief) is
   exempt; say so in the shot's `key_beat` so the omission reads as
   deliberate.
6. **Vertical-safe peaks (short-target episodes only).** For every shot
   with `shot_role ∈ {gag, punchline}`: is the peak frame staged inside
   the central vertical-safe column (→ `vertical_safe: true`) or
   explicitly declared `landscape_only: true`? No unflagged peak may
   ship in a short-target episode. (Skip this check entirely when the
   episode is landscape-only — the rule sleeps.)

## E02 formula at shot level

Each shot must declare which stage of the object-causality formula it serves.
Use the shot's `shot_role` and `key_beat` fields to make this explicit. The
six stages map to shot assignments as follows:

| Formula stage | Shot role | Requirement |
|---|---|---|
| 1. Tiny mess | `setup` | Names the specific object/disorder Sandy notices |
| 2. Overconfident shortcut | `gag` | action_prose leads with a **goal-verb** (sweep/stack/wipe/scoop/polish) |
| 3. False success | `reaction` or `pose` | Sandy believes he succeeded — **must be its own shot**, never folded into the backfire shot |
| 4. Object-specific backfire | `gag` or `punchline` | The SAME object strikes back; consequence is concrete and screen-visible |
| 5. Accumulation | any subsequent shot | action_prose acknowledges persisting state from previous backfire |
| 6. Micro-victory delusion | `punchline` | Sandy celebrates a tiny win, misreading the scale of the disaster |

### False success is its own shot — hard rule

Never fold the false-success beat into the backfire shot. They serve opposite
emotional functions: false success builds the audience's false belief; backfire
destroys it. Merging them skips the belief-building step and the joke lands
flat. If the storyboard has fewer shots than stages require, extend the shot
count rather than merging these two.

### Goal-verb test for action_prose

Before finalising each `action_prose` for a gag or punchline shot, check:
- Does the prose contain at least one goal-verb (sweep, stack, wipe, scoop,
  polish, stuff, sort, fold, mop, scrub)?
- If the prose contains ONLY kinetic chain-verbs (spin, windmill, catapult,
  ricochet, cascade, pinwheel, slide, launch, fling, bounce) and no goal-verb,
  rewrite it. Kinetic motion without a readable cleaning intent is filler,
  not comedy.

### Object-state continuity across shots

Each shot's aftermath must be visible in subsequent shots' descriptions. Write
the persistent state explicitly in the action_prose of shots that inherit it:
- "The mop is still tangled around his leg from the previous beat."
- "The toppled stack of boxes remains in the background."
Continuity is what makes accumulation (stage 5) land — the audience needs to
SEE the chaos growing, not imagine it.

## Cross-references

- Style Bible camera vocabulary — your `camera_*` field values must come
  from it; this playbook only tells you which to pick when.
- Brief mandatory beats — every beat the Brief lists must be visibly
  delivered by at least one shot's prose. The skill doesn't override
  the Brief.
- Shot schema (`specs/schemas/shot.md`) — field contracts. Skill is HOW;
  schema is WHAT-fields.
- `seedance-prompting` skill (sibling capability for the Animator
  downstream) — your prose feeds Seedance prompts later; concrete verbs
  age well, vague descriptions don't.
