---
name: series-episode-theme-selection
description: >-
  Coldly evaluate and select episode theme candidates for an animated series.
  Judge each candidate against binary production gates (actionability, visibility,
  gag-engine capacity, series fit, character physical fit, silent readability,
  production simplicity, novelty vs the existing theme bank), assess production
  economy and pipeline-capability feasibility, assign a tier (A/B/C/D), write a
  short report, and curate the best A/B shortlist. Use this skill WHENEVER the
  Director or a production assistant wants to evaluate, score, compare, pick,
  rank, curate, or sanity-check episode themes / ideas (e.g. "оцени эту тему",
  "какую из этих выбрать", "отбери лучшие", "стоит ли это снимать", "is this
  theme worth making", "rank these ideas"). Owns the judging criteria that
  `series-episode-theme-generation` aims at. Series-aware: reads the series Bible;
  provider-agnostic — judges capability invariants, never a named provider.
flavor: process
status: ACTIVE
# 2026-07-29: was UNSCOPED — see the sibling generation skill. An absent
# `applies_when` is a wildcard and polluted every agent's manifest.
applies_when:
  agent: [EXEC-CONC]
---

# Series Episode Theme Selection

## Purpose & stance

Decide which themes are **episode-worthy gag engines** and which only look clever.
The stance is **cold and production-paranoid**: treat every candidate as if a
stranger wrote it (including ones the same session just generated). The generator
is bold by design; you are the brake. Your output is a **tier + a short report**,
and the report is written for two readers — the Director **and the next generation
batch.**

## Inputs (treat this as a pure function)

| Input | Source |
|---|---|
| `candidate(s)` | from `series-episode-theme-generation`, or pasted by the Director. |
| `series` + Bible | the active project's Bible — laws, hero physics, production prefs, by reference. Resolving the series is the caller's job. |
| `runtime_target` | drives the gag-capacity bar. |
| `theme_bank` | already-made / already-proposed themes (default `episode_ideas.md`) — the basis for the novelty check. |
| `capability_profile` | abstract production capabilities of today's pipeline — read from the repo's provider/capability registry. **Never name a provider.** |
| cost model | the project's existing per-episode cost model — for the economy check. |

If a required input is missing, **stop and ask.** A missing series, Bible, runtime,
or bank turns every gate into a guess.

## Step 0 — cluster by engine before judging anything

Group the incoming candidates by their **underlying engine**, not their props, and judge
one representative per cluster (carry the others as variants). `THEME-Elevator`,
`OBJ-Automatic_Door` and `OBJ-Turnstile` are one engine — *a threshold that almost
obeys* — in three costumes. Judging them separately spends three passes to reach one
verdict and quietly inflates the shortlist. Clustering first is also the cheapest form
of the novelty check below.

## Pass / Fail gates (binary — these decide the tier, not a number)

A theme must clear **every** gate to reach tier A. They are binary and physical on
purpose: checkable, unlike a vanity score.

1. **Actionability** — the hero can *physically act* (press, pull, squeeze, climb,
   dodge, catch, overcorrect…). Fail themes built on thinking, talking, remembering,
   reading, or invisible emotion.
2. **Visibility** — reads in 0.5–1 s on a phone: big objects, clear silhouettes,
   visible state changes, strong before/after poses. Fail tiny-detail, text-dependent,
   interface-fiddly humour.
3. **Gag-engine capacity** — see proof below. Fail one-gag themes pretending to be
   episodes.
4. **Series fit** — expresses at least one of the series' laws (from the Bible) and
   would lose its point with a generic character.
5. **Character physical fit** — the EXTERNAL world acts on the hero's **form**. For
   Sandy: a **sealed glass bulb** (hourglass) with **rubber limbs**, top-heavy,
   transparent — comedy from rubber overreach, top-heavy tipping, transparency
   confusion, glass surface, and (sparingly) the internal sand as a balance/timing
   beat. **FAIL** themes that depend on internal-sand hand-waving (spilling, "cement"
   from water, sloshing) or any physics-break without a real cause — the Bible
   over-hyperbolizes internal sand; do not inherit that. A failure caused by an
   external object beats one hand-waved onto his interior. **Sandy-specificity for
   tier A can come from his FORM (rubber / glass / top-heavy / transparent) OR his
   CHARACTER — his motives, behavioural patterns and social drives (the control-freak
   / vain nature behind the series laws, gate 4).** Demote to B only if **neither** is
   load-bearing — i.e. the theme would play identically with a generic character AND
   engages none of his motives. Don't over-index on form: Tom & Jerry runs on
   character, not anatomy.
6. **Silent readability, on BOTH layers** — works with zero dialogue, signs, or wordplay,
   and carries two layers at once: a **mechanical layer** a child reads as pure action,
   and a **social layer** an adult recognises as familiar human behaviour (pretending to
   be competent · refusing help · protecting ownership · following a rule too literally).
   FAIL a candidate whose social layer is a *message* rather than a *behaviour* ("society
   is unfair" is not a social layer), and FAIL one that is a clean stunt with no human
   behaviour under it — that is a gag, not an episode.
7. **Production simplicity** — one main location, one main system/prop, minimal
   background, stable camera, reusable assets, clean start/end poses. Penalise
   crowds, complex moving environments, and exact numeric/spatial continuity in
   *background* props. (The *hero* being transparent/deformable is a feature — the
   "avoid transparent objects" rule is about background continuity traps, not the
   protagonist.)
8. **Novelty vs bank** — see novelty check below. *(Gated: enforced only at
   `studio_version >= 1.0`; in the current research phase legacy episodes are
   experiments, not a catalog — see the Compatibility gate.)*

Any hard-gate failure caps the theme below tier A, no matter how clever it is.

## Gag capacity — proof, not a magic number

Never pass a theme on a *claimed* count. It passes only if it **demonstrates
capacity** for many *materially distinct* gag situations, grouped by mechanism —
repetitive micro-variations of one gag do not count. The gag bank is a **reservoir
to select from**, not a list to put on screen, and on-screen density must **vary by
act** (`sandy-gag-library §10`), never be flat.

**Do not use a flat count as the gate.** A literal "60 gags / 300–700 gags" target is
gameable — anyone pads to the number with re-skins (the same gag in a new costume) and
directorial re-frames. Demonstrating a single 60-second theme to a literal 60 yields
only ~8–10 strong groups; the rest is padding. Judge **groups**, not totals.

Scale the demonstration to runtime by groups, not numbers:

| Runtime | "Capacity" looks like |
|---|---|
| ~60 s | ~6–8 distinct mechanism-groups, each clearly extensible (entrance / object-reaction / body / escalation / environment / payoff). Final cut uses ~8–12 gags. |
| 3 min | more groups + at least one mid-arc shift |
| 6–10 min | **multiple independent sub-engines** (often a new location/antagonist per act), a midpoint reversal, a false victory, and reuse of the opening problem in a smarter form |

Long-format scales by **adding independent sub-engines**, NOT by padding one engine.
A theme yielding only one repeatable gag is a **Short**, not a long episode — say so
rather than letting it be stretched.

## Novelty check (the real enemy at scale)

**Compatibility gate — read the `studio_version` flag first** (`config/defaults.yaml
→ studio.version`, mirrored to `app_config` system scope; governance summary in
CLAUDE.md §6). Below 1.0 the
studio is in research phase: legacy episodes E01–E12 are training experiments, *not*
a catalog — do **not** enforce novelty against them, do not treat them as the bank,
and do not calibrate the gates on them. The novelty check applies only to themes
proposed or made at `studio_version >= 1.0`, where it is enforced fully as below.

At hundreds of episodes, the failure isn't a weak theme — it's a *strong theme
repeated under a new label*. **A new `OBJ-*` is not a new `THEME-*`.** The bank is
indexed by `THEME-*` id; compare each candidate's *engine* to the bank and require it
to differ on at least: core conflict · gag engine · physical interaction · escalation
path · character-specific comedy · final payoff. `THEME-Elevator`, `OBJ-Automatic_Door`,
`OBJ-Turnstile` drive **one** engine (a threshold that almost obeys) in different props
— that is one `THEME-*`, not three episodes. (A theme catalog of `THEME-*` kernels is a
SUBJECT list, not a novelty pass — two kernels can collapse to the same engine.)

## Production-economy check

Estimate briefly: how many *new* assets, how many locations, how many complex props,
how much it **reuses existing** objects/locations, and cost relative to gag yield.
Prefer **high gag yield at low asset cost.** Read the project's existing cost model;
do not invent prices.

## Capability-awareness (provider-agnostic)

Judge against **capability invariants**, read as a profile from the repo's
capability/provider registry — never a named tool:

- decomposes into short, independently controllable shots;
- each gag expressible as a clear **start state → end state**;
- stable hero identity maintainable across shots;
- simple geometry, low continuity risk;
- manageable object interaction; no crowds, no unreadable interfaces.

If the current profile can't do something a theme needs, that's a **production risk
to name** — not a reason to bake in a one-tool workaround.

## Report contract (the report matters more than the number)

A numeric score is optional metadata for sorting only. The decision is the **tier**
plus a short report. **Do not import a multi-axis 1–10 scorecard with an average** — a
mean over ten hand-set axes is tuned until the preferred candidate passes, the same
defect class as the flat gag count above. Gates are binary because binary is checkable.
(Rejected explicitly 2026-08-02 — see `docs/topics/episode-themes.md`.) One per candidate:

```markdown
# Theme Evaluation — THEME-{Name}

## Theme ID — `THEME-{Name}` (+ participating `OBJ-*` / `CHR-*` / `LOC-*` / `LAW-*`)

## Verdict
A (develop now) · B (strong reserve) · C (weak engine / redesign) · D (reject)

## Short Reason — 2–5 sentences: why it passed or failed.

## Gates
Actionability · Visibility · Gag capacity · Series fit · Character physical fit ·
Silent readability · Production simplicity · Novelty — PASS/FAIL each.

## Strong Points / Weak Points

## Gag Engine Capacity — proof by mechanism-groups (not "there are 60").

## Similar Existing Themes — closest bank entries and how this truly differs.

## Production Risks — what may render badly, break continuity, or get expensive.

## How To Improve — the smallest change that would raise the tier.

## Feedback To Creator — one short learning signal for the next generation batch.
```

## Curate & hand off

Return the strongest **A/B** candidates (typically 3–10), each with its report,
plus a **single recommendation** of which to brief next and why. Append accepted
candidates + their verdicts to the theme bank so the next generation batch and the
novelty check both see them.

## Series profile = the Bible (no parallel copy)

Series-aware, not series-hardcoded. Genre, hero physics, laws, and production prefs
come from the active series' Bible **by reference** — never embedded here. For
`SER-Sandy` they are strong and specific (silent family slapstick; transparent
sand-glass hero; Illusion-of-Control / Too-Perfect-Plan / Random-Kindness; minimal-
background, single-system production), but a different series supplies a different
Bible and the process is unchanged.

## Self-check before handing results to the Director

- Did I judge **coldly**, or did the generator's enthusiasm leak into the verdict?
- Is each tier-A theme genuinely **new** against the bank, or a relabelled engine?
- Did I prove capacity by **mechanism-groups**, or just assert a count?
- Did I name production/cost risk in **capability terms**, with no provider baked in?
- Would each tier-A theme still be funny watched **silently, by a stranger, on a
  phone**? If not, it isn't tier A.
