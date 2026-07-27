# Skill Authoring — Abstraction Principle

> **Personal directive from this user. Applies to every project, every session.**
> Established: 2026-05-20 (SandyStudio session — `library-style-first` skill audit)

## The principle

A skill captures an **invariant technology or process**. It does NOT capture project-specific, series-specific, or task-specific content. Concrete content lives in higher-resolution sources of truth:

```
Skill (how)  →  Bible (what for series)  →  Brief (what for task)  →  Asset (artifact)
```

A skill must not cross downward. If you find yourself writing «output must be 2D», «use Sandy as canary», «if comedy, escalate gags» inside a generic skill — you have leaked Bible/Brief content into the skill layer. Stop, refactor.

## Why this matters

A skill that hard-codes content silently breaks the next time the production has different content. Examples that have actually happened or are about to happen:

- A visual-generation skill that hard-codes «2D / flat cartoon / no 3D» breaks the moment we ship a 3D series, even though the *sequencing rules* (style first, canary second, batch third) are still perfectly valid.
- A continuity skill that names a specific character («ensure Sandy stays in frame») cannot be reused for the next series. The rule «ensure protagonist stays in frame» is reusable.
- A genre rule («if comedy, gag-density ≥ 1 per 30 seconds») pretending to be universal pollutes drama/thriller productions. If a rule is genre-conditional, either split into genre-specific skills or move the threshold into Bible/Brief.

## Two skill flavors — declare in frontmatter

Every skill must declare its flavor:

### `flavor: process`

Abstract. Encodes a sequence, an invariant, an escalation protocol, a validation gate. **Must not** hard-code:
- style attributes (2D, 3D, realism, palette, line weight)
- character names, location names, prop names
- genre vocabulary (comedy, tragedy, horror, slapstick)
- product/version specifics (provider IDs, model IDs, durations)
- numeric thresholds tied to a particular production

Refers to source-of-truth attributes by *role*, not by *value*: «the declared style anchor», «the canary character per project Bible», «the gag-density target from Brief».

### `flavor: tool`

Bound to a specific product and version. **Must** declare in frontmatter:
```yaml
flavor: tool
tool: <product-name>
version: <semver-or-product-version-tag>
```

May contain concrete parameters for that exact version — duration clamps, aspect ratios, prompt templates, size tables. Becomes invalid for other versions; that is by design.

Examples that justify `flavor: tool`:
- «Seedance 2.0 prompting» — duration must be 5s or 10s; aspect 16:9 only; specific prompt scaffold.
- «gpt-image-2 size table» — allowed sizes per delivery target.
- «Veo 3.1 img2vid Standard» — 8s clamp; specific param shapes.

## Conflict resolution between sources

When a skill reads from multiple sources of truth (Bible AND Brief, for example), and those sources disagree on an invariant attribute, **the executor agent must escalate, not reconcile**.

Skill rule:
> If Bible declares X and Brief declares Y for the same invariant attribute, emit a HALT activity event citing both sources by ID/path. Do not pick a winner. Surface to Director (or to the supervising agent designated in the skill).

Silent reconciliation produces drift that surfaces three layers downstream as a quality failure with no clear cause.

## Anti-patterns (concrete)

| ❌ Bad | Why | ✅ Good |
|---|---|---|
| Process skill: «output must be 2D, flat cartoon, bold outline» | Medium belongs to Bible. Skill is invalid for the next 3D series. | «output must conform to the style anchor declared in Bible Style section + current Brief; preflight rejects any term contradicting the anchor's negative list» |
| Process skill: «use Sandy as canary character» | Character name is project-specific. | «use the canary character designated in project Bible; if absent, HALT and request Director to designate one» |
| Process skill: «if comedy, ensure at least one gag per shot» | Genre threshold belongs to Brief. | omit; or split into a `comedy-density` skill that explicitly applies only when `applies_when.genre = comedy`. The threshold itself still comes from Brief. |
| `flavor: tool` skill missing `tool:` + `version:` in frontmatter | Future-you can't tell which product version the rules apply to. Skill rots silently when the tool version bumps. | Declare both. State explicitly: «this skill is invalid for other versions of $tool; create a new skill or version-bump this one for new versions.» |
| `flavor: process` skill mixing concrete numbers («generate exactly 3 variants») | Hidden Brief override. | «generate the variant count specified in Brief; if unspecified, default to N (justified by Bible/Brief absence convention)» |

## Authoring checklist

Before saving any new skill — or accepting any skill written by another agent (Polina, me, Director):

1. **State flavor explicitly** in frontmatter. If you can't pick one, the skill probably mixes two concerns — split it.
2. **If `process`:** scan every hard rule (`hard: true` items, MUST/MUST NOT statements, numeric thresholds, vocabulary lists). For each concrete value, answer: *does this rule still hold for an opposite-genre, opposite-medium, opposite-product production?* If no, the value belongs to Bible or Brief, not the skill.
3. **If `tool`:** declare `tool` + `version`. Note in body that the skill is invalid for other versions.
4. **Conflict-Resolution section** if the skill reads from multiple sources of truth. State the escalation path: HALT + activity event + named sources, no silent reconciliation.
5. **The opposite-genre test:** imagine the rule applied to a 3D horror series, a black-and-white documentary, a stop-motion children's show. Would it still hold? If not, the rule is project-bound; extract it.
6. **The "fresh agent" test:** imagine a new agent on a new project reads this skill cold. Can they apply it without knowing the original production? If they need to know "ah, this was for SandyStudio comedy" — the skill is project-bound.

## Reference example

The first skill rewritten under this principle is `library-style-first-visual-generation-protocol`. Read it as the canonical example of `flavor: process` done right: it captures the sequence (style → canary → batch), the preflight pattern, the Director gates, the conflict-resolution path — and defers every concrete medium/style/character value to Bible+Brief.

## Cross-references

- Linked from [`~/.claude/rules/README.md`](README.md).
- SandyStudio CLAUDE.md §5 references this rule when authoring custom skills under `C:\SandyStudio\.claude\skills\`.
- Builds on [`partnership.md`](partnership.md) — proposing a skill that violates this principle is exactly the kind of «silent compliance with a flawed instruction» partnership.md forbids. Push back, propose the abstracted form.
- Inherits from [`coding-style.md`](coding-style.md) DRY/YAGNI/KISS — a leaky skill is the documentation equivalent of premature concretion.

## Operational notes

- This rule applies cross-project — every project, every skill author.
- It does NOT override copyright / privacy / safety rules.
- Existing skills written before this rule may violate it. Audit on touch — when you next modify a skill, refactor leaked content out of it. Do not mass-rewrite preemptively; touch + refactor naturally.
