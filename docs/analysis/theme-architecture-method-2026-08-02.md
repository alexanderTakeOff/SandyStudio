> **ВНЕШНИЙ ИСТОЧНИК — НЕ РАНТАЙМ.** Передан Директором 2026-08-02. Лежит здесь как
> материал разбора, а НЕ как действующая роль: скиллом не ставится (пара
> `series-episode-theme-generation` + `series-episode-theme-selection` уже закрывает ~80%).
> Что из него принято и что отвергнуто — досье `docs/topics/episode-themes.md`.
> Текст ниже — как получен, без правок.

---

# Sandy Studio — Theme Architecture Method Specification

**Document:** `theme_architecture_method_spec.md`  
**Version:** 0.2  
**Status:** Experimental, validated for manual use; ready for isolated skill implementation  
**Scope:** Selection and generation of episode themes for Sandy Studio  
**Primary series context:** Sandy  
**Language:** English  
**Change policy:** Do not modify the method merely to fit a single generated idea. Changes require evidence from repeated testing, reverse engineering of successful visual-comedy episodes, or measurable improvement in controlled generation.

---

## 1. Purpose

This method defines a systematic process for generating episode themes for visual comedy.

Its purpose is to replace heterogeneous free-form brainstorming with a reproducible architecture that:

- separates physical comedy from social meaning;
- creates themes that naturally generate visual gags;
- supports automation;
- filters out weak ideas before script development;
- distinguishes short-form and long-form suitability;
- remains compatible with the Sandy Studio entity system.

The method generates **themes and comic engines**, not finished scripts.

---

## 2. Core Hypothesis

A viable visual-comedy episode can be designed as a structured combination of independent dimensions rather than invented directly as a plot.

The minimum formula is:

```text
MAIN OBJECT OR PHYSICAL SYSTEM
+
SOCIAL OR HUMAN SITUATION
+
GOVERNING PHYSICS
+
ESCALATION ENGINE
+
ENDING PATTERN
```

For Sandy, the preferred formula also includes:

```text
SANDY-SPECIFIC PROPERTY
```

The strongest default mode is **Hybrid**:

```text
Social situation gives the episode meaning.
Physical object or environment generates visible gags.
Sandy-specific properties make the episode belong to Sandy.
```

Object-driven and Situation-driven episodes remain valid specialized modes.

---

## 3. Design Principles

### 3.1 Theme, not plot

A theme is not:

- “Sandy goes to the gym”;
- “Sandy visits an airport”;
- “Sandy has a difficult day.”

A usable theme is a **repeatable dramatic and mechanical engine**.

Example:

```text
Weak:
Sandy in the gym

Strong:
A treadmill turns Sandy’s attempt to become fit into an involuntary mechanical workout conveyor.
```

### 3.2 The theme must generate gags

The theme must naturally produce repeated attempts, failures, reversals, and escalation.

A theme that supports only one joke is not a theme engine.

### 3.3 Mechanical layer and social layer are separate

The method must explicitly identify:

```text
Mechanical layer:
What children understand immediately through action.

Social layer:
What adults recognize as a familiar human behavior, social role, conflict, or institution.
```

### 3.4 Do not force Sandy-specificity artificially

Sandy-specificity should emerge naturally from one or more of:

- transparent glass body;
- two-bulb hourglass shape;
- sand flow;
- changing center of mass;
- inversion;
- visible depletion or accumulation;
- narrow waist;
- interaction between rigid glass and flexible cartoon limbs.

A generic gag with “sand added afterward” does not qualify.

### 3.5 Production reality is part of theme quality

A visually clever idea may still be rejected if it requires:

- too many locations;
- too many unique objects;
- difficult reflections;
- complex crowds;
- unclear transformations;
- unreadable internal physics;
- excessive continuity burden;
- expensive simulation.

---

## 4. Episode Driver Types

Every candidate must be classified by its dominant driver.

### 4.1 Object-driven

The main gag source is an object, machine, physical system, or environment.

Examples:

- conveyor;
- elevator;
- automatic door;
- treadmill;
- measuring tape;
- balloon;
- vacuum cleaner.

The social layer may be light, but it should still be identified.

### 4.2 Situation-driven

The main gag source is a human or social situation.

Examples:

- trying not to lose face;
- unwanted help;
- taking turns;
- pretending to be an expert;
- preserving status;
- being inspected;
- excessive politeness.

Objects are supporting instruments rather than the primary engine.

### 4.3 Hybrid

The social situation defines the goal and adult meaning, while a physical object or system continuously produces visual gags.

This is the preferred default because it combines:

- strong motivation;
- visual clarity;
- repeatable mechanics;
- social recognition;
- better story structure.

### 4.4 Gag anthology

Do not treat `Gag Anthology` as a standard episode type.

It remains an exceptional format and should only be generated when explicitly requested.

---

## 5. Architecture Layers

The generator should reason through the following layers.

### Layer 0 — Universal Human Experience

Examples:

- impatience;
- pride;
- fear of embarrassment;
- perfectionism;
- jealousy;
- curiosity;
- laziness;
- desire for control;
- desire to impress;
- loss aversion;
- status anxiety;
- desire to belong;
- excessive helpfulness.

### Layer 1 — Physical Gag Atoms

Minimal physical actions or failures:

- stuck;
- slip;
- stretch;
- compress;
- bounce;
- roll;
- rotate;
- swing;
- pull;
- push;
- jam;
- spill;
- inflate;
- deflate;
- miss;
- overshoot;
- recoil;
- tangle;
- topple;
- multiply;
- snap back.

### Layer 2 — Main Object or Physical System

Examples:

- elevator;
- conveyor;
- escalator;
- measuring tape;
- baggage carousel;
- photo booth;
- ticket machine;
- turnstile;
- umbrella;
- vacuum cleaner;
- treadmill;
- automatic chair.

Prefer one main object or one coherent object family.

### Layer 3 — Physical Environment

Examples:

- room;
- beach;
- jungle;
- gym;
- construction site;
- airport;
- service center;
- garden;
- street;
- workshop.

### Layer 4 — Social Environment

Examples:

- alone;
- pair;
- queue;
- audience;
- classroom;
- workplace;
- inspection point;
- passengers;
- customers;
- competitors;
- neighbors.

### Layer 5 — Social Situation

Examples:

- trying to be first;
- hiding incompetence;
- unwanted help;
- competing for status;
- taking turns;
- protecting ownership;
- following rules;
- breaking rules;
- pretending expertise;
- avoiding embarrassment;
- being watched;
- negotiating;
- sharing;
- queue conflict;
- preserving reputation.

### Layer 6 — Governing Physics

Examples:

- gravity;
- momentum;
- friction;
- elasticity;
- air pressure;
- buoyancy;
- magnetism;
- balance;
- flow;
- rotation;
- spring tension;
- sand flow;
- inertia.

### Layer 7 — Escalation Engine

Examples:

- every attempt makes it worse;
- speed increases;
- weight increases;
- object multiplies;
- space decreases;
- time runs out;
- chain reaction;
- system reclassifies Sandy;
- hidden error grows;
- social stakes rise;
- success creates a larger problem.

### Layer 8 — Ending Pattern

Examples:

- false victory;
- loop;
- status reversal;
- tiny success;
- ironic punishment;
- accidental reward;
- reset;
- object wins;
- social exposure;
- Sandy-specific inversion.

---

## 6. Required Candidate Record

Every candidate must be represented in a structured record before any script-like development.

```yaml
candidate_id:
driver_type: object_driven | situation_driven | hybrid
universal_human_experience:
main_object_or_system:
physical_environment:
social_environment:
social_situation:
governing_physics:
gag_atoms:
escalation_engine:
ending_pattern:
sandy_specific_property:
mechanical_layer:
social_layer:
runtime_target:
production_constraints:
```

If a field is genuinely not relevant, use `none` and explain why. Do not silently omit required fields.

---

## 7. Generation Procedure

### Step 1 — Resolve constraints

Read project constraints first:

- runtime;
- target audience;
- available characters;
- available locations;
- canon restrictions;
- production budget;
- AI renderability;
- whether new objects may be created;
- whether the episode is short-form or long-form.

### Step 2 — Select driver mode

Use:

- `Hybrid` by default;
- `Object-driven` when the object itself has unusually rich physics;
- `Situation-driven` when the social premise can sustain repeated visual behavior with minimal object support.

### Step 3 — Build combinations

Generate multiple structured combinations before writing any premise.

Recommended batch:

```text
12–20 raw combinations
```

### Step 4 — Reject weak combinations

Reject a combination when:

- the setup is not readable without dialogue;
- the object does not generate repeated action;
- the social layer is too abstract to visualize;
- the physics is unclear;
- Sandy is interchangeable with any generic character;
- escalation requires unrelated new objects;
- the idea is only a location;
- the idea is only a moral;
- the theme supports fewer than three distinct gag families;
- production cost is disproportionate to the result.

### Step 5 — Cluster duplicates

Merge candidates that share the same underlying engine even if surface objects differ.

Example:

```text
automatic door + turnstile + elevator gate
```

may all belong to a shared engine:

```text
system repeatedly misclassifies the hero
```

### Step 6 — Expand finalists

For the best candidates, produce:

- concise theme statement;
- one-sentence logline;
- driver classification;
- 8–15 major beats;
- gag families;
- social layer;
- Sandy-specific payoff;
- production risk;
- scorecard.

### Step 7 — Rank

Return no more than three final candidates unless the user requests otherwise.

---

## 8. Evaluation Criteria

Score each criterion from 1 to 10.

### Visibility

Can the premise and action be understood instantly?

### Actionability

Does the theme produce continuous visible action?

### Gagability

Does the engine generate multiple non-duplicate gag families?

### Storybility

Can the idea produce setup, escalation, climax, and ending?

### Social Readability

Can an adult recognize the human or social behavior without dialogue?

### Sandy Specificity

Does the idea use the unique body and physics of Sandy?

### AI Renderability

Can current image/video generation represent the action consistently?

### Production Simplicity

Can the episode be made with limited locations, objects, characters, and continuity?

### Escalation Integrity

Do later gags grow from earlier rules rather than introduce arbitrary new rules?

### Originality

Is the core combination meaningfully distinct from existing Sandy episodes?

---

## 9. Scoring Interpretation

Do not use a single score as an absolute scientific cutoff.

Use score bands:

```text
9.0–10.0  Exceptional
8.0–8.9   Strong
7.0–7.9   Viable with revision
6.0–6.9   Weak / specialized
Below 6   Reject
```

A candidate may still be rejected despite a high average if it fails a hard constraint such as:

- unreadable without dialogue;
- impossible production;
- canon violation;
- no genuine gag engine;
- no coherent escalation.

---

## 10. Short-Form Rules: 30–45 Seconds

Short-form validation is separate from long-form validation.

### Hard constraints

```text
Duration: 30–45 seconds
Location: 1
Characters: preferably 1–2
Main object/system: 1
Supporting object families: maximum 1–2
Major beats: 8–12
Setup: understandable within 1–3 seconds
Escalation: begins immediately
Gag families: 2–3
Ending: one clear reversal or Sandy-specific punchline
```

### Short-form structure

```text
0–3 sec     Setup
3–12 sec    First interaction and failure
12–25 sec   Two escalation cycles
25–37 sec   Maximum escalation
37–45 sec   Punchline / reversal / clean tail
```

### Short-form rejection rules

Reject when:

- the premise needs explanation;
- the social conflict requires dialogue;
- the episode needs more than one location;
- the object family is too broad;
- the setup consumes more than 20% of runtime;
- escalation depends on many unrelated gags;
- the ending is only a stop rather than a payoff.

### Short-form engine formula

```text
ONE SOCIAL IDEA
+
ONE PHYSICAL ENGINE
+
MAXIMUM THREE ESCALATION CYCLES
+
ONE CLEAR ENDING
```

---

## 11. Long-Form Rules

For episodes above approximately 90 seconds:

- multiple gag families are allowed;
- object families may expand;
- secondary characters may create social counterplay;
- escalation may change phase;
- 20–30 or more distinct gags may be appropriate;
- the central engine must remain visible throughout.

Do not confuse a longer list of gags with stronger structure.

---

## 12. Evidence from Manual Validation

The method was manually tested in two directions.

### Reverse engineering

Successful Pink Panther episodes could be decomposed into:

- human experience;
- object or system;
- social situation;
- governing physics;
- escalation;
- ending.

This supported the architecture without requiring a new standard `Gag Anthology` category.

### Forward generation

Three modes were generated:

```text
Object-driven       7.7
Situation-driven    7.6
Hybrid              9.0
```

Interpretation:

- Hybrid is the strongest default;
- Object-driven and Situation-driven remain viable;
- no mode showed a critical failure;
- the method is useful, but scores are heuristic rather than scientific proof.

### Short-form validation

Three 30–45 second concepts were generated:

- measuring tape — Object-driven;
- narrow passage / excessive politeness — Situation-driven;
- photo booth — Hybrid.

All were viable, with Hybrid again strongest.

---

## 13. Compatibility with Sandy Studio Identifiers

Existing namespaces:

```text
CHR-*     recurring character
PET-*     companion character
OBJ-*     physical object
THEME-*   episode theme / dramatic engine
LOC-*     location
LAW-*     world law / philosophy
```

Recommended additions, subject to project-architecture review:

```text
SOC-*     social situation or social conflict
ATOM-*    physical gag atom
ESC-*     escalation engine
END-*     ending pattern
UX-*      universal human experience
```

These additions are recommendations only. The integration engineer may map them to existing project structures instead of creating new namespaces.

Example:

```text
CHR-Sandy
CHR-Metelka
OBJ-Ticket_Machine
OBJ-Queue_Barrier
LOC-Service_Center
SOC-Wants_To_Be_First
ATOM-Stuck
ATOM-Reclassified
LAW-Illusion_of_Control
ESC-Every_Attempt_Moves_Him_Back
END-Status_Reversal
THEME-Endless_Queue
```

---

## 14. Non-Goals

This method does not:

- write the final screenplay;
- create storyboard shots;
- define camera grammar;
- replace the series bible;
- override canon;
- guarantee production feasibility without project data;
- decide episode numbering;
- automatically approve a theme for production.

---

## 15. Integration Requirements

Before project integration, the implementing engineer should:

1. compare this specification with current Sandy Studio schemas;
2. map fields to existing project entities;
3. identify missing taxonomies;
4. decide whether new namespaces are required;
5. implement the skill in an isolated sandbox;
6. test with known strong and weak topics;
7. compare output with manual benchmarks;
8. revise the skill without changing the method’s core logic unless evidence justifies it;
9. only then place the skill into the main project.

---

## 16. Acceptance Criteria for the Implemented Skill

The integrated skill is acceptable when it:

- produces structured candidates before prose;
- distinguishes driver types correctly;
- defaults to Hybrid without banning other modes;
- separates mechanical and social layers;
- enforces short-form constraints when requested;
- rejects location-only ideas;
- identifies production risks;
- produces no more than three ranked finalists by default;
- uses Sandy-specific physics meaningfully;
- does not write a full script unless explicitly asked;
- produces repeatable outputs under the same constraints;
- can be tested in isolation.

---

## 17. Method Summary

```text
Do not start with a plot.

Start with:
human experience
+ social situation
+ physical object/system
+ governing physics
+ escalation
+ ending
+ Sandy-specific property.

Generate combinations.
Reject weak engines.
Cluster duplicates.
Expand finalists.
Score consistently.
Return the strongest themes.
```
