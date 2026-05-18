# Skills as Agent Capabilities

**Status:** v1 — 2026-05-16 (Sprint φ)
**Owner:** Director
**Replaces:** the σ-era framing of skills-as-atomic-rules.

This document is the source of truth for what a **skill** is in SandyStudio,
how it differs from a **brief** or **bible**, who consumes it, and how
Director feedback accretes over time.

---

## The mental model

A **skill** is one capability of one agent — by direct analogy to
[Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills).
It is a self-contained markdown playbook describing **how to do X**, where X
is a craft area large enough to need its own techniques, worked examples,
anti-patterns, parameter playbooks, and known quirks.

A skill is **not** an atomic Director rule. A rule like «every comedy shot
must carry a gag» is one technique inside a broader capability playbook
(`storyboarder-situational-comedy`), not a standalone file. Standing alone,
the rule lacks context; embedded in the capability, it becomes one entry in
a working playbook the agent can apply with judgment.

The reference shape is [`seedance-prompting`](../.claude/skills/seedance-prompting/SKILL.md):
~175 lines covering one provider — seven prompt slots, a parameter playbook,
hard adapter constraints, a worked example, known quirks, and open
questions. New skills follow this shape.

---

## Granularity — per-agent, per-capability

Skills live on **two axes**:

1. **Agent** — which agent's repertoire this is. Same domain, different
   agent → different skill files. The screenwriter's «how to write
   situational comedy» and the storyboarder's «how to storyboard
   situational comedy» are different playbooks because the craft is
   different.
2. **Capability** — one discrete craft area within that agent. Genre
   (comedy / fantasy / tragicomedy), medium (2D / 3D / limited animation),
   craft layer (prose / camera / rhythm), or provider (Seedance / Veo).

Example repertoire — partial, illustrative:

| Agent | Skill repertoire |
|---|---|
| Writer (`EXEC-SW`) | `writer-situational-comedy`, `writer-tragicomedy`, `writer-fantasy`, `writer-2d-medium`, `writer-pacing-rhythm` |
| Storyboarder (`EXEC-SB`) | `storyboarder-situational-comedy`, `storyboarder-prose-craft`, `storyboarder-camera-language`, `storyboarder-rhythm-pacing` |
| Reference Artist (`EXEC-EREF`) | `eref-shot-composition`, `eref-character-consistency`, `eref-location-anchoring` |
| Animator (`EXEC-VGEN`) | `seedance-prompting`, `veo-prompting`, `vgen-shot-rhythm` |
| Prod Assistant (`EXEC-CONC`) | `concierge-rule-distillation`, `concierge-leading-pipeline`, `concierge-approval-gating` |

A single agent typically has 3-7 active skills. Far fewer than the number
of Director directives — because each skill absorbs many.

---

## Skill ≠ Brief ≠ Bible

| Concept | What it is | Lives in |
|---|---|---|
| **Skill** | how an agent **does** X — craft, techniques, anti-patterns | `.claude/skills/<slug>/SKILL.md` |
| **Brief** | what to **produce** for this episode — premise, mandatory beats, runtime | `SS-{S}-{E}-SPC-brief-*.md` |
| **Bible** | canonical **constraints** — characters, world, style | `bibles/{characters,world,style}/*.md` LOCKED |

Skills are reusable across episodes. Briefs are per-episode. Bibles are
canonical and version-controlled.

When in doubt: «is this a craft technique an agent applies anywhere?» →
skill. «Is this a constraint for this episode only?» → brief. «Is this a
canonical fact about a character or location?» → bible.

---

## Lazy loading — two-step agent run

Following the Claude Code pattern, an agent does **not** receive the body
of every applicable skill upfront. It receives a **manifest** of available
capabilities and activates the relevant subset.

```text
Step 1 — Skill selection
  manifest = getAgentSkillManifest({ agentId, genre, series_id, episode_id })
  // manifest: [{ slug, name, description, applies_when }] — frontmatter only
  selection = LLM("Your capabilities: <manifest>. Pick the ones relevant
                  to this task. Reply ONLY JSON {activated_skills: [...]}.")

Step 2 — Real work
  bodies = loadSkillBodies(selection.activated_skills)
  output = LLM(systemPrompt + <bodies> + task)
```

Cost: ~2× the single-call agent run. Storyboarder ~$0.05 → ~$0.10. The
gain is reasoning quality: the agent decides which playbooks apply and
which would be noise, rather than being force-fed everything that matches
a frontmatter predicate.

**Shortcut:** when the manifest has ≤2 skills and they obviously apply,
the runner skips Step 1 and loads all bodies directly. Telemetry records
this as `selection_skipped: true`.

---

## Consumer types — who reads skills and how

| Consumer | Examples | How skills reach it |
|---|---|---|
| **LLM reasoning agent** | Storyboarder, Writer, Concierge, Story Reviewer | Two-step lazy load (manifest → bodies into prompt) |
| **Dumb media generator** | EREF (gpt-image-1), VGEN (Seedance / Veo), MGEN (Suno), THUMB (gpt-image-1), STITCH (ffmpeg) | Manifest only — runner consumes skill metadata, never injects body into the output-medium prompt |

The distinction matters. A dumb generator visualizes its prompt literally;
injecting «every shot must carry a gag» as text into a gpt-image-1 prompt
poisons the image with meta-instructions instead of producing a clean
visual.

When a future runner for VGEN / THUMB / MGEN wants to apply a skill, it
**transforms** the skill's data into a concrete output-medium parameter
(e.g. closed-vocabulary camera angle picker, negative-prompt constraint
list). It does not paste the markdown body.

---

## Learning Loop — Director feedback default path

When Director articulates a forever-rule or craft technique:

1. Identify the **target agent** (Storyboarder? Writer? EREF?).
2. `listSkills({ agent: <target> })` — see existing capabilities.
3. **Default — `updateSkill`**: if an existing skill's scope fits, append
   the new technique as a section inside that skill's body.
4. **Exception — `proposeSkill`**: only when the feedback opens a
   genuinely new capability (no existing skill covers this domain). The
   new file is a broad playbook, not a single-rule shard.
5. Both paths require Director verbal approval before the file is
   written.

90% of feedback refines an existing playbook. Creating new files is the
rare path. The Prod Assistant defaults to update, not create.

---

## What does not belong in a skill

- Per-episode parameters (those go in the Brief).
- Canonical character or world facts (those go in the Bible).
- Director's mood for one specific shot (that's chat feedback, not canon).
- Implementation details of a runner (those live in code comments).
- Atomic single-rule files like «no water bottles as primary gags». If
  the rule is real, it lives as one entry inside a broader capability
  skill, or as a constraint inside the relevant brief.

---

## File contract

Every `SKILL.md` carries YAML frontmatter:

```yaml
---
name: storyboarder-situational-comedy
description: How EXEC-SB authors comedy storyboards — micro-cycle, prose craft, beat timing.
status: ACTIVE                # ACTIVE | DRAFT | DEPRECATED
owner: Director
applies_when:
  agent: [EXEC-SB]
  genre: [comedy]
hard: false
created: 2026-05-16
---
```

`hard: true` is reserved for skills that must always be applied when their
scope matches (rare — most playbooks are guidance). `applies_when` fields
are optional; omitting a field means «applies broadly on that axis».

---

## Cross-references

- Reference shape: [`seedance-prompting`](../.claude/skills/seedance-prompting/SKILL.md)
- Selector: [`webapp/lib/skills/select-skills.ts`](../webapp/lib/skills/select-skills.ts)
- Two-step helper: [`webapp/lib/agents/load-skills.ts`](../webapp/lib/agents/load-skills.ts)
- PA tools: [`webapp/lib/concierge/tools/skills.ts`](../webapp/lib/concierge/tools/skills.ts)
- UI: [`webapp/app/(studio)/skills/page.tsx`](../webapp/app/(studio)/skills/page.tsx)
