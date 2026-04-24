# SandyStudio — Character Visual Consistency Spec
## specs/system/character_consistency.md | v0.3 | DRAFT

> **✅ DIRECTOR DECISION: A2-Kling**
> Midjourney v7 generates canonical cartoon-style reference images.
> Kling 3.0 Elements uses those references to animate consistent characters.
> Approved by Director (Sandy) on 2026-04-24.
>
> **v0.3 update (2026-04-24):** Two-level reference architecture added (PA-001).
> Character Visual Development workflow added (PA-005).

---

## PURPOSE

Visual consistency of characters across all generated shots is the single hardest
technical problem in AI animation production. Each API call is stateless — the model
has no memory of what the character looked like in shot #1 when generating shot #47.

Without a deliberate consistency mechanism, each shot risks a subtly different character:
different proportions, slightly off colours, different expression baseline.
At episode scale (50–80 shots), this becomes visibly incoherent.

This spec defines:
1. The technical architecture for character reference (A2-Kling two-level system)
2. The pre-production workflow for establishing character visual baselines
3. How the reference flows into EXEC-VGEN at generation time

---

## SECTION 1 — TWO-LEVEL REFERENCE ARCHITECTURE

Every approved character has two reference tiers. Both must exist before production begins.

### Level 0 — Master Reference Image

```
What:   Single canonical 8K image of the character on a neutral background.
        Full-body view, front-facing, neutral expression, standard lighting.
        This is the immutable visual contract for the character.

Who:    ART-CAST proposes. ART-AD approves. Director signs off.

When:   Created during Character Visual Development (pre-production, PA-005).
        Not during the production pipeline — before it.

Lock:   LOCKED after first Director approval. Never overwritten.
        Design changes → new version (v02, v03...) + new master reference.

Storage: H:/My Drive/SandyStudio_Media/approved/images/
         Naming: [character_id]-master-ref-v[NN]-APPROVED.png

Profile field: master_reference_image_path  (added in character_profile.md v0.2)
```

### Level 1 — Scene Reference

```
What:   Shot-specific composite image: master reference + shot conditions
        (lighting, pose angle, sand state, other characters in frame).
        Generated per shot by EXEC-VGEN as Step 0 of generation workflow.

Who:    EXEC-VGEN generates automatically from master reference + shot spec.

When:   At generation time, immediately before the main generation call.
        Not stored permanently — regenerated each time if needed.

API:    Passed to Kling 3.0 Elements as character_reference parameter.
        Providers.yaml: character_reference: true is already set for character_video contract.

Purpose: Adapts the immutable master reference to the specific shot conditions
         without altering the character's fundamental appearance.
```

### Reference Flow at Generation Time

```
character_profile.master_reference_image_path
        ↓
EXEC-VGEN Step 0: Load master reference
        ↓
Compose with shot conditions (lighting, angle, sand state)
        ↓
Level 1 scene_reference image
        ↓
Kling 3.0 API call: prompt_text + character_reference + scene_reference
        ↓
Generated shot video
```

---

## SECTION 2 — TECHNICAL APPROACHES (archived for reference)

*(Decision made. Section kept for institutional memory.)*

| Option | Approach | Consistency est. | Effort | Decision |
|--------|----------|-----------------|--------|----------|
| A1 | Text fragment only | 70–80% | Low | Not selected |
| **A2** | **Reference image anchor** | **85–92%** | **Medium** | **✅ SELECTED** |
| A3 | LoRA fine-tune | 95%+ | High | Reserve for scale |
| A4 | Hybrid (A1→A2→A3) | Variable | Progressive | Superseded by A2 direct |

**A2-Kling specifics:**
- Midjourney v7 generates master reference images (high quality, character design control)
- Kling 3.0 Elements (`character_reference: true`) animates from reference
- Veo-3 (background shots, no character): text-only is sufficient
- Config: `config/providers.yaml → character_video_contract → character_reference: true`

---

## SECTION 3 — CHARACTER VISUAL DEVELOPMENT WORKFLOW (PA-005)

*This is the pre-production phase that must complete before ART-CAST writes
the final canonical_prompt_fragment and before the production pipeline begins.*

### Step 1 — Search Existing Library

```
Agent: ART-CAST
Action: Before generating anything, check bibles/characters/references/ for
        any prior approved images of this character (or conceptually similar characters).
        Re-use or build on existing references where possible.
Result: Either proceed to Step 2, or propose adaptation of existing reference.
```

### Step 2 — Generate Visual Variants

```
Agent: ART-CAST + EXEC-VGEN (draft generation)
Action: Generate 3–4 distinct visual variants of the character.
        Each variant explores a different interpretation of the visual direction brief.
        Use: Midjourney v7 or equivalent — low cost, fast iteration.
        Format: Full-body, neutral pose, white/neutral background, consistent lighting.
        Cost: ~$0.02–0.04 per variant (Midjourney standard)

Variant brief structure:
  - Variant A: closest to written design brief
  - Variant B: slightly bolder/more graphic interpretation
  - Variant C: slightly softer/more restrained interpretation
  - Variant D: optional — experimental (e.g. different proportion emphasis)
```

### Step 3 — Director Review

```
Present all variants to Director with brief note per variant explaining
what design choice it emphasises.

Director selects preferred variant OR:
  - Requests combination (e.g. "B proportions, C expression")
  - Requests refinement ("add more wear/texture to B")
  - Rejects all → return to Step 2 with revised brief
```

### Step 4 — Iterate to Approval

```
Iterate Step 2→3 until Director approves a specific visual as the character baseline.
Typical: 1–2 rounds. Max: 5 rounds before escalating to ART-AD for brief revision.

Cost budget: max 20 draft variants per character before escalation.
```

### Step 5 — Master Reference Image

```
Agent: ART-CAST
Action: From the approved variant, generate the definitive Level 0 Master Reference Image.
  - 8K resolution (or maximum available)
  - Front-facing, full-body
  - Neutral expression (canonical default state)
  - Neutral background (#FFFFFF or transparent)
  - Hard overhead spotlight (matches world lighting default)

Store at: H:/My Drive/SandyStudio_Media/approved/images/
          [character_id]-master-ref-v01-APPROVED.png

Update character profile: master_reference_image_path → this file path
```

### Step 6 — Write canonical_prompt_fragment

```
Agent: ART-CAST
Action: After master reference is approved, derive canonical_prompt_fragment
        from the approved visual — not from abstract description.
        The fragment must describe exactly what was approved in the reference image.

Test (Section 5 below): Generate 10 test images using fragment only.
  ≥8/10 match master reference → fragment approved for profile.
  <8/10 → revise fragment wording → retest.
```

### Gate: Nothing Proceeds Without This

```
Character profile cannot reach APPROVED status without:
  ✅ master_reference_image_path filled (not null)
  ✅ canonical_prompt_fragment tested and validated
  ✅ Both approved by Director

Production pipeline gate: All character profiles APPROVED → pipeline unlocked.
```

---

## SECTION 4 — EXEC-VGEN GENERATION WORKFLOW (updated for PA-001)

When EXEC-VGEN processes a shot that includes a character:

```
Step 0a: For each character in shot.characters_present:
         → Load character profile (approved version)
         → Check: master_reference_image_path is not null
         → Load master reference image from path
         → If null: STOP — escalate upstream. Production gate failure.

Step 0b: Compose Level 1 scene reference
         → master_reference_image + shot.lighting_description
         → + shot.camera_angle (to adjust pose reference)
         → + sand_state (if sandy) or arrow_brow_position (if inspector)

Step 1: Assemble generation prompt
         → [STYLE] from style_bible.style_anchor_text
         → [COMPOSITION] from shot.camera
         → [ACTION] from shot.action
         → [CHARACTER: id] → canonical_prompt_fragment (injected verbatim)
         → [LOCATION] from shot.location
         → [LIGHTING] from shot.lighting
         → [MOOD] from shot.mood
         → [NEGATIVE] from style_bible.standard_negative_prompt

Step 2: API call
         → Contract: character_video (if characters present)
         → Contract: video (if no characters)
         → character_reference: scene_reference image (Level 1)
         → character_reference: true (already in providers.yaml)

Step 3: Log output
         → consistency_score (when real: from API response; mock: 0.95 flat)
         → reference_image_version: master_reference_image_path version
```

---

## SECTION 5 — CANONICAL PROMPT FRAGMENT TESTING PROTOCOL

Before a Character Profile can move from DRAFT to REVIEW:

1. ART-CAST writes initial `canonical_prompt_fragment`
2. EXEC-VGEN generates 5 test images using only the fragment (no shot context)
3. EXEC-VGEN generates 5 test images with fragment + typical shot context
4. EXEC-VGEN runs automated technical check (colour/proportion/outline) → fragment_test log
5. **Director (or designated human visual approver) reviews all 10 images against master reference.**
   RULE: Visual review is always human. No AI agent can approve a visual in any governance mode.
6. If human confirms ≥8/10 match: fragment approved
7. If <8/10: ART-CAST revises fragment wording → retest from step 2

Test results logged in: `reviews/SS-[SERIES]-REV-fragment_test_[character_id]-v01-DRAFT.md`

---

## SECTION 6 — VERSION CONTROL

| Event | Action |
|-------|--------|
| Character design change (any visual element) | New profile version + new master reference image |
| Fragment text refinement only (no visual change) | Fragment update only, same profile version, re-test required |
| New season with redesigned character | New profile version v02+, old version LOCKED |
| Production in progress with character_reference: true | Do NOT change master reference during production run |

---

*SandyStudio character_consistency.md | v0.3 | Status: DRAFT*
*PA-001 (reference architecture) + PA-005 (visual development workflow) implemented*
*Prev: v0.2 APPROVED (director decision). This version pending Director review.*
