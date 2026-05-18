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

Pure description ("she stands by the window, ready") or pure ritual
("she stretches, jumps, claps") is the anti-pattern: the action goes
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
   "the 30-pound plate". Not "rope" — "the jump rope on the hook".
5. **Punctuation at the end.** Close on a beat the audience can hang a
   laugh on: a pose, a freeze, a final ricochet, a blink.
6. **Continuity baked in.** The prose tells the next shot what to
   inherit (the plate is still on the floor, the rope is still around
   his head).

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
4. **Confirm continuity carries.** The plate is still on the floor in
   the next shot. The rope is still on his head. Cascade is funny only
   if it persists.

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
