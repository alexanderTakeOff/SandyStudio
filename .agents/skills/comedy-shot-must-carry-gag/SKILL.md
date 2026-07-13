---
name: comedy-shot-must-carry-gag
description: DEPRECATED (Sprint φ 2026-05-16). The try-fail-escalation-punchline technique migrated into broader capability `storyboarder-situational-comedy` (Director's mental-model correction: skills are capability playbooks per agent, not single-rule shards).
status: DEPRECATED
owner: Director
applies_when:
  genre: [comedy]
hard: true
created: 2026-05-15
deprecated: 2026-05-16
superseded_by: storyboarder-situational-comedy
---

> **DEPRECATED (Sprint φ 2026-05-16).** Director's mental-model correction
> (2026-05-15): skills are broad **capability playbooks per agent**, not
> atomic single-rule files. This file's content — the try-fail-escalation
> microcycle, Director's worked examples (dumbbell foot-drop, jump-rope
> snap-back) — moved into the broader storyboarder capability skill
> `.Codex/skills/storyboarder-situational-comedy/SKILL.md` as one
> technique inside a fuller playbook. Selector filters by `status:ACTIVE`
> so this file is no longer matched; kept on disk for audit / rollback.

# Comedy — every non-transition shot must carry a gag

The Director's standing rule for the comedy genre. This is not a polish hint —
it is the **acceptance criterion** for any shot, beat, or paragraph that is
not a pure transition. If a shot exists in our comedy and you cannot answer
"где здесь прикол?" pointing at it, **the shot is broken and must be
rewritten before it ships**.

## The cycle (mandatory shape)

Every non-transition unit follows a microcycle of 2–6 seconds:

1. **TRY** — the character attempts something (reach, lift, jump, look).
2. **FAIL** — the attempt produces an unexpected physical consequence.
3. **ESCALATION** — the consequence cascades; one beat triggers the next.
4. **PUNCHLINE / POSE** — a clean visual punctuation that ends the cycle.

The cycle can compress into a single shot or span 2–3 consecutive shots.
What it cannot do is dissolve into description.

A shot may also legitimately be a **setup** for a later payoff, or a
**payoff** from an earlier setup. Both are valid because they participate
in a cycle whose other half is on screen elsewhere. Pure setup-with-no-
later-payoff and pure-action-with-no-setup are anti-patterns.

## Director's worked examples (canon — refer to these)

These were dictated by the Director on 2026-05-15. Treat them as the
gold standard for what a single shot's prose should look like.

### Example A — Dumbbell rack (try → fail → escalation → retry)

- ❌ ANTI-PATTERN: «Sandy picks up the dumbbell. He starts curling.»
- ✅ CANON:
  «Sandy reaches for the dumbbell. It's too heavy — slides off his palm,
  falls on his foot. He hops, spins, blows on his foot. Tries again, this
  time picking up only the BAR. The plates roll away across the floor.»

What this teaches: physical consequence (foot drop) cascades into a
secondary beat (hopping, blowing), then escalates to a tertiary visual
gag (rolling plates). One shot. One sentence per beat. No internal
states, only visible action.

### Example B — Jump rope (pull → snap → wall → head)

- ❌ ANTI-PATTERN: «Sandy grabs the jump rope and starts skipping.»
- ✅ CANON:
  «Sandy reaches for the jump rope on the hook. Pulls. It's stuck. Pulls
  harder, stretches like elastic. Snaps back, hits him in the face,
  ricochets off the wall, lands on his head like a hat. He blinks. Pose.»

What this teaches: every linear "and then" word marks a beat boundary
(Pulls → It's stuck → Pulls harder → Snaps back → ricochets → lands →
blinks → Pose). Seven beats in one shot, ending on a visual punctuation
that gives the audience time to laugh.

## Anti-patterns (REJECT)

- Description without consequence: «he stands, ready», «he is determined»
- Generic ritual: «rolls arms, cracks knuckles, marches to the rack»
- Internal-state prose: «he feels intimidated», «his confidence grows»
- Vague continuation: «continues to do X», «keeps lifting»
- Adjective stacking without verb chain: «massive, gleaming dumbbells lit
  by golden hour light filling the wide-angle frame»

A shot is broken if removing every adjective leaves no event. The verb
chain IS the comedy.

## Rule of thumb

Read your shot aloud. If you cannot insert pauses for the audience to
laugh (one per beat boundary), the shot has no comedy. Rewrite until
every 2–6 seconds contains a discrete status change you could point at
in the frame.

Comedy of situations beats comedy of dialogue. We have no dialogue.
Every gag is something the camera can SEE.
