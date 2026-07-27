---
name: Architectural rethink over tactical patches
description: Director prefers root-cause architectural fixes (rewrite pipeline structure) over surgical patches when a structural defect is found. Don't propose narrow plans on top of broken design.
type: feedback
originSessionId: 063ac62d-3128-457d-96d1-b2c9907a7ad1
---
When Director identifies a structural defect (e.g. "all text agents use mockLLM" → "the entire pipeline is shallow, missing pre-production stages"), don't propose a tactical patch (e.g. "swap mockLLM for Anthropic"). He will reject the plan and ask for an architectural rethink.

**Why:** 2026-05-01 — I proposed a plan to replace mockLLM with real Anthropic adapter for text agents. Director rejected it with a 14-point critique pointing out missing pre-production stages (beat sheet, outline, locations bible, audio bible, animatic with music+SFX, continuity check, character turnaround sheets, cost gates), MVP-vs-Ideal split, asset versioning policy, and Concierge-as-assistant vision. The patch would have been built on top of a broken structure — fixing one layer while the architecture itself was missing 5 stages.

**How to apply:**
- Before proposing a fix for a symptom, ask: "is the structure around this symptom correct, or am I patching a hole in a sinking ship?"
- For pipeline / agent / production-stage work: check that all required stages exist in registry.ts and CLAUDE.md before extending one. Missing stages are more likely than buggy stages.
- When in doubt, propose the architectural overview first ("here's what I think the full pipeline should look like — confirm before I implement any single stage"), get Director sign-off, then build.
- Default to layered specs (separate documents for pipeline, series bible, agent tools, governance) rather than one giant CLAUDE.md edit — easier to review, references stay clean.
- Always offer an explicit MVP scope alongside the ideal architecture — Director's biggest fear is sinking months into infra without proving the creative idea works.
