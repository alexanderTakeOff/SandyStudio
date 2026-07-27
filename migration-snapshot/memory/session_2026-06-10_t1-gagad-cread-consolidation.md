---
name: session-2026-06-10-t1-gagad-cread-consolidation
description: "T1 — retired EXEC-GAGAD, absorbed its per-shot reviews into EXEC-CREAD as eref/vanim phases. Net −1598 LoC."
metadata: 
  node_type: memory
  type: project
  originSessionId: 2e755c0c-5526-4d75-aa5d-4b6b0d477271
---

# Session 2026-06-10 — T1: GAGAD → CREAD consolidation

**What landed** (master `4c5da77` code + `173f2c8` PLAN, local, unpushed):
- EXEC-GAGAD **retired** as an agent. It never ran in prod (genre bug + plan-phase dead-by-construction: fired on script-approval but its gate required an approved storyboard).
- Its per-shot reviews absorbed into **EXEC-CREAD** as two new phases: `eref` (Designer SPC-ref_plan) + `vanim` (Animator SPC-shot_plan). They judge whether the per-shot plan still delivers the storyboard's readable intent against the genre skill — gag-fidelity re-sourced from storyboard+skill, **no SPC-gag_plan**.
- Dropped: dead plan-phase + `SPC-gag_plan` artifact; **V10** gag-fidelity check in EPREV+VPREV (.md + episode-reference-critic.ts code); GAGAD's bespoke `gagad_revision_count` (→ shared `applyCriticVerdict`, version-based cap→HALT); 4 PA concierge gag tools; GAGAD registry/gate/types/events/concurrency/trigger-maps; orphaned `gag_assistant_director.md`.
- Wiring: EPREV/VPREV PASS fires `exec-cread/review-ref-plan` / `review-shot-plan` only when `READABILITY_GATE_ENABLED` **AND** `isComedyLikeGenre` (flag OFF ⇒ null = pre-GAGAD legacy → replay-pilot identical).

**Verify:** tsc·0 / vitest **764/764** / replay-pilot **30/30**. Net line-delta **−1598** (756+/2354−).

**Key files:** `creative-readability-critic.ts` (phase dispatcher + runReviewPhase + haltNoPlaybook helper), `inngest/functions/exec-cread.ts` (+2 fns), `exec-eprev.ts`/`exec-vprev.ts` (re-pointed triggers), `runner.ts` EXEC-CREAD case (per-shot branch + REV-readability insert; EXEC-GAGAD case deleted). Per-shot verdict rows = `REV-readability` file_type, `metadata.{phase,shot_id}`, `cread_phase` in PERSIST_METADATA_KEYS.

**Design choice:** Director asked recommendation → picked **Option A** (rebuild per-shot review as thin CREAD phases) over B (defer/YAGNI) — rationale: guards the storyboard→render gag-loss point (the E02/E03 failure that birthed the sprint), cheap (~$0.08 Sonnet) insurance vs ~$3 Veo re-render, matches "one universal readability critic" directive, still net-subtractive.

**Open / NEXT:**
- Per-shot readability is **live but unexercised** — first real run (dry-run flags ON, dev SS-S15) will exercise CREAD storyboard+eref+vanim. Then cheap E03-rewrite C1-test (~$2).
- Director pushes (7 unpushed master commits). Not pushed by Тео.
- PA verdict-visibility tool for per-shot REV-readability: **deferred** (YAGNI — gag tools were deleted; add a small read-only tool only if Director wants it).
- **Pre-existing dirty working-tree files NOT touched/committed** (were dirty at session start, unrelated to T1): `webapp/lib/agents/providers/{fal-wan,gemini-flash-image,image-gen-multi-registry,video-gen-multi}.ts`, `lib/api/{eref-config,provider-catalog}.ts`, `webapp/_mon.mjs`. Left for whoever owns that work.

Plan: `~/.claude/plans/zazzy-launching-hollerith.md`. Builds on [[anti_additivity_principle]], [[critic_revision_cap_doctrine]].
