# SandyStudio — Character Visual Development Workflow
## specs/production/character_visual_development.md | v0.1 | DRAFT

> PA-005 — Pre-production phase added 2026-04-24 (Director reflection).
> This workflow runs BEFORE the production pipeline begins.
> It is a prerequisite gate: no pipeline can start until all character visual baselines are APPROVED.

---

## PRINCIPLE

**Character definition → approval → everything else.**

Before an episode goes into production, every character that appears in it must have:
1. An approved visual baseline (master reference image)
2. A tested canonical_prompt_fragment derived from that visual

You cannot write a storyboard prompt if you don't know what the character looks like.
You cannot know what the character looks like until the Director has approved it.

This workflow enforces that order.

---

## WHEN THIS RUNS

```
Project start (new series):          For every character in the series cast
New character introduced (mid-series): For that character only, before episode that introduces them
Character redesign:                   For the redesigned character, new version cycle
```

For the PILOT:
```
Sandy (CH_01):              → Run this workflow first
Inspector Stopwatch (CH_02): → Run this workflow first
→ Both APPROVED → production pipeline unlocked
```

---

## WORKFLOW

### Phase 0 — Library Search

```
Agent:  ART-CAST
Action: Before generating anything, search bibles/characters/references/ for:
  - Existing approved images of this character
  - Conceptually related approved images (similar style, body type)

Decision:
  A) Existing reference found → propose adaptation (cheaper, faster)
  B) No relevant reference found → proceed to Phase 1
  C) Partial match found → extract elements, proceed to Phase 1 with constraints

Time budget: 10 minutes maximum before escalating to Phase 1
```

---

### Phase 1 — Visual Brief

```
Agent:  ART-CAST
Input:  
  - Character profile DRAFT (visual_appearance section)
  - Creative direction (BOARD-CRD output)
  - Style Bible (style_anchor_text, colour palette)
  - World Bible (lighting default)

Output: Visual development brief per character:
  - Core design intent (1 sentence)
  - 4 variant directions (A–D), each with:
      * What proportion/expression/style choice it emphasises
      * Expected Midjourney prompt strategy
  - Generation parameters: neutral background, hard overhead spotlight, full body

Cost estimate: 4 variants × $0.03 = $0.12 per character
```

---

### Phase 2 — Variant Generation

```
Agent:  ART-CAST + EXEC-VGEN (draft generation mode)
Action: Generate 4 variants per character
        Midjourney v7 (or config.providers.yaml → image contract)
        
Variant brief template:
  [VARIANT A] Closest to written design brief — faithful interpretation
  [VARIANT B] Bolder, more graphic — stronger silhouette, higher contrast
  [VARIANT C] Softer, more restrained — finer detail, warmer palette
  [VARIANT D] Experimental — different proportion or texture emphasis

Format requirements for each variant:
  - Full body visible
  - Neutral background (white or near-white)
  - Single hard overhead spotlight (matches world default)
  - Front-facing or 3/4 view
  - No action pose — standing neutral

File naming:
  H:/My Drive/SandyStudio_Media/raw/images/
  [character_id]-visual-dev-v[round]-[variant]-DRAFT.png
```

---

### Phase 3 — Director Review

```
Present to Director:
  - All 4 variants side by side
  - One-sentence description per variant (what design choice it represents)
  - Recommendation from ART-CAST (with brief rationale)

Director response (one of):
  A) Approve specific variant → proceed to Phase 4
  B) Approve combination (e.g. "B proportions + C expression") → generate hybrid → loop Phase 3
  C) Request refinement (e.g. "make B less angular") → revise and regenerate → loop Phase 3
  D) Reject all → ART-CAST revises visual brief → return to Phase 1

Iteration budget: max 5 rounds. If unresolved after 5: Director escalates brief to ART-CAST directly.
Cost ceiling: 20 draft variants per character (~$0.60) before escalation.

NOTE: Variant approval is always the Director (or the human the Director explicitly
designates in the Approval Authority Matrix). No AI agent can approve a visual.
Agents propose. Humans decide what the character looks like.
```

---

### Phase 4 — Master Reference Image

```
Agent:  ART-CAST
Input:  Director-approved variant image

Action: Generate Level 0 Master Reference Image
  - Maximum available resolution (8K target)
  - Front-facing, full body, neutral expression
  - Hard overhead spotlight (cobalt fill per world default)
  - Pure white or transparent background
  - Clean outline — no texture noise, no background elements

Output:
  File: H:/My Drive/SandyStudio_Media/approved/images/
        [character_id]-master-ref-v01-APPROVED.png

Update character profile:
  master_reference_image_path: "[path above]"
  reference_variants.approved_variant: "[A/B/C/D or combination]"
  reference_variants.rounds: [N]
  reference_variants.date_approved: "[ISO date]"
  reference_variants.approved_by: "Director/CEO"
```

---

### Phase 5 — Fragment Derivation and Testing

```
Agent:  ART-CAST (writes fragment) + EXEC-VGEN (tests fragment)

Step 5a — Write fragment:
  ART-CAST writes canonical_prompt_fragment based on the approved visual.
  RULE: The fragment describes what IS in the approved image.
        Not what was imagined. Not the original brief. The approved image.

Step 5b — Test fragment (10 generations):
  EXEC-VGEN generates:
    - 5 images: fragment only (neutral context)
    - 5 images: fragment + typical shot context (spotlight, red carpet)

Step 5c — Technical check (agent):
  EXEC-VGEN runs automated comparison against master reference image:
  checks colour hex values, proportions within tolerance, outline style.
  Produces: fragment_test log with per-image pass/fail flags + score X/10.
  This is a technical pass — necessary but not sufficient.

Step 5d — Visual review (HUMAN — always):
  Director (or designated human approver per Approval Authority Matrix)
  reviews the fragment_test log AND looks at all 10 generated images directly.
  Human confirms: "yes, this looks like the character we approved."
  RULE: No AI agent can substitute for this review. Not even in Mode 3.
  
Step 5e — Gate:
  Human approver confirms ≥8/10 match → fragment APPROVED
  Human or agent flags <8/10 → ART-CAST revises fragment wording → return to Step 5b

Log: reviews/[series]-REV-fragment_test_[character_id]-v01-DRAFT.md
```

---

### Phase 6 — Profile Approval

```
Update character profile:
  fragment_test.tested: true
  fragment_test.pass_rate: "[X/10]"
  fragment_test.test_log: "[path to fragment test review]"
  fragment_test.tested_by: "EXEC-VGEN"
  fragment_test.tested_date: "[ISO date]"
  reviewed_by: "ART-AD"

Director review → status: APPROVED

Character profile is now gate-cleared for production pipeline.
```

---

## GATE TABLE

| Gate | Check | Fail action |
|------|-------|-------------|
| Phase 0 exit | Library searched | Escalate if skip attempted |
| Phase 2 entry | Visual brief present | Return to Phase 1 |
| Phase 3 approval | Director explicit approval | Loop or escalate |
| Phase 4 entry | Approved variant image exists | Block until Phase 3 complete |
| Phase 5 entry | master_reference_image_path not null | Block until Phase 4 complete |
| Phase 5 pass | fragment_test ≥8/10 | Loop fragment revision |
| Phase 6 gate | All fields filled + ART-AD sign-off | Block APPROVED status |
| Production gate | All characters APPROVED | Block pipeline start |

---

## COST MODEL

```yaml
per_character:
  phase_2_variants:   4 images × $0.03 = $0.12
  phase_3_iterations: avg 1.5 rounds × 4 images × $0.03 = $0.18
  phase_4_master_ref: 1 image × $0.04 = $0.04
  phase_5_fragment_test: 10 images × $0.03 = $0.30
  ─────────────────────────────────────────────
  typical_total:      ~$0.64 per character

series_s01 (2 characters):  ~$1.28
ceiling (5 rounds each):    ~$3.00
```

*Character visual development is the cheapest phase in the pipeline.
Get it right here — the cost of fixing character inconsistency in generated video is 100×.*

---

## FILE OUTPUTS

| Phase | File | Location |
|-------|------|----------|
| Phase 2 | `[id]-visual-dev-v[N]-[variant]-DRAFT.png` | `raw/images/` |
| Phase 4 | `[id]-master-ref-v01-APPROVED.png` | `approved/images/` |
| Phase 5 | `[series]-REV-fragment_test_[id]-v01-DRAFT.md` | `reviews/` |
| Phase 6 | `SS-[S]-BIB-character_[name]-v01-APPROVED.md` | `bibles/characters/` |

---

*SandyStudio character_visual_development.md | v0.1 | Status: DRAFT*
*PA-005 | Director reflection 2026-04-24 | Pending Director review*
