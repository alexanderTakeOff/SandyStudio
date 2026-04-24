# SandyStudio — Multi-Audience KPI Layer
## specs/production/audience_kpi.md | v0.1 | DRAFT

> PA-006 — Audience segmentation + density metrics spec.
> Director reflection 2026-04-24: "What is not measured is not controlled.
> What is not controlled cannot scale."
>
> This spec formalizes the audience performance model and propagates it
> from Director brief → story brief → script → storyboard → QA checks.

---

## CORE INSIGHT

SandyStudio content is multi-layered by design:

| Audience | What engages them | Time horizon |
|----------|------------------|--------------|
| **Children** | Visual gags, physical comedy, surprise, immediate payoff | Seconds |
| **Adults** | Situational irony, life patterns, recognition, philosophical beat | Accumulated |

Both audiences watch the same 60 seconds.
The same shot can serve both layers simultaneously.

**This must be formalized and measurable, not implicit.**

---

## SECTION 1 — AUDIENCE DEFINITIONS

### Audience A — Children (Visual Layer)

```yaml
audience_id:    children
label:          "Visual Layer"
engagement:
  - frequency of gags (visual, physical, motion-based)
  - surprise and reversal
  - clear cause-and-effect action
  - bold visual variety (wide shot → close-up, fast → slow)
attention_window: ~8 seconds (re-engagement trigger required)
primary_hook:   The gag itself — is it funny RIGHT NOW?
```

### Audience B — Adults (Meaning Layer)

```yaml
audience_id:    adults
label:          "Meaning Layer"
engagement:
  - situational irony (character doesn't see what we see)
  - behavioural pattern recognition ("I've done this")
  - philosophical beat (universal truth observed without commentary)
  - delayed payoff (joke lands on second reflection)
attention_window: episode level (tolerates slower pacing for depth)
primary_hook:   The recognition moment — "this is true about being human"
```

### Audience C — Both (Overlap)

```yaml
audience_id:    both
label:          "Universal Beat"
description:    Shot or beat that works as immediate gag AND contains
                recognisable truth simultaneously.
                These are the highest-value beats in the script.
example:        SH07 — Sandy's handstand. 
                Children: physical comedy, surprising inversion.
                Adults: the irrational solution applied with complete commitment
                        to an embarrassing problem = universal recognition.
```

---

## SECTION 2 — KPI DEFINITIONS

### 2.1 — Episode-Level KPIs

```yaml
gag_rate:
  definition:     Number of distinct gags per minute of runtime
  unit:           gags/minute
  target_default: 3.0    # from config/defaults.yaml §audience_kpi
  minimum:        2.0    # below this: pacing too slow for children
  maximum:        6.0    # above this: no space for meaning layer

philosophy_density:
  definition:     Number of meaningful/reflective beats per minute
                  A "beat" is a moment of situational irony, recognition,
                  or philosophical observation embedded in action.
  unit:           beats/minute
  target_default: 1.5
  minimum:        0.5    # below this: adults disengage
  maximum:        3.0    # above this: becomes preachy

recognition_moments:
  definition:     Total count of "I've done/felt this" moments per episode
                  These are the shareable, quotable, memorable beats.
  unit:           count/episode
  target_default: 2
  minimum:        1
  note:           Recognition moments are a subset of philosophy_density.
                  They are the beats most likely to generate adult word-of-mouth.

audience_balance_ratio:
  definition:     Ratio of children-primary shots to adult-primary shots
                  (shots tagged "both" count toward both)
  target:         "60/40 or better for each audience"
  minimum_each:   40% of shots must serve at least one audience well
```

### 2.2 — Shot-Level KPI Fields

These fields are added to every shot entry in the storyboard:

```yaml
# Added to shot schema (specs/schemas/shot.md update required)
audience:
  gag:
    present: boolean          # Is there a gag in this shot?
    type: string | null       # visual | physical | reversal | timing | callback
    description: string | null  # Brief description of the gag (1 line)
  
  philosophical_beat:
    present: boolean          # Is there a meaningful/reflective beat?
    type: string | null       # irony | recognition | universal_truth | callback
    description: string | null  # Brief description of the beat (1 line)
  
  target_audience: string     # children | adults | both
  
  hook_strength: integer      # 1–3 (1=mild, 2=clear, 3=punchline/key beat)
                              # Used for clustering analysis
```

---

## SECTION 3 — DENSITY ANALYSIS

### 3.1 — Timeline Visualization

After storyboard is complete, EXEC-WCHK (or EXEC-SB) generates:

```
Shot timeline with audience annotation:

00.00  SH01  [children:2] [adults:1]  ▓▓░
00.04  SH02  [children:1] [adults:0]  ▓░░
00.10  SH03  [children:2] [adults:1]  ▓▓░
00.18  SH04  [children:1] [adults:1]  ▓▓░
00.22  SH05  [children:2] [adults:2]  ▓▓▓  ← recognition moment
00.26  SH06  [children:1] [adults:2]  ▓▓▓
00.30  SH07  [children:3] [adults:3]  ▓▓▓  ← punchline
...
```

Checks:
- No gap > 12 seconds without a children-layer gag
- No gap > 20 seconds without an adult-layer beat
- Key punchlines (hook_strength:3) distributed — not all at end
- At least 1 recognition moment in Acts 1–2 (not only finale)
```

### 3.2 — Episode Summary Metrics

```yaml
# Computed by EXEC-WCHK after storyboard audience annotation

computed_metrics:
  runtime_minutes: float          # e.g. 1.0
  total_gags: integer
  gag_rate: float                 # gags / runtime_minutes
  total_philosophical_beats: integer
  philosophy_density: float       # beats / runtime_minutes
  recognition_moments: integer
  audience_breakdown:
    children_only: integer        # shot count
    adults_only: integer
    both: integer
  audience_balance_pct:
    children: float               # (children_only + both) / total_shots
    adults: float                 # (adults_only + both) / total_shots
```

---

## SECTION 4 — PIPELINE INTEGRATION

### Where KPI targets are set (upstream → downstream)

```
Director brief
    ↓
BOARD-CRD: creative_direction includes audience_kpi targets per series
    ↓
ART-HW: story_brief includes beat map with audience attribution per beat
         + episode-level KPI targets from creative_direction
    ↓
EXEC-SW: script includes audience attribution per scene/beat
         self-check: CHK-K01 through CHK-K04 (see Section 5)
    ↓
EXEC-SB: storyboard includes audience attribution per shot (fields above)
         self-check: timing distribution analysis
    ↓
EXEC-WCHK: world check adds audience KPI verification
           computes episode metrics, flags violations
    ↓
ART-HW: receives WCHK report — revises brief if KPI targets missed
```

### Story Brief Additions

```yaml
# Fields added to story_brief schema

audience_kpi:
  targets:
    gag_rate: float             # from creative_direction or defaults.yaml
    philosophy_density: float
    recognition_moments: integer
  audience_a_primary_scenes:    # Which scenes carry children layer
    - scene_id: string
  audience_b_primary_scenes:    # Which scenes carry adults layer
    - scene_id: string
  recognition_moments_planned:  # Director-designated recognition beats
    - beat_id: string
      description: string
```

---

## SECTION 5 — QA CHECKS

### Script Review Checks (added to EXEC-SREV)

```
CHK-K01  gag_rate:         computed gags/minute ≥ minimum (2.0) ✅/❌
CHK-K02  philosophy_density: computed beats/minute ≥ minimum (0.5) ✅/❌
CHK-K03  recognition_moments: count ≥ 1 ✅/❌
CHK-K04  children_gap:     no >12s gap without a children-layer beat ✅/❌
CHK-K05  adult_gap:        no >20s gap without an adult-layer beat ✅/❌
CHK-K06  balance_ratio:    both audiences ≥40% of shots ✅/❌
```

If any check fails:
- CHK-K01/K02 fail: **BLOCKING** — ART-HW revises story brief, EXEC-SW rewrites script
- CHK-K03 fail: **HIGH** — add recognition beat before approving
- CHK-K04/K05 fail: **BLOCKING** — pacing gap must be addressed
- CHK-K06 fail: **MEDIUM** — flag for Director, not automatically blocking

### World Check Extension (EXEC-WCHK)

```
CHK-A01  Shot has audience annotation:  all shots tagged ✅/❌
CHK-A02  Episode gag_rate:              ≥ minimum ✅/❌
CHK-A03  Episode philosophy_density:    ≥ minimum ✅/❌
CHK-A04  Distribution visual:          no clustering violations ✅/❌
CHK-A05  Recognition moments:          ≥ 1, identified ✅/❌
```

---

## SECTION 6 — DEFAULTS

*All values in `config/defaults.yaml §audience_kpi`. Calibrate after PILOT.*

```yaml
audience_kpi:
  gag_rate_target:          3.0
  gag_rate_minimum:         2.0
  gag_rate_maximum:         6.0
  philosophy_density_target: 1.5
  philosophy_density_minimum: 0.5
  philosophy_density_maximum: 3.0
  recognition_moments_target: 2
  recognition_moments_minimum: 1
  audience_balance_minimum_pct: 40
  children_gap_max_seconds:  12
  adult_gap_max_seconds:     20
```

---

## SECTION 7 — PILOT RETROACTIVE ANNOTATION

The PILOT episode (SS-S01-E01) was written before this spec existed.
After this spec is APPROVED, ART-HW should:
1. Retroactively annotate SS-S01-E01-STB-act1-v01 with audience fields per shot
2. Compute actual pilot KPIs
3. Compare against targets — this calibrates whether defaults are correct
4. PA-004: update defaults.yaml with calibrated values

This is not a re-do of the PILOT — it's a measurement pass for learning.

---

## SANDY PILOT — INFORMAL ASSESSMENT

*Preliminary annotation before formal system is in place.*

| Shot | Gag? | Phil. beat? | Audience |
|------|------|------------|---------|
| SH01 | — | — | both (atmosphere) |
| SH02 | visual (swagger) | recognition (oblivious entry) | both |
| SH03 | visual (smear she can't see) | irony (audience sees it, she doesn't) | both ★ |
| SH04 | timing (shaft extends) | — | children |
| SH05 | reversal (arrow to 6) | recognition (the verdict) | both ★ |
| SH06 | — | recognition (she looks down) | adults |
| SH07 | physical (handstand!) | recognition (committed irrational solution) | both ★ |
| SH08 | reversal (approved upside down) | irony (system works when gamed) | both |
| SH09 | physical (walking on hands) | — | children |
| SH10 | — | universal_truth (gravity always wins) | adults |
| SH11 | — | universal_truth (she collapses) | adults |
| SH12 | callback (Inspector at door) | recognition (he was right) | both ★ |

```
Gags: SH02, SH03, SH04, SH05, SH07, SH08, SH09 = 7 gags / 1.0 min = 7.0 gags/min
Philosophy beats: SH02, SH03, SH05, SH06, SH07, SH08, SH10, SH11, SH12 = 9 beats / 1.0 min
Recognition moments (★): SH03, SH05, SH07, SH12 = 4

Assessment: gag_rate ABOVE target (7.0 vs 3.0 target) ✅
            philosophy_density WAY above target (9.0 vs 1.5 target) ✅
            recognition_moments: 4 ≥ 2 target ✅

→ Targets for PILOT are conservative. PA-004: consider raising defaults.
  Or: this is a particularly dense episode. Keep defaults, measure E02 for comparison.
```

---

*SandyStudio audience_kpi.md | v0.1 | Status: DRAFT*
*PA-006 | Director reflection 2026-04-24 | Pending Director review*
