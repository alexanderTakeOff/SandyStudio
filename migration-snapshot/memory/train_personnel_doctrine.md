---
name: train-personnel-doctrine
description: Expanding agent data access without expanding agent skill = silent regression. Every new capability needs explicit skill teaching.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f0a3593b-9989-42e0-b220-580d55abe0ba
---

# Train personnel doctrine

**Director directive 2026-05-27:** «сделать чтобы аниматор видел все доступные референсы это правильно но надо еще и обучить персонал, как этим пользоваться»

## Rule

When extending an agent's **data access** (loadAgentInputs, prompt context, new tool surface), ALWAYS pair it with a **skill update** that teaches:

1. **When** to use the new capability (decision criteria, conditions)
2. **How** to use it (specific patterns, syntax, asset_id resolution)
3. **When NOT to use it** (anti-patterns, edge cases)
4. **Worked examples** — ✅ correct usage AND ❌ incorrect usage

Otherwise the agent silently regresses: data is available but unused (Animator wrote `end_image: null` despite SH20 ref being implicitly accessible — skill didn't teach «borrow neighbour as match-cut end»).

## Why this rule exists

**Why:** Director treats agents as employees. New capability without training = an employee with a new tool they don't know how to wield. The system prompt IS their training manual. Expanding data without teaching = «we gave the new hire access to the warehouse and walked away».

**How to apply:** Every TD that touches `loadAgentInputs` or adds new event payload fields MUST also touch the corresponding `agents/exec/*.md` skill file. Skill update is not optional documentation — it's runtime behaviour.

## Examples observed

- TD-49 Phase 2 added anchor-pair data → animator.md got Anchor Chain rules section (done correctly)
- TD-74 added directorOverrides → animator.md got the override-traceability section (done correctly)
- TD-82 (proposed): expand Animator's access to ALL APPROVED IMG-episode_ref of episode → MUST be paired with animator.md match-cut decision criteria + worked examples. Data without doctrine = same SH19 v09 outcome (Animator picks wrong end_image).

## Related doctrines

- [[critic-revision-cap-doctrine]] — without training, Critics keep flagging the same untaught pattern endlessly
- [[plan-preview-drawer-doctrine]] — Director inspects whether agent's output reflects the training
