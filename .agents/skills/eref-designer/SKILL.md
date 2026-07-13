---
name: eref-designer
description: Decision playbook for the Episode Reference Designer (EXEC-EREF). Covers provider choice per shot type, image size per delivery target, variant count, pilot strategy, camera-angle coverage, prompt formulation, and the running defect-and-negative list. Pairs with `agents/exec/episode_reference_designer.md` and `webapp/lib/agents/runners/episode-reference-designer.ts`.
status: ACTIVE
owner: EXEC-EREF (Episode Reference Designer)
applies_when:
  agent: [EXEC-EREF]
hard: false
created: 2026-05-18
---
# Episode Reference Designer — Decision Playbook (SandyStudio)

> v0.1 — Sprint «Дизайнер и Аниматор», Day 2-3.
> Will grow with each E2x retro. Append new sections labelled with date;
> do not rewrite history. Decision tables here are **canonical**; agent
> spec references this skill rather than embedding them inline.

## When this skill applies

- Agent is `EXEC-EREF` (Episode Reference Designer).
- Director, PA, or factory.ts dispatched a per-shot reference-generation job.
  The agent is composing a `SPC-ref_plan-<shot_id>` Plan-asset.

For the downstream **executor** step that reads the APPROVED Plan and calls
the actual image provider — that lives in `episode-references.ts` and is
**not** governed by this skill. Designer = decisions only; executor =
deterministic calls based on the Plan.

## Provider decision

**Sprint scope (Director directive q1 2026-05-18):** `gpt-image-2` only.
Flux 2 pro and other providers deferred to a post-E22 retro evaluation
sprint. The allowlist is enforced in code by
`EREF_DESIGNER_PROVIDER_ALLOWLIST` — Designer must justify the choice from
this single-entry list in `provider.rationale`.

Rationale boilerplate (acceptable to Critic):

| Shot type | Rationale sentence template |
|---|---|
| Face-heavy close-up | «gpt-image-2 strong on character faces; sprint-scope provider.» |
| Wide environment | «gpt-image-2 sprint-scope provider; environment rendering acceptable for current Bible style canon.» |
| Stylised cartoon | «gpt-image-2 with explicit style anchor; sprint-scope provider.» |
| Retry of APPROVED shot | «Same provider as prior APPROVED variant for consistency.» |

When the playbook grows to multiple providers (post-E22 retro), this table
becomes a real decision rule; the agent code does not need to change — only
the allowlist constant + this skill.

## Size decision

Read `delivery_targets[]` resolved by `resolveDeliveryTargets()`. For each
slug:

| delivery_target | Canonical size (W×H) | Aspect | Use case |
|---|---|---|---|
| `youtube_landscape` | 1536×1024 | 16:9 | YouTube main channel — **S14 sprint default** |
| `youtube_shorts` | 1024×1792 | 9:16 | YouTube Shorts |
| `instagram_reels` | 1024×1792 | 9:16 | Reels |
| `instagram_post` | 1024×1024 | 1:1 | Feed square |
| `tiktok` | 1024×1792 | 9:16 | TikTok |
| `print_poster` | 2048×1536 | 4:3 | Printed material |

**Critical rule (closes Director Stage A 2026-05-18 issue #1):**
NEVER pick 1024×1024 for `youtube_landscape`. The legacy
`episode-references.ts` hardcoded square refs and Seedance img2vid then
cropped 25% of the frame loss. The size table above is the source of truth;
Critic enforces match via hard check V01.

When multiple targets in one episode (e.g. landscape + shorts):
1. **Primary path**: pick the first target's size + add `policy_note` that
   secondary targets will need a separate Plan or crop-safe zone, then
   surface a `decision_requested` event so Director picks the strategy.
2. **Future enhancement** (post-E22): generate one ref per target — covered
   by a separate sprint when Director opts in.

## Variants count and pilot strategy

| Episode state | Variants count | Rationale token |
|---|---|---|
| Fresh episode, no prior APPROVED for any shot | **2** for 1-2 representative shots (establishing + action) | «pilot» |
| Fresh episode, fan-out after Director approved pilots | **1** per remaining shot | «fanout» |
| Shot has prior REJECTED | **2** | «retry-with-choice» |
| Shot has prior REVISION request | **1** | «focused-retry» |
| Normal regenerate of APPROVED | **1** | «refine» |

**Pilot strategy (Director directive q2 2026-05-18):** confirmed
`Pilot mode = 2 variants`. The 1-2 representative shots are typically
*establishing* + *action* shot roles (matches the legacy `pickPilotShots`
heuristic in `episode-references.ts`).

## Continuity strategy

| Shot composition | Mode | Anchors |
|---|---|---|
| Character(s) + LOCKED location in Bible | `openai-edits-multi` | Character LOCKED ids + location LOCKED id |
| Character(s) but no LOCKED location | `openai-edits-single` | Character anchor only |
| Pure establishing / no characters / no anchored location | `openai-image` | (none — fresh generation) |

**Director's q4 question 2026-05-18 (anchor-level variation):** the current
Bible has ONE location reference per location. All shots in the same
location anchor on the same plate → angle variation comes from
**prompt-level** instruction in the Camera intent section (see below), not
anchor-level. A future sprint may add Bible location multi-view (counter /
entrance / back-room as separate `BIB-location-*` sub-views); until then
the Designer extracts variation through explicit camera direction text.

## Camera intent and sub_area variation

For each shot, write a `camera_intent` block with:
- `angle` — matches `shot.camera_angle` from STB
- `sub_area_variation` — one sentence describing how this shot's viewpoint
  differs from sibling shots in the same location

Pattern when ≥ 2 shots share a location:
1. Look up sibling shots' `sub_area` + `camera_angle` in the STB
2. Choose a deliberately different vantage point for this shot
3. Include explicit instruction in the prompt:
   `«Different viewpoint from <sibling_shot_id>, do NOT replicate flat plate.»`

This closes the 2026-05-12 fan-out collapse defect where 19 shots in the
same perfume shop all returned the same flat counter plate.

## Prompt formulation — smart-canon B

**Director directive q3 2026-05-18: «не урезать заранее — модели умнее,
отсекут лишнее». Give the model MORE structured information, not less.**

Use **structured sections**, NOT novel-prose. Pattern:

```
[Scene context]
<1 sentence from script_scene context if available — what's happening
narratively before/during/after this shot>

[Action]
<verbatim from shot.action_prose — NEVER truncate to first sentence.
The 2026-05-13 firstSentence() clamp was an over-correction.>

[Subject]
For each character in shot.characters[]:
  - name
  - physical_anchors: <structured Bible fields — proportions, palette,
                       distinguishing features. NOT free-form Bible.description.>
  - costume: <from Bible costume field if present>
  - current_mood: <from shot.expected_emotion>

[Location]
From Bible.locations[shot.location_id]:
  - geographic_anchor (where in the world / room)
  - sub_area: <from shot.sub_area if present — explicit camera variation>
  - lighting: Bible baseline + shot.time_of_day override

[Camera]
<one sentence combining shot.camera_angle + shot.camera_movement +
shot.camera_motivation. Include camera_movement explicitly — the legacy
describeCamera() lookup ignored it.>

[Style]
<verbatim Bible.style_canon. Example for S14:
"S14 STYLE CANON v1.1: outline-only pencil edge, flat vector fills,
no hatching, warm cinematic palette">

[Gag/Beat]
<if shot.expected_gag present, one sentence explaining the visual gag>
```

**Critical anti-patterns (will trigger Critic REVISE):**

- ❌ Writing character identity as novel-prose: «Sandy, a young
  confident sand-character with golden granules...»
- ✅ Writing it structurally: «Sandy. physical_anchors: hourglass-bodied,
  golden granular fill. costume: dark-grey cap. current_mood: curious.»

- ❌ Truncating action_prose to first sentence («Sandy enters» when STB
  said «Sandy enters the perfume shop, scanning for a free counter,
  bumping into a perfume stand mid-stride»)
- ✅ Full action_prose verbatim

- ❌ `Camera: medium shot` (ignoring camera_movement)
- ✅ `Camera: medium shot · slow_push_in to underscore Sandy's curiosity
  arc · static frame after the lean-in to let the reaction land`

## Negative list

Always include the baseline:

```
- no extra limbs
- no face morphing
- no costume changes
- no text or logos
- no on-screen captions
```

Append running negative list from `app_config.eref_negative_baseline` +
per-episode addenda accumulated through E2x retros. Examples observed in
production:

| Date | Source episode | Negative term added |
|---|---|---|
| 2026-05-13 | E20 SH06 retro | `no granular body distortion on Sandy` |
| 2026-05-18 | TBD from E22 retro | (slots reserved) |

The running list **grows**, never shrinks — historical defects don't
un-happen. Director or ART-AD curates additions; Designer reads them.

## Cost reference table

Provider catalogue snapshot (2026-05-18, gpt-image-2 ~+25% vs legacy):

| Provider | Size | Cost / image |
|---|---|---|
| `gpt-image-2` | 1024×1024 | $0.020 |
| `gpt-image-2` | 1536×1024 | $0.030 |
| `gpt-image-2` | 1024×1792 | $0.030 |
| `gpt-image-2` | 2048×1536 | $0.040 |

Continuity-mode multiplier: `openai-edits-multi` ≈ 1.10× (slight surcharge
for anchor compositing). `estimated_cost_usd` in the Plan should equal
`variants_count × per-image-cost × continuity-multiplier`.

Per-Plan cost ceiling (Designer LLM call itself): **$0.15** — set by
`EREF_DESIGNER_COST_CEILING_USD` in the runner. Typical Plan: $0.02-0.05.
Overrun is logged in `notes[]`; Critic does not block on it but Director
sees the flag.

## Pre-flight checks (Designer self-validates BEFORE writing the Plan)

1. ✅ STB-storyboard APPROVED and contains shot_id
2. ✅ Every character in `shot.characters[]` has a LOCKED Bible entry
3. ✅ shot.location resolves to a Bible location (warn if no `sub_area`)
4. ✅ `delivery_targets[]` resolves (episode → series → fallback)
5. ✅ `gpt-image-2` provider config present (env / `app_config`)

If any check fails → emit `canon_extension_proposed` activity_event with
the specific gap, do NOT write a Plan. EXEC-ORCH / Director resolves
upstream before retry.

### 2026-06-09 — `delivery_targets` fallback is a RED FLAG, not a pass (E03 Shorts)

Pre-flight check #4 ("delivery_targets[] resolves (episode → series → fallback)")
is necessary but **not sufficient**. Resolving *via the fallback*
(`youtube_landscape`, 16:9) means NEITHER episode NOR series declared a target —
which silently produces **landscape** refs. If the episode is meant to be
vertical (Shorts / Reels / TikTok) this ships the wrong aspect end-to-end, and
Seedance img2vid then crops the landscape ref into 9:16 (content loss + identity
drift — see `seedance-prompting` hard rule 6).

**Rule:** when `delivery_targets` resolves ONLY by fallback (episode.metadata
AND series.metadata both empty), do NOT silently default. Emit
`decision_requested` naming the gap ("episode has no delivery_targets — confirm
landscape, or set the vertical target before refs"). Aspect is owned by
episode/series config (Brief / Episode Settings), never guessed by the Designer.

Root cause E03 (2026-06-09): episode created for vertical Shorts but
`episode.metadata.delivery_targets` was never set → Designer authored 1536×1024
landscape plans. Durable prevention: delivery_target as a first-class field in
the Episode Settings card (TD-86), set before the pipeline runs.

### 2026-06-24 — EVERY canon participant in the shot must be canon-locked, not just the hero (E12 Metelka)

**Root cause (E12 «Бесконечная лента»):** the Plan/prompt and the Critic
were both effectively tuned to ONE hero character (Sandy). A second
in-frame character — Metelka (hand-brush companion) — was present in 10
shots but carried no hard canon contract. Result: SH10/12/13/14/16
rendered a broken/inconsistent Metelka, the Critic scored it as cosmetic
(consistency/style on Sandy stayed high), exhausted best-of-3, and the
shots passed as REGENERATE_EXHAUSTED. SH11/SH18 happened to look fine only
because Metelka was in a simple static pose there. Pattern was NOT random:
the failures clustered where the secondary character was actively posed.

**Rule for the Designer (Plan + prompt):**
- Enumerate **every participant** the shot actually contains — each
  character AND each meaningful object — not just the hero. Cross-check
  against the episode cast, not just `shot.characters[]`.
- For each participant WITH a Bible/canon entry → bind it strictly to that
  canon (cast-anchor + structured `physical_anchors` in [Subject]), exactly
  as the hero is bound.
- For each participant WITHOUT a canon entry (one-off / not yet in Bible) →
  write an **extended, fully-specified description** (colour, shape,
  material, scale, position, role/purpose in the shot) detailed enough that
  the participant renders **identically from shot to shot**. The failure to
  avoid: E-prev poster that was one colour in one shot and a different
  colour in the next purely because it was un-canon and under-specified.
- A participant that recurs in ≥2 shots is a consistency liability if left
  un-specified. Treat its description as a fixed contract reused verbatim
  across all its shots (PA owns carrying that fixed description shot-to-shot
  until/unless it is promoted into Bible — Designer/Critic cannot edit Bible).

**Rule for the Critic (the canon check):**
- Validate **all canon participants in the frame**, not only the hero. Any
  character or object that has a Bible/canon entry is checked against that
  canon.
- A broken/mismatched canon participant is a **CANON FAIL** — a real
  blocking defect, NOT cosmetics, and NOT eligible for an
  REGENERATE_EXHAUSTED approve. (Clarifies the standing rule below: see
  REGENERATE_EXHAUSTED note.)
- For an un-canon participant, check **consistency against its fixed
  specified description** as carried in the Plan/prompt. A drift from that
  fixed description = FAIL.

**REGENERATE_EXHAUSTED clarification (Director 2026-06-24):**
`REGENERATE_EXHAUSTED` is approvable ONLY when the exhaustion was over
**cosmetic** issues. If ANY of the retry reasons involved a missing or
broken canon (hero OR secondary participant), it is an unambiguous
canon-break — must NOT be auto-approved; route back to the Designer with the
canon contract made explicit.

## Revision loop (Critic REVISE → Designer v02)

When Critic returns REVISE with a `revisionNote`, treat each numbered
item in the note as a **HARD CONTRACT**:

- `V01 size mismatch delivery_target` → recompute Step 2 (size table)
- `V02 provider unjustified` → reconsider Step 1 (provider rationale)
- `V03 sub_area duplicate sibling` → reconsider Step 7 (camera_intent)
- `V04 Bible canon missing` → reload Bible + recompute prompt subject
- `V05 negative baseline missing` → augment negative
- `V06 camera intent misaligned with STB` → recompute camera section
- `V07 variants count anomaly` → reconsider Step 3 (pilot/fanout state)
- `V08 cost overrun ≥ 2× expected` → reconsider provider / variants
- `V09 secondary canon participant unbound / broken` → enumerate ALL
  in-frame participants; bind each canon one to its Bible canon, each
  un-canon one to a fixed extended description (2026-06-24 E12 rule above)

New Plan version (v01 → v02) must visibly differ in at least the flagged
dimensions. Cosmetic edits are a contract violation in revision mode.

Maximum 2 revision cycles. On 3rd REVISE → Plan REJECTED, escalate to
Director via `decision_requested` activity_event.

## Open questions (to refine with E22+ probes)

- Whether Bible character canon is reliably structured enough across all
  S14 characters to support smart-canon B without policy_notes — answer
  by inspecting E22 Plans on Day 5.
- Whether sub_area variation via prompt-only text is sufficient for the
  same-location fan-out problem, or anchor-level multi-view Bible is
  required (Director's q4 2026-05-18 — deferred to separate sprint).
- Whether single-aspect output (only `youtube_landscape`) holds for S14
  long-term or if YouTube Shorts joins MVP soon — affects multi-target
  decision rule.
- Whether un-canon recurring participants should be auto-promoted into an
  in-episode canon doc (Director 2026-06-24 — Theodor to consider an
  intra-episode canon document for non-Bible participants).

## Cross-references

- Agent spec: [`agents/exec/episode_reference_designer.md`](../../../agents/exec/episode_reference_designer.md)
- Runner: [`webapp/lib/agents/runners/episode-reference-designer.ts`](../../../webapp/lib/agents/runners/episode-reference-designer.ts)
- Critic: [`agents/exec/eref_design_reviewer.md`](../../../agents/exec/eref_design_reviewer.md) (Day 4)
- Executor: [`webapp/lib/agents/runners/episode-references.ts`](../../../webapp/lib/agents/runners/episode-references.ts) (refactored Day 3 to read Plan)
- Providers: [`openai-image.ts`](../../../webapp/lib/agents/providers/openai-image.ts), [`openai-edits-multi.ts`](../../../webapp/lib/agents/providers/openai-edits-multi.ts)
- Bible style canon: S14 STYLE CANON v1.1 (outline-only pencil edge, flat vector fills, no hatching)
- Shot rhythm: [`technology.md`](../../../technology.md) §3.5
- Naming: [`AGENTS.md`](../../../AGENTS.md) §3
