---
name: readability-cosmic-horror
description: Cosmic-horror / dread genre engine for the Creative Readability Critic (EXEC-CREAD). Supplies the misreading grammar that makes a dread storyboard *read* — the five-stage misreading formula, the naming test, and per-check dread interpretations of R01-R06. This is the genre engine the universal readability critic judges against; without a matching engine EXEC-CREAD HALTs.
status: ACTIVE
owner: Director
applies_when:
  agent: [EXEC-CREAD]
  genre: [cosmic_horror]
# hard: true = this is EXEC-CREAD's genre ENGINE, not an optional playbook —
# without it the critic HALTs. `hard` skills bypass the selection step entirely
# (see lib/agents/load-skills.ts `mandatory`): the engine must never be a dice roll.
hard: true
created: 2026-07-31
---

# Readability — Cosmic Horror / Dread Engine

This is the genre engine the Creative Readability Critic (EXEC-CREAD) judges a
dread storyboard against. EXEC-CREAD itself is genre-neutral: it checks the
*shape* of readability (R01-R06). This playbook tells it what "readable" means
**for horror built on misreading** — the kind where nothing jumps out, and the
fear arrives when the audience discovers they read the world wrong.

It is the critic-side twin of `readability-comedy-slapstick`. Comedy asks *did
the gag land*; this asks *did the wrong reading form, and did it break*. Both
judge structure, never taste.

## Why this genre needs its own engine

A comedy engine scores cause-and-effect between objects. Applied here it would
fail every correct shot: in this genre the payload is not an event but a
**revision of understanding**. Nothing has to happen for the beat to work — a
motionless surface can carry the entire load — so a critic looking for a
consequence chain reports "empty motion" on exactly the frames that work.

## The engine: five-stage misreading formula

The unit of this genre is not a gag but a **misreading arc**. Verify all five
stages exist, in order, each with somewhere to live on the board:

1. **Fragment.** A partial view arrives. Its detail is specific enough to invite
   one particular wrong reading — and the frame withholds whatever would settle
   the question.
2. **Corroboration.** A second, INDEPENDENT detail confirms the wrong reading.
   This is where the audience commits. It must be its own beat.
3. **Turn.** The frame widens — by camera, by a second light, by the subject
   moving — and the reading is REPLACED, not amended. What was true a second ago
   is now visibly false, using the same evidence.
4. **Consequence.** The revealed whole acts, or conspicuously does not. Either
   way the protagonist's position in the world has changed.
5. **Loss of reference.** The frame closes without handing back a new anchor. The
   audience knows the old reading was wrong and is not given a safe replacement.

**The axis of the misreading — scale, identity, time, agency, place — is series
content, not genre content.** Read it from the series Bible; never assume one.

## The naming test (anti-atmosphere rule)

For every shot, ask: **can a viewer say, in five words, what they think they are
looking at?**

- Yes → the shot carries a reading and can be judged.
- No → the shot is atmosphere. Atmosphere is a seasoning, never a stage.

A board where several consecutive shots fail the naming test has no false
reading to break, so stage 3 cannot land. This is the single most common failure
of the genre and it is invisible to a comedy engine.

## Per-check dread interpretations of R01-R06

- **R01-dread — one reading per shot.** The shot must support exactly ONE
  nameable interpretation. A frame that hedges between two readings at once
  destroys the turn, because there is nothing single to be wrong about. Name the
  reading the shot delivers; if you cannot, R01 fails.

- **R02-dread — the arc is in order and complete.** Verify the five stages appear
  in sequence, and that the **corroboration beat exists as its own shot** before
  the turn. Collapsing it into the turn is the most common R02 failure: the
  audience never committed, so nothing breaks. Cite the missing or out-of-order
  stage by name.

- **R03-dread — the turn is SEEN, not narrated.** The replacement of the reading
  must happen in frame, on the same evidence. Prefer it inside one unbroken shot:
  a turn delivered across a cut lets the audience blame the edit instead of their
  own eyes, and the dread leaks out through that door. Flag any turn whose
  revelation happens off-screen or is asserted by text.

- **R04-dread — continuity of the WITHHELD.** Whatever the frame refuses to show
  — a scale reference, a whole body, the source of a light, a face — must stay
  refused for the entire board. One accidental reveal in an earlier shot
  retroactively voids every later one. Track the withheld set across all shots
  and flag any leak, including in prose ("we glimpse…").

- **R04b-dread — the cast must follow the reading, not the truth.** Check each
  shot's declared canon against the half it is in. A shot BEFORE the turn that
  casts the true thing's canon has spent the reveal in advance — and if that canon
  is defined by a silhouette, it will also deform the frame toward that silhouette.
  Before the turn: the false thing's canon, or an empty cast and pure description.
  Flag any true-thing slug appearing earlier than the turn shot.

- **R05-dread — specificity of the WRONG reading.** The false reading must be
  concrete enough to be stated as fact. "Something unsettling" fails; "courses of
  dressed stone, cut by hand" passes. Vagueness is not mystery — it is the
  absence of a reading, and it leaves stage 3 nothing to overturn.

- **R06-dread — no atmosphere for its own sake.** A beat that neither builds the
  false reading nor advances the turn is filler, however beautiful. Cut-test it:
  if removing the beat leaves the misreading arc intact, it is atmosphere. One
  such beat may be justified as pacing; two in a row is a finding.

## How to write the acceptance criteria (REVISE)

Each criterion names the shot and the concrete fix in this vocabulary — e.g.
"SH03: the shot states no reading (naming test fails). Give the surface one
detail that reads as manufactured, so the audience can name it as 'built'", or
"Insert a corroboration beat between SH02 and SH04: a second independent detail
confirming the built reading, before the widening in SH05 overturns it", or
"SH06: the turn is split across a cut — deliver the widening inside one shot so
the audience cannot attribute the change to the edit".

Vague notes ("make it scarier", "more tension") are not acceptable — the
Storyboarder treats your criteria as a hard contract.
