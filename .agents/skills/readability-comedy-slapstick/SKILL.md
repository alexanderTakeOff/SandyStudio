---
name: readability-comedy-slapstick
description: Comedy/slapstick genre engine for the Creative Readability Critic (EXEC-CREAD). Supplies the cause-and-effect grammar that makes a comedy storyboard *read* — the six-stage object-causality formula, the goal-verb vs kinetic-chain-verb test, and per-check comedy interpretations of R01-R06. This is the genre engine the universal readability critic judges against; without it EXEC-CREAD HALTs.
status: ACTIVE
owner: Director
applies_when:
  agent: [EXEC-CREAD]
  genre: [comedy]
hard: false
created: 2026-06-10
---

# Readability — Comedy / Slapstick Engine

This is the genre engine the Creative Readability Critic (EXEC-CREAD) judges a
comedy storyboard against. EXEC-CREAD itself is genre-neutral: it checks the
*shape* of readability (R01-R06). This playbook tells it what "readable" means
**for physical comedy of situations** — the kind of gag that reads as funny on
the page so the animator can land it on screen.

It is the critic-side companion to the writer/storyboarder canon in
`.claude/skills/sandy-gag-library/SKILL.md` (§17 "Object-causality formula") and
`.claude/skills/storyboarder-situational-comedy/SKILL.md`. Where those teach the
*authoring* of readable gags, this teaches the *judging* of them. Keep them
consistent: this skill reuses the §17 formula and verb grammar rather than
inventing a parallel one — when in doubt, the gag library is the source of truth
and this playbook references it.

## The engine: six-stage object-causality formula

A comedy gag reads when it follows this chain (the empirically validated E02
"Tidy Tornado" formula — the positive control against E03 v01, which lost
readability). The six stages are mandatory and in order; **each is its own
visible beat**:

1. **Tiny mess** — Sandy notices ONE specific small disorder (one object, one
   surface). Not "mess in general" — a concrete thing.
2. **Overconfident shortcut** — he applies a too-fast / too-crude cleaning
   method, expressed as a **goal-verb** (sweep, wipe, stack, stuff, polish,
   scoop). The viewer reads the *intent* through the action verb.
3. **False-success beat** — Sandy believes he has succeeded. Proud nod, satisfied
   pose, one second of self-congratulation. **This is a MANDATORY separate
   beat**, NOT merged with the backfire — the audience needs a moment to believe
   in the victory before it's taken away.
4. **Object-specific backfire** — the SAME object (or the relocated mess) strikes
   back in a physically causal way. The consequence is concrete and visible on
   screen, not abstract "chaos".
5. **Accumulation (persistent state)** — each backfire leaves a persistent state
   the next gag inherits. What toppled stays toppled; what fell stays on the
   floor. Broken continuity here = broken comedy logic.
6. **Micro-victory delusion** — the resolving payoff: Sandy finds ONE tiny
   "win" amid the catastrophe and celebrates it, oblivious to the scale of the
   wreckage. Ironic resolution through false self-assessment.

## The verb grammar test (anti-E03 rule)

A comedy beat reads through a **goal-verb that an object then defeats**:

| ✅ goal-verbs (readable) | ❌ kinetic chain-verbs (unreadable) |
|---|---|
| sweep, stack, wipe, scoop, polish, stuff | spin, windmill, catapult, ricochet, cascade, pinwheel, slide |

**A beat that contains ONLY kinetic chain-verbs and no goal-verb is NOT a gag —
it is filler.** The viewer sees motion but cannot read intent, so the humour
evaporates.

Diagnostic for the critic: ask *"what is Sandy trying to DO (with the cleaning)
in this beat?"* If the answer is impossible without backstory → the beat is
unreadable → it must be re-authored with a goal-verb.

Reference (readable): E02 — sweep / stuff / stack / polish.
Anti-reference (unreadable): E03 v01 — spin / windmill / catapult / slide /
pinwheel.

## Per-check comedy interpretations of R01-R06

Apply each universal R-check through this engine:

- **R01-comedy — single readable intent.** The shot's primary action must be a
  goal-verb the audience can name ("he's trying to stack the cans"). A beat whose
  action is a kinetic-chain flourish with no nameable cleaning goal fails R01.

- **R02-comedy — beat logic follows the engine.** Every gag must answer three
  questions: *what did he try to do? why was it dumb (the overconfident
  shortcut)? how exactly did it get worse (the object-specific backfire)?* Verify
  the six stages appear in order and that the **false-success beat exists as its
  own shot** before the backfire — collapsing it into the backfire is the most
  common R02 failure. Cite the missing or out-of-order stage by name.

- **R03-comedy — visible consequence.** The backfire's result must be in frame:
  the specific object reacts visibly. An implied off-screen consequence ("and
  then everything's a mess") fails — the gag's punch must be seen, not narrated.

- **R04-comedy — object-state continuity (accumulation).** Stage 5 is exactly
  this check: each backfire's persistent state must carry into later shots. A
  toppled stack that silently stands upright again, a spill that vanishes between
  shots, breaks the accumulation that makes escalation read. Track the mess
  objects across the board and flag any silent reset.

- **R05-comedy — payoff specificity.** The micro-victory (stage 6) and every
  intermediate backfire must name a concrete object/state, never generic motion.
  "Chaos everywhere" fails; "he proudly straightens the one cup that survived
  while the shelf collapses behind him" passes.

- **R06-comedy — no empty motion.** A beat of pure kinetic flourish that neither
  expresses a cleaning goal (R01) nor delivers a backfire consequence (R03) is
  filler. If cutting the beat leaves the gag chain intact, it is empty motion —
  flag it and require a goal-verb or a consequence.

## Delivery-conditional check — vertical-safe (self-gated)

> Added 2026-07-13. This is a **composition** check, orthogonal to the causality
> checks R01-R06 above — do not fold it into them. It exists so a gag's peak
> survives a 16:9→9:16 center-crop when the episode ships Shorts (companion to
> `storyboarder-situational-comedy` §"Vertical-safe framing for Shorts delivery").

**Self-activation (no delivery-target plumbing needed).** Run this check ONLY when
the storyboard's shot list carries `vertical_safe` / `landscape_only` fields on any
shot — their *presence* is the signal that the Storyboarder treated this as a
short-target episode. If no shot carries either field, skip this check entirely (the
episode is landscape-only; the rule sleeps) and do not mention it.

**The check (text-consistency — you judge prose, not pixels).** For every shot with
`shot_role ∈ {gag, punchline}` in a self-activated storyboard:
- If the shot carries `vertical_safe: true` or `landscape_only: true` → it is
  accounted for; pass it.
- If it carries **neither** flag AND its `action_prose` stages the peak **laterally**
  (the payoff moves or spreads left↔right / across-frame / "along the counter" — i.e.
  it would fall outside the central ~31.6%-width vertical column under a center-crop)
  → **REVISE**. The peak either must be restaged on a vertical axis (top→down, stacked
  two-shot, object dropping into frame) and marked `vertical_safe`, or, if the gag is
  inherently lateral (conveyor/chase/wide-establishing), declared `landscape_only`.
- A peak with neither flag whose prose is already vertically/centrally staged is a
  missing-annotation nit, not a composition failure: note it as
  `PASS_WITH_UNCERTAINTY` (ask the Storyboarder to stamp the flag) rather than REVISE.

You cannot see the rendered frame; judge only from the action_prose's staging axis.
Do NOT import this check for episodes with no vertical_safe/landscape_only fields.

**Abstraction debt (skill-authoring honesty).** This check is *delivery-conditional*,
not *genre-specific* — it would apply to any genre delivered as Shorts. It lives in
this comedy playbook only because comedy is the sole genre today. When a second genre
ships (or a non-CREAD consumer needs it), extract it into a genre-neutral delivery
playbook that loads by delivery-target rather than by genre.

## How to write the acceptance criteria (REVISE)

When you REVISE, each criterion must name the shot and the concrete fix in this
vocabulary — e.g. "SH04: replace 'windmills the mop' (kinetic-only) with a
goal-verb the bucket defeats — e.g. 'mops the floor, the bucket he balanced on
the door tips onto him'", or "Insert a false-success beat between SH06 and SH07:
Sandy admires the stacked cans for one beat before SH07's backfire". Vague notes
("make it funnier") are not acceptable — the Storyboarder treats your criteria
as a hard contract.

For a vertical-safe REVISE, name the restage axis or the escape: e.g. "SH09
(punchline): restage vertically — the sand avalanche currently spills left→right
across the counter; stage it dropping top→down into the central column so the peak
survives the 9:16 crop, then set `vertical_safe: true`", or "SH12: the conveyor gag
is inherently lateral — mark `landscape_only: true` (it will not yield a Short)".
