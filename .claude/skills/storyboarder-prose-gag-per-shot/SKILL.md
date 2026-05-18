---
name: storyboarder-prose-gag-per-shot
description: DEPRECATED (Sprint φ 2026-05-16). The action_prose verb-chain technique migrated into broader capability `storyboarder-situational-comedy` as a section.
status: DEPRECATED
owner: Director
applies_when:
  agent: [EXEC-SB]
hard: true
created: 2026-05-15
deprecated: 2026-05-16
superseded_by: storyboarder-situational-comedy
---

> **DEPRECATED (Sprint φ 2026-05-16).** Director's mental-model correction:
> skills are broad capability playbooks. This file's prose-craft techniques
> (verb chain, status changes, no internal states, concrete props, end-pose
> punctuation) moved into the broader `storyboarder-situational-comedy`
> playbook as a dedicated section. Selector filters by `status:ACTIVE` —
> this file no longer matches.

# Storyboarder — per-shot prose must carry the gag

This is your *creator-stage* discipline. The comedy genre skill tells you
WHAT to write (a try-fail-escalation-punchline microcycle). This skill
tells you HOW to write the per-shot `action_prose` paragraph in the
storyboard JSON so the downstream animator can SEE the joke.

## Core question, every shot

For every shot whose `shot_role` is not `transition`, answer this one
question before you finish the paragraph:

> **Where is the joke?** Point at the verb in your prose. Name the
> physical status change that makes it funny.

If the answer is "it's about Sandy's mood" or "it's establishing
location" or "it shows him being determined" — the shot is broken.
Rewrite the paragraph as a verb chain.

## Authoring checklist (apply to every action_prose)

Before submitting a shot, walk this list:

1. **Verb chain present.** Count the verbs that drive visible motion.
   Three to seven verbs per shot for an action beat; one or two for a
   reaction shot ending on a pose.
2. **Each verb is a status change.** "He stands" is not a status change.
   "He lifts → it slips → falls on foot" is three status changes.
3. **No internal states.** Strip every word that names a feeling. The
   animator can only draw what the camera sees.
4. **Concrete props.** Name the prop and what it does. Not "weight" —
   "the 30-pound plate". Not "rope" — "the jump rope on the hook".
5. **Punctuation at the end.** End on a beat the audience can hang a
   laugh on: a pose, a freeze, a final ricochet, a blink.
6. **Continuity baked in.** The prose tells the next shot what to inherit
   (the plate is still on the floor, the rope is still around his head).

## Anti-patterns to reject in your own prose

Catch these in yourself before you ship:

- **Marching prose.** «Sandy rolls his arms, cracks his mitten-hands,
  marches to the dumbbell rack.» This is choreography, not comedy. It
  describes the character entering a state ("ready to lift") without
  any physical jeopardy. Rewrite so the trip TO the rack contains a
  micro-stumble or so the lift IS the gag.
- **Adjective wallpaper.** «Massive, gleaming dumbbells lit by golden
  hour light fill the wide-angle frame.» The animator will draw exactly
  what you wrote, and the result will be a wallpaper, not a comedy
  shot. Adjectives describe; verbs joke.
- **State without consequence.** «He is intimidated by the size of the
  rack.» You don't draw intimidation; you draw the consequence. The
  rack is so tall the dumbbells are out of reach. He tiptoes. The
  shelf tips. Cascade.
- **Generic ritual.** «Pre-workout routine: stretches, jumps, claps.»
  Routines are not jokes. Each ritual must FAIL in a specific way
  (the stretch dislocates, the jump dents the ceiling, the clap
  echoes back as feedback).

## What a good action_prose looks like (for storyboarder@v2)

A good `action_prose` field reads like a stage direction for an
animator working in 2D limited animation. Concrete, sequential,
ending on a pose.

```
"action_prose": "Sandy plants both feet under the bar. Squats, grips.
Lifts. The bar bends like a banana. Plates slide off both ends
simultaneously, rolling toward camera. Sandy is left holding a
slack metal noodle. He blinks at it. POSE: the empty bar drooping
in his hands, plates rolling out of frame."
```

Notice: six verbs, one pose, zero adjectives describing his feelings,
and the next shot already knows where the plates are.

## Cross-reference

If the genre `comedy-shot-must-carry-gag` skill is also active for this
run (it should be — SandyStudio is a comedy series), both apply
simultaneously:
- That skill defines the rule (try-fail-escalation-punchline).
- This skill is its concrete embodiment for your action_prose paragraphs.

If you ever produce a paragraph that satisfies the genre rule at the
shot-list level but fails the prose-level checklist above, you have
broken this skill. Rewrite the prose, not the structure.
