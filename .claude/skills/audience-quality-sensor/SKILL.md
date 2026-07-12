---
name: audience-quality-sensor
description: How EXEC-ANAL turns real audience metrics into SCOUT-mode advice — the factory's quality sensor (paired with the price sensor, the budget log). Explains why the advisor's primary mode is EXPLORE not EXPLOIT on a small channel, the silence threshold, the "map of untested space" (holes) axis, the roles of each metric (completion = quality signal, views = exposure gate, loops+shares = virality), and the shot-level retention→calibration bridge. Platform-invariant; series taxonomy and thresholds are referenced by role, never hardcoded.
status: ACTIVE
owner: EXEC-ANAL (Analytics)
flavor: process
applies_when:
  agent: [EXEC-ANAL]
hard: false
created: 2026-07-12
---

# Audience Quality Sensor — Scout Mode

> **flavor: process.** Invariant analytics doctrine: how to convert real audience
> metrics into advice that steers production, WITHOUT collapsing a young channel
> into the first random winner. Names no series, character, or numeric threshold —
> the series taxonomy, the silence-threshold N\*, and the exposure gate X live in
> project Bible / Brief / config, referenced here only by role.

## The frame: this is Sensor #2 (quality)

The factory runs on two feedback sensors:
- **Price sensor** — the budget log (already built): what each run costs.
- **Quality sensor** — THIS advisor: what the audience actually rewards.

The advisor is EXEC-ANAL turning YouTube metrics into ranked advice. The Director
converges; the advisor advises. It never auto-writes production decisions.

## Primary mode: EXPLORE, not EXPLOIT

On a young channel with tiny N, the "top third" of performers is almost certainly
**noise** (a thumbnail, a posting time, one person's share) — not signal. An advisor
that says "make more of the winning thing" drives the series into a **local optimum
of the first random win and kills variety**. That is the failure mode to avoid.

- **Primary job now = expand the space and protect diversity**, not converge.
- **EXPLOIT ("amplify the leaderboard winner") is mode #2** — it switches on later,
  only once N is large enough that the ranking stops being noise.
- This is the emphasis of the honesty layer (below) turned from "optimize" to "explore".

## The honesty layer (foundation — never removed)

- Every signal is **labelled with confidence tied to N**. Small N → low confidence.
- **Silence threshold:** below N\* (or before per-gag attribution exists), the advisor
  issues **no mandates** ("do X") — only **flags** ("observe this signal"). A flag is
  an invitation to watch, not an instruction to act.
- Never present a fluke as a mandate.

## The holes axis — map the untested space (the scout's core output)

Ranking what's been shipped is secondary. On a small channel, **knowing what has NOT
been tried is worth more** than ranking what has.

- Build the map from the **series' own taxonomy** (its gag / antagonist / situation
  categories, per Bible + the project gag library) **minus what has shipped** = the holes.
- An advice card therefore carries a **hypothesis-experiment, not a conclusion**:
  *"category A vs category B have never been compared head-to-head — test."*
- **Every card has a "what we test next" field**, not only a "what worked" field.

## Metric roles (do not average them into one number)

- **Completion / % viewed — length-normalized — is the QUALITY signal.** Normalize by
  clip length, else the leaderboard rewards short clips, not good ones.
- **Views are the EXPOSURE GATE, not quality.** Below the gate X, confidence = null
  regardless of completion (a 95% completion on a handful of views means *nobody saw it*).
- **Virality of short-form = loops (rewatches) + shares**, which the algorithm
  amplifies most — **not likes** (the weakest of the three).
- Completion and views play **different roles** (quality signal vs exposure gate) —
  never "one weighted higher than the other".

## Long-form: retention-drop → SHOT is the CENTRE, not an appendix

A normal creator sees "viewers leave at 0:14". This factory can see "viewers leave at
**shot #7**" and fix a **production decision**. That is the structural advantage — build
the long-form sensor around it.

- Map the retention curve's time positions onto shots using the **same cumulative
  effective-playback timeline the stitcher uses** (per-shot durations + overrides,
  minus excluded shots). A % drop-off resolves to a specific shot id.
- This is the **calibration bridge**: forecast (what we thought the shot would do) vs
  reality (what the audience did), at shot granularity — the loop that trains the
  quality sensor over time.

## Relative now, hybrid later

- **Bootstrap = relative-to-own-channel** ranking (compare a video against the
  channel's own history). Correct while N is small.
- **Destination = hybrid** — blend in median/benchmark references once N grows. Leave a
  **hook for the benchmark input**; do NOT hardcode "relative-only" as permanent.

## Advice is always a ranked PATTERN hypothesis — never a mandate, never literal

- Generalize to a **pattern** ("mechanical-antagonist gags over-index"), not a literal
  repeat ("shoot another vending-machine episode"). Reasons: a pattern **transfers** to
  new episodes; a literal repeat is **Brief content leaking downward** (violates the
  skill-abstraction principle) and **the audience tires of a formula faster than the
  algorithm does**.
- Present advice **ranked by impact**, each as a hypothesis to be tested, for a human
  to accept or reject.

## Card anatomy

Each advice card carries: **axis icon** (amplify-gag / fix-long-form / cadence) ·
**headline** (the proposed move) · **evidence** (the triggering metric) · **confidence**
(tied to N — may be "flag only") · **target** (next Brief / episode / gag-category) ·
**what we test next** (the experiment it opens).

## Thresholds live in config, not here

N\* (silence threshold), X (exposure gate), the length-normalization curve, and the
relative→hybrid switch point are **configuration**, seeded with directional starting
values and NOT tuned on thin data. This skill states the roles; the numbers live in the
config layer / Brief.

## Project-local status (outside the invariant)

- **As of 2026-07-12:** doctrine authored; NOT yet built. EXEC-ANAL is still a mock
  (`mockAnalytics`, all-zero); `youtube.ts` has no statistics read; there is no
  analytics→ideation loop. Build is gated on (1) re-consent for the
  `yt-analytics.readonly` scope and (2) the Director's go for the audience-analysis
  phase. Per-gag attribution deepens after the gag-cut work (P2); episode-level first.
