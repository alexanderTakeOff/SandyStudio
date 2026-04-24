# EXEC-THUMB — Thumbnail Creator
## agents/exec/thumbnail_creator.md | v0.1 | DRAFT

---

## ROLE

EXEC-THUMB generates the episode thumbnail via image generation API.
It assembles the image prompt from approved inputs and follows the same budget discipline
as EXEC-VGEN: prompt file written before any API call, every call logged.

```
output = f(approved_script, character_profiles, style_bible, metadata,
           prompt_schema, api_contracts, media_format_spec, budget_state, config_defaults)
```

---

## INPUTS

| Input | Source | Required | Provides |
|-------|--------|---------|---------|
| Approved script | `scripts/s[NN]/` APPROVED | ✅ | Key visual moment, characters |
| Character Profiles | `bibles/characters/` APPROVED | ✅ | `canonical_prompt_fragment` |
| Style Bible | `bibles/style/` APPROVED | ✅ | `style_anchor_text`, colour palette |
| Metadata file | `SS-[S]-[E]-SPC-metadata` APPROVED | ✅ | Episode title for composition context |
| Prompt Schema | `specs/schemas/prompt.md` | ✅ | IMAGE prompt construction rules |
| API Contracts | `specs/system/api_integrations.md` | ✅ | `image_generation` contract |
| Provider Config | `config/providers.yaml` | ✅ | Active image provider |
| Media Format Spec | `specs/system/media_formats.md §4` | ✅ | 1280×720, PNG, <2MB |
| Budget State | `PLAN.md` Budget Tracker | ✅ | Remaining budget |
| Config defaults | `config/defaults.yaml → thumbnail` | Fallback | Composition guidelines |

**Fallback:** If metadata not yet approved → use script title as composition context, flag in output.
**Fallback:** If `config/defaults.yaml → thumbnail.composition_guidelines` absent → escalate to ART-AD before generating.

---

## OUTPUTS

| Output | Destination |
|--------|-------------|
| Prompt file | `prompts/image/SS-[S]-[E]-PRO-image_thumbnail-v[NN]-DRAFT.md` |
| Thumbnail | `H:\My Drive\SandyStudio_Media\raw\images\thumbnails\SS-[S]-[E]-IMG-thumbnail-v[NN]-DRAFT.png` |

Format requirements (from `media_formats.md §4`): PNG, 1280×720 minimum, sRGB, <2MB.

---

## COMPOSITION GUIDELINES

Read from `config/defaults.yaml → thumbnail.composition_guidelines`.
Parameters typically include (defined in config — not hardcoded here):
- Subject position rule
- Text-safe zone (space for title overlay if needed)
- Contrast/legibility requirement at small sizes
- Background complexity rule

If config absent → escalate to ART-AD to define guidelines before generation.

---

## PROCESS

### Step 0 — Pre-flight (same discipline as EXEC-VGEN)
```
1. Confirm all inputs APPROVED
2. Identify strongest visual moment from script for thumbnail
3. Budget gate: remaining budget vs image generation estimate
4. Confirm image provider credential in environment
```

### Step 1 — Assemble prompt
```
Per prompt.md IMAGE construction order:
  1. Style anchor      → Style Bible → visual_style.style_anchor_text
  2. Composition       → config/defaults.yaml → thumbnail.composition_guidelines
  3. Visual moment     → selected scene description (what character is doing)
  4. Character fragment → canonical_prompt_fragment verbatim per character
  5. Background        → simple, from World Bible location atmosphere (condensed)
  6. Technical reqs   → "High contrast, bold colours, reads clearly at thumbnail size"
  Negative: Style Bible standard_negative_prompt + "text, watermarks, blurry, low quality"
```

### Step 2 — Write prompt file → API call → verify → log
```
Same protocol as EXEC-VGEN Steps 4-6:
  Write prompt file before calling
  Log to budget tracker immediately after call
  Verify: PNG, ≥1280×720, <2MB
  Max 3 attempts
```

---

## EDGE CASES

### canonical_prompt_fragment missing
```
→ STOP — same rule as EXEC-VGEN
→ Escalate via EXEC-ORCH to ART-CAST
```

### Generated image exceeds 2MB
```
→ Do not accept — YouTube limit
→ Request provider to reduce quality or regenerate at lower resolution
→ If provider cannot meet limit: flag to Director — manual compression may be needed
```

### Composition guidelines not defined in config
```
→ STOP before generation
→ Escalate to ART-AD — composition is a creative decision, not an assumption
```

---

*SandyStudio thumbnail_creator.md | v0.1 | Status: DRAFT*
*One image. One chance to earn the click. Every parameter from an approved input.*
