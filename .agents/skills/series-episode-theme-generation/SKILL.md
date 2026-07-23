---
name: series-episode-theme-generation
description: >-
  Generate a rich, divergent pack of episode theme candidates ("gag engines")
  for an animated series — bold brainstorming of repeatable visual-comedy
  machines, not safe single ideas. Use this skill WHENEVER the Director or a
  production assistant (e.g. Polina) wants to brainstorm, come up with, propose,
  invent, or "fill the idea bank" with episode themes / ideas / concepts for a
  series — even if "theme" isn't said (e.g. "накидай идей для эпизодов",
  "придумай темы", "что бы нам снять дальше", "нужны идеи на серию"). Built for
  scale (tens–hundreds). This skill only PRODUCES candidates and never assigns
  the final verdict — its partner `series-episode-theme-selection` coldly judges
  and picks. Series-aware: reads the series Bible for world / character physics /
  laws; never hardcodes a single series or video provider.
flavor: process
status: ACTIVE
---

# Series Episode Theme Generation

## Purpose

Produce **episode-worthy gag engines**, not "interesting ideas". A gag engine is a
repeatable comedy machine: a concept that can spawn many distinct visual gags,
exploit the hero's specific body, carry a simple arc, and survive translation into
shots.

> Bad: "Sandy gets stuck in an elevator."
> Good: "Sandy wants the elevator; it almost obeys every command but always with a
> visibly wrong reaction (doors too early / too late / jaws-narrow; wrong floor
> lights; cab stops unpredictably) until it accidentally delivers him right."
> The second is stronger because it is a **machine that keeps producing gags.**

## Stance — bold and divergent

Generate **many** candidates and vary them widely. Do **not** self-censor for
production safety yet, and do **not** score or rank your own output. The mind that
invents a theme is biased to love it — so judging is deliberately a *different
skill* (`series-episode-theme-selection`). Your job is breadth and inventiveness;
the cold verdict happens downstream.

## Inputs (resolve before generating)

Resolving *which series* is the caller's job — assume you're told. Then read, do not
restate:

| Input | Source |
|---|---|
| `series` + Bible | the active project's Bible (`bibles/world`, `bibles/characters`, `bibles/style`). Laws, hero physics, production prefs come from here — by reference. |
| `runtime_target` | episode length — drives how much gag capacity each candidate must show. |
| `theme_bank` | already-made / already-proposed themes (default: the series idea bank file, `episode_ideas.md`). **Avoid re-proposing these engines** — *but only once the studio is mainstream.* Compatibility gate (read the `studio_version` flag — `config/defaults.yaml → studio.version`, summary CLAUDE.md §6): below 1.0 the studio is in research phase, legacy episodes E01–E12 are experiments, **not** a catalog to dodge — generate freely. Novelty enforcement starts at `studio_version >= 1.0`. |
| recent feedback | the `Feedback To Creator` notes from recent selection reports, if any — steer away from over-used patterns, toward under-used ones. |

## Aim every candidate at the judge's gates

Generate *toward* what `series-episode-theme-selection` will check, so your pack
survives the cold pass. Don't re-derive the gate definitions here — that skill owns
them — but keep them in mind as you invent: **actionability · visibility ·
gag-engine capacity · series fit · character physical fit · silent readability ·
production simplicity · novelty vs the bank.** A candidate that obviously fails one
of these is wasted generation.

## Variety mandate

Vary the **dominant gag engine** across the pack — don't hand in ten machines that
"almost obey". Pull deliberately from the series' gag families (for Sandy: the
taxonomy in `sandy-gag-library` — wrong-reaction, almost-works, overcorrection,
environment-as-opponent, body-mismatch, letting-go). A pack with one engine in six
costumes is a weak pack.

## Reuse, don't re-derive

Call the knowledge that already exists; don't rewrite it:

- **Episode formula** (goal → antagonist → wrong reaction → escalation → punch) →
  `episode-local-antagonist-engine`.
- **Gag families, forbidden gags, body physics** → `sandy-gag-library`.
- **Laws, hero physics, production prefs** → the **series Bible**, by reference.
- **Stable entity IDs** (`THEME-*`, `OBJ-*`, `CHR-*`, `LOC-*`, `LAW-*`) → the
  **Identifier Convention** (glossary). Reuse existing IDs; mint a new `THEME-*` per
  candidate.

## Canon physics guardrails (read the Bible critically)

The Bible exaggerates — hyperbole is welcome, but a physics-break needs a **real
cause**. For Sandy specifically (correct the Bible's over-hyperbole here):

- Sandy's body is a **SEALED glass bulb** (hourglass) + **rubber limbs**. Nothing
  gets in or out under normal conditions — no rain reaching the sand, no sand
  spilling/leaving trails, no "cement" from water on rubber legs, unless an explicit
  crack with a real cause.
- Sand **pours / sifts / shifts** between chambers — it does **not** slosh like
  liquid. Internal sand is legit mainly as a **balance / timing** beat (the hourglass
  runs down → centre of gravity drifts). Use it **sparingly**.
- **Prefer EXTERNAL causes.** Sandy-comedy comes from the outside world acting on his
  **form** — rubber limbs, top-heavy glass body, transparency, glass surface — not
  from over-relying on the sand inside him. A failure caused by an external object is
  stronger than one hand-waved onto his interior.

## Seeding from the theme catalog

A `THEME-*` catalog of engine *kernels* (objects / mechanisms / nature / spaces /
abstract conflicts) may be supplied as a **seed list** — a SUBJECT axis. Your job is
to add the **ENGINE axis** (the gag mechanism), the `LAW-*`, the payoff, and the
canon-physics check, turning a bare kernel (`THEME-Kitchen`) into a full candidate.
A catalog kernel is **not** an approved theme — it is raw material that still must
clear the judge's gates. Subject × Engine × Law = a real candidate.

## Provider-agnostic by construction

Don't invent themes that lean on a named tool. Think in **start state → end state**
(pose A → pose B), short controllable shots, stable hero identity, simple geometry.
If a concept only works with one specific generator, it's fragile — drop it.

## What each candidate must contain

Hand the selection skill a clean, judgeable candidate — the contract it consumes:

```markdown
# Episode Theme Candidate — THEME-{Name}

## Theme ID — `THEME-{Name}` (stable entity id; mint per Identifier Convention)
## Core Goal — what the hero wants (simple, concrete)
## Antagonist — the `OBJ-*` / `LOC-*` / system / space that almost helps
## Gag Engine — the repeatable wrong-reaction mechanism (the ENGINE axis)
## Why It Fits This Hero — how the EXTERNAL world acts on the hero's FORM
## Series Law — which `LAW-*` it expresses
## Participating Entities — `CHR-*` / `OBJ-*` / `LOC-*` referenced
## First-Frame Hook — the single clearest opening image
## Ending Payoff — accident / reversal / surrender resolution
## Gag-Bank Potential — distinct mechanism-GROUPS (not a flat count), each extensible
## Production Shape — one location? one main prop? reusable assets?
```

## Output

A pack of candidates in the contract above — **no verdicts, no tiers, no scores.**
Hand off to `series-episode-theme-selection` for cold judging and curation.
