# SandyStudio — Character Visual Consistency Spec
## specs/system/character_consistency.md | v0.2 | APPROVED

> **✅ DIRECTOR DECISION: A2-Kling**
> Midjourney v7 generates canonical cartoon-style reference images.
> Kling 3.0 Elements uses those references to animate consistent characters.
> Approved by Director (Sandy) on 2026-04-24.

---

## PURPOSE

Visual consistency of characters across all generated shots is the single hardest
technical problem in AI animation production. Each API call is stateless — the model
has no memory of what the Pink Panther looked like in shot #1 when generating shot #47.

Without a deliberate consistency mechanism, each shot risks producing a subtly
different character: different proportions, slightly off colours, different expression baseline.
At episode scale (50–80 shots), this becomes visibly incoherent.

This spec defines the technical approach SandyStudio uses to solve this problem.

---

## THE FOUR OPTIONS

### A1 — Canonical Prompt Fragment (text only)

**How it works:**
A precise, tested text description of each character is written and locked in the
Character Profile as `canonical_prompt_fragment`. This exact text is injected into
every generation prompt that features the character, in addition to the shot-specific content.

**Example fragment (Pink Panther):**
```
tall slender anthropomorphic pink panther, dusty rose pink fur (#E8A0A8),
charcoal outline, heavy-lidded cool expression, walks upright, languid graceful
movement, 1960s animated cartoon style, clean lines, flat colour with soft shading,
expressive tail
```

**Pros:**
- Simple to implement immediately
- No additional cost or infrastructure
- Works with all APIs (Veo3, Kling, Midjourney)
- Fragment can be refined over time

**Cons:**
- Text descriptions are interpreted differently by different models and even different runs
- Consistency degrades with complex scenes (many characters, unusual angles)
- No guarantee of exact colour reproduction
- Estimated consistency rate: ~70–80% across shots (subjective)

**Implementation effort:** Low (write the fragment, test, lock in profile)
**Cost overhead:** None

---

### A2 — Reference Image Anchor

**How it works:**
A canonical reference image of each character is generated and approved.
This image is submitted alongside every generation prompt as a visual style/character anchor,
using the image-to-video or image reference features of supported APIs.

**Supported by:**
- Kling (character consistency mode)
- Midjourney (image reference with --cref flag)
- Veo3: partial support (style reference, not character-locked)

**Pros:**
- Visual consistency significantly higher than text-only (~85–92%)
- Model can match colours, proportions, and style more reliably
- Anchor image is the visual contract — unambiguous

**Cons:**
- Requires generating and approving canonical reference images first (extra step)
- API support varies — Veo3 character locking is limited as of early 2026
- Reference image must be updated if character design changes (version cascade)
- Slightly higher API cost (image submitted with each call)

**Implementation effort:** Medium (generate reference images, integrate into EXEC-VGEN workflow)
**Cost overhead:** ~5–10% more per generation call

---

### A3 — LoRA / Fine-Tune

**How it works:**
A custom model is fine-tuned (LoRA) on a set of approved canonical character images.
Every generation call uses the fine-tuned model, which has the character "baked in".

**Pros:**
- Highest consistency rate (~95%+)
- Characters become first-class model concepts
- Works across all shot types and angles

**Cons:**
- Requires 20–50 training images per character (must be generated or sourced first)
- Fine-tuning cost and time (hours, not minutes)
- Fine-tuned model must be re-trained if character design changes
- Requires technical infrastructure (ComfyUI, Replicate, or similar)
- Not available natively in Veo3 (as of early 2026)

**Implementation effort:** High
**Cost overhead:** Training cost per character + hosting

---

### A4 — Hybrid: A1 now, A2 on pilot, A3 if needed

**How it works:**
Start with A1 (text fragment) for the bootstrap phase.
After generating the first 10–15 shots and seeing actual consistency level,
upgrade to A2 (reference image anchor) if A1 is insufficient.
Reserve A3 (LoRA) as a future option if the series scales significantly.

**Pros:**
- Unblocks production immediately
- Evidence-based decision: upgrade only if needed
- Lower initial investment
- Can course-correct after seeing real output

**Cons:**
- Potential rework if A1 proves insufficient: existing prompts may need updating
  when upgrading to A2 (version cascade on all prompts)
- Slightly lower consistency in earliest shots

**Implementation effort:** Low to start, Medium if upgrade triggered
**Cost overhead:** None to start, ~5–10% if upgrade to A2

---

## SECTION 3 — DIRECTOR DECISION

**Choose one approach:**

| Option | Approach | Recommended for |
|--------|----------|-----------------|
| **A1** | Canonical prompt fragment only | Fastest start, accept variability |
| **A2** | Reference image anchor | Best quality/effort balance |
| **A3** | LoRA fine-tune | Maximum quality, significant investment |
| **A4** | Hybrid (A1 → A2 → A3) | **Recommended — pragmatic and evidence-based** |

**Sandy's choice:** ✅ **A2-Kling** — Midjourney reference image → Kling 3.0 Elements for animation

---

## SECTION 4 — IMPLEMENTATION (fills in after decision)

*This section will be completed once Director selects an approach.*

### If A1 or A4 selected:
```
Workflow addition to EXEC-VGEN:
  1. For each character in shot.characters_present:
     → Read character_id → load canonical_prompt_fragment from approved profile
     → Inject fragment into prompt_text at position [CHARACTER FRAGMENTS]
  2. Validate fragment version matches current approved profile version
  3. Log fragment version in prompt file's character_fragments array
```

### If A2 or A4(upgraded) selected:
```
Additional workflow:
  1. Reference image library maintained in: bibles/characters/references/
     Naming: [character_id]-reference-v[NN]-APPROVED.png
  2. EXEC-VGEN submits reference image alongside prompt per API spec
  3. Reference image version logged in prompt file
  4. When character profile updates: new reference image required
     → version cascade on all prompts using old reference
```

---

## SECTION 5 — CHARACTER FRAGMENT TESTING PROTOCOL

Before a Character Profile can move from DRAFT to REVIEW:

1. ART-CAST writes initial `canonical_prompt_fragment`
2. EXEC-VGEN generates 5 test images using only the fragment (no shot context)
3. EXEC-VGEN generates 5 test images with fragment + typical shot context
4. ART-AD reviews all 10 images against character visual_appearance spec
5. If ≥8/10 match: fragment approved for profile
6. If <8/10: ART-CAST revises fragment → retest

Test results logged in: `reviews/SS-PILOT-REV-fragment_test_[character_id]-v01-DRAFT.md`

---

*SandyStudio character_consistency.md | v0.1 | Status: DRAFT — awaiting Director decision*
