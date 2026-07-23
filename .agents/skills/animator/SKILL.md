---
name: animator
description: Decision playbook for the Animator (EXEC-VANIM). Covers provider choice per shot role, quality tier per hero-marker, aspect per delivery_target, duration with action-complexity reasoning, seed locking, end_image strategy, prompt formulation (Seedance 7-slot vs Veo prose), and running negative-term list. Pairs with `agents/exec/animator.md` and lazy-loads `seedance-prompting` / future `veo-prompting` sub-skills per chosen provider.
status: ACTIVE
owner: EXEC-VANIM (Animator)
applies_when:
  agent: [EXEC-VANIM]
hard: false
created: 2026-05-18
---
# Animator — Decision Playbook (SandyStudio)

> **v0.1 Day 6-7 of Sprint «Дизайнер и Аниматор».** Animator (EXEC-VANIM) is
> the LLM-driven Plan author for video generation. This skill captures the
> decision rules. v0.2 lands on Day 11 retro with E22 production data.

## When this skill applies

- Agent is `EXEC-VANIM` (Animator).
- Agent is composing a `SPC-shot_plan-<shot_id>` Plan-asset for one shot.
- The Plan goes through Critic (EXEC-VPREV) → Director review → APPROVED.
  Only after APPROVED, the EXEC-VGEN executor reads the Plan and calls the
  actual video provider.

## Decision dimensions

### Provider per shot role (sprint allowlist)

| shot_role / context | Provider choice | Rationale |
|---|---|---|
| Establishing wide / non-hero / iteration loop | `seedance-fast` | Cheapest, fastest, "good enough" frame quality for iteration |
| Hero shot · complex prose · long emotion arc | `veo-standard` | Cinematic prose handling, character emotion fidelity |
| **STATIC** camera-tightening · character-enter · emotion peak | `seedance-with-end-image` | Use approved EREF as end_image for arc continuity. **NEVER on an orbit shot** — orbit ⇒ ref-only (`seedance-standard`), Critic V15. |

When in doubt: `seedance-fast` first. Director's Stage A 2026-05-18 baseline.

### Quality tier per hero-marker

- **fast** — default for first pass / iteration / non-hero
- **standard** — only when storyboard flags `shot_role=hero` OR Director-
  approved direction is being re-rendered for final cut

### Aspect per delivery_target

Lookup from `episode.metadata.delivery_targets[0]`:

| delivery_target | Aspect |
|---|---|
| youtube_landscape | 16:9 |
| youtube_shorts | 9:16 |
| instagram_reels | 9:16 |
| tiktok | 9:16 |
| instagram_post | 1:1 |
| print_poster | 16:9 (static, but reuse 16:9 for video) |

**Hard validation — cross-check before submitting (added 2026-07-10, TD-incident SS-S15-E25):**
Before finalizing the Plan, cross-check `delivery_targets` against `aspect_ratio` using
THIS SAME table — the mapping must be consistent in BOTH directions, not just when first
picking `aspect_ratio`. If the episode's FORMAT authority mandates a given `aspect_ratio`
(e.g. `9:16`), `delivery_targets` MUST contain ONLY targets whose row maps to that aspect
(aspect=9:16 → delivery_targets ∈ {youtube_shorts, instagram_reels, tiktok}; NEVER
youtube_landscape or print_poster, which are 16:9). Do this check EVERY time you author or
re-author a Plan — including on revision passes — never assume a carried-over
`delivery_targets` value from a prior draft is still valid once `aspect_ratio` changes.
Critic V06 checks this and will REVISE the Plan, but do not rely on the Critic catching it —
self-validate before submitting so the Plan passes on the first pass, not the second or third.

### Render duration vs creative cut

`duration_seconds` in your Plan is the **RENDER duration** — what the generator
produces — and MUST lie within the chosen provider's render range. That range is
sourced live from the capability manifest (the input-context block "Provider
render-duration contracts" lists each allowlisted provider's [min,max]); it is
NEVER hardcoded here. The runner re-clamps deterministically, so author in range.

A short creative beat (a 1-2s reaction) is NOT written as a sub-floor render
duration. The creative **CUT length** lives in the animatic; the rendered clip is
trimmed to it downstream at stitch. So pick the render duration that lets the action
read, at or above the provider floor:

| Action complexity | Render duration |
|---|---|
| Static / reaction beat | provider floor (min) |
| Single action (one verb, one move) | floor … +1s |
| Compound action (verb + camera move) | mid-range |
| Complex sequence (multi-step, multi-character) | upper-range (Veo Standard with reference forces 8s — see below) |

**Veo 3.1 image-to-video Standard quirk** (technology.md §3.5):
when a reference image is attached, only `duration=8s` is accepted. If your
Plan picks `veo-standard` with `reference_anchor.kind != 'none'` and a
shorter duration, the executor will force 8s — flag in policy_notes.

### Seed strategy

- **random** (first iteration) — `seed_value: null`
- **locked** — only after Director APPROVES a rendered shot. Then use the
  approved seed for batch-consistent re-renders or sibling shots.

### End-image strategy

> **Orbit ⇒ ref-only (empirical, 2026-06-17).** A pinned `end_image` fights a
> camera orbit — the camera hitches/morphs toward the locked frame instead of
> arcing (E10 SH07/SH03 A/B smoke, Director verdict «с рефом гораздо лучше»).
> So `end_image` applies ONLY to **STATIC** shots. If `opening_camera_motion.kind
> === 'rotate'` (orbit) — which is 80%+ of shots — set `end_image.eref_asset_id:
> null` and use `seedance-standard`/`seedance-fast`. Critic V15 REVISES any orbit
> Plan that pins an end_image.

Use `seedance-with-end-image` provider ONLY on a **static (non-orbit)** shot that:
- is a camera-tightening landing on a held frame (wide → medium → close-up), OR
- has a character-enter beat ending with the character in a fixed place, OR
- is an emotion peak that should land on a held composition.

Pick `eref_asset_id` = the APPROVED IMG-episode_ref for THIS shot (continuity
anchor). When the shot orbits, or no EREF exists yet → set `end_image.eref_asset_id:
null` and use plain `seedance-standard` / `seedance-fast`.

### Resolution per delivery target

Resolution is NOT a fixed «always 1080p» — it is read from the chosen
provider's contract. Your input context carries a «Provider resolution
contracts» block listing each provider's `supported_resolutions` (sourced
from the capability manifest, the single source of truth). Pick from THAT set:

- If the provider's set is **empty**, the provider is fixed-resolution
  (no chooser) → set `resolution: null`. Do not invent a value.
- **Iteration / draft / non-hero** shots → choose the **lowest cost-effective**
  resolution the contract offers. Same intent as the `fast` quality tier:
  iteration burns budget, so do not pay for the top tier while looping.
- **Hero / final / approved-for-render** shots → choose the **episode delivery
  resolution** (the high end of the supported set), so the approved Plan's
  cost estimate is truthful for the final render. Tie this to the same
  `shot_role=hero` / Director-approved-direction marker that gates
  `quality_tier: standard`.

Resolution multiplies cost (see `resolution_cost_mult` / `estimateCost` in
the capability manifest) — a higher tier is a real budget decision, not a
free default. Never declare a resolution outside the provider's supported
set: Critic V13 returns the Plan for revision, and the executor hard-fails it.

### Prompt formulation

Lazy-load the sub-skill per chosen provider:

| Provider | Sub-skill | Format |
|---|---|---|
| `seedance-fast` / `seedance-with-end-image` | [`seedance-prompting`](../seedance-prompting/SKILL.md) | 7-slot: SUBJECT · ACTION · CAMERA · LIGHTING · STYLE · CONTINUITY · NEGATIVE |
| `veo-standard` | (no sub-skill — pure prose) | Cinematic prose with explicit camera direction |

**Seedance hard rules** (from `seedance-prompting`):
- Hard rule #1: SUBJECT must be a noun phrase, not a sentence
- Hard rule #2: identity described structurally (physical_anchors / costume / current_mood), not as novel-prose
- Hard rule #4: ≤1 primary action per shot — multi-action = blur

**Veo prose tips**:
- Open with cinematic camera direction ("WIDE static shot…", "TRACKING low-angle…")
- Drop character bible-slugs verbatim; let Veo handle identity from text
- Close with explicit style anchor from Bible style canon

### Smart canon B (Director directive 2026-05-18)

Reference Bible canon STRUCTURALLY:
```
physical_anchors: …
costume: …
current_mood: …
```

NOT as novel-prose:
```
WRONG: "Sandy, a 30-year-old man with brown hair, wears a leather jacket
while looking confused…"
```

### Running negative-term list

Baseline (always include):
- `no text`
- `no logos`
- `no watermarks`
- `no captions`

Shot-specific guards:
- Solo character shots → add `no doppelgangers`, `no duplicate characters`
- Tight close-ups → add `no face morph`, `no extra limbs`
- Action shots → add `no blur` (Seedance), `no motion artifacts`
- Static beats → add `no camera shake`, `no zoom drift`

## Camera movement aggressiveness (Director Stage A directive)

Director Stage A 2026-05-18 issue #2: Seedance under-emits motion. When the
storyboard supplies a non-trivial `camera_movement` (whip-pan, dutch-tilt,
orbit, push-in beyond 5%):

- Use **emphatic verb form** in the CAMERA slot: «aggressively whip-pans left
  to right» (not «pans left to right»)
- Add motion-intensity descriptor: «fast», «aggressive», «sharp», «dynamic»
- For push-in beyond 5%: state percentage explicitly («20% rapid push-in»)

Static + 5% push-in remains the default ONLY when storyboard explicitly
says so.

## Cross-references

- Agent prompt: [`agents/exec/animator.md`](../../../agents/exec/animator.md)
- Runner: [`webapp/lib/agents/runners/animator.ts`](../../../webapp/lib/agents/runners/animator.ts)
- Critic: [`agents/exec/animator_critic.md`](../../../agents/exec/animator_critic.md) (Day 8)
- Providers: [`fal-seedance.ts`](../../../webapp/lib/agents/providers/fal-seedance.ts), [`veo-gemini.ts`](../../../webapp/lib/agents/providers/veo-gemini.ts)
- Resolution SSOT (supported_resolutions + cost multiplier): [`provider-capabilities.ts`](../../../webapp/lib/api/provider-capabilities.ts)
- Bible style canon: S14 STYLE CANON v1.1 (outline-only pencil edge, flat vector fills, no hatching)
- Shot rhythm: [`technology.md`](../../../technology.md) §3.5 (3-5s cuts, gag floor)
- Seedance prompting: [`seedance-prompting`](../seedance-prompting/SKILL.md) v0.1+
