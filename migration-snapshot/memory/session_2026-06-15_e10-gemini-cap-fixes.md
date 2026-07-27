---
name: session-2026-06-15-e10-gemini-cap-fixes
description: "2026-06-15 — 3 root fixes (regen-cap, Mode-4 supersede, Polina→Gemini); E10 28/28 anchors on gemini-free; OpenAI billing-limit incident; SH23 45-variant runaway forensics"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0d93e857-b510-44ee-8434-47b5a7caaf1e
---

E10 hardening + provider-cost firefight. Master HEAD `7cd2238`, origin in sync. Session file:
`~/.claude/session-data/2026-06-15-e10-gemini-cap-session.tmp`.

## Shipped to master (pushed)
- `d2cdd40` regen-cap — `lib/api/plan-regen-guard.ts` assertPlanRegenWithinCap (in-flight + autonomous
  cap PLAN_REGEN_CAP=3 → HALT+escalate; human Director uncapped). Wired /trigger + /regenerate-image-
  from-plan. Root: Polina's UNCAPPED "Mode 4 auto-recovery" re-fired regen 6×/plan (E10 SH10) — data
  disproved the session's factory-double-fire hypothesis. +7 tests.
- `83f5235` Mode-4 supersede — extracted single-approved helpers to `lib/api/single-approved.ts`, reused
  in factory Mode-4 auto-approve: insert REVIEW → demote prior APPROVED slot sibling → flip APPROVED for
  EVERY produced asset (whole anchor pair, not one side). Root: Mode-4 flipped straight to APPROVED →
  collided with assets_one_approved_per_anchor/_ref_plan on regen of an already-approved asset. Removing
  the index (Polina's q1) would reopen duplicates — supersede is the fix. Live-proven SH07.
- `7cd2238` Polina→Gemini — `lib/concierge/llm.ts` drives all 3 concierge routes off CONCIERGE_PROVIDER=
  gemini → Gemini OpenAI-compat endpoint (same SDK). Live-verified: auto-react responded + tool-called.
  Reversible by one env. Studio agents unaffected.

## Provider-cost incidents
- Anthropic credits exhausted mid-run → `TEXT_LLM_DEBUG_TIER=true` (all studio text → gemini free).
  E10's 28/28 anchors generated on gemini-free plans. Director: keep free as DEFAULT-with-loud-fallback.
- OpenAI `400 Billing hard limit` → blocked BOTH concierge (gpt-5.5) AND image-gen (gpt-image). Director
  topped up → images work. Images STAY on OpenAI (openai-edits-multi chosen for multi-ref identity hold;
  moving off = infra sprint w/ Vercel).

## SH23 runaway forensics (Director: "разберись как следователь")
58 SPC-ref_plan versions, 58 EPREV REVISEs, **45 IMG anchors (36 INVALIDATED)**, 30 EXEC-EREF artist
runs, **39 Polina "[Prod Assistant] regenerate Plan" manual_triggers**, over ~3h (05:44-08:41). Burned
the OpenAI limit. Mechanism = 4 stacked defects: (1) EPREV cosmetic-REVISE doom-loop [[backlog_td_eref_plan_critic_cosmetic_revise... finding#2]];
(2) EXEC-EREF-DESIGNER uncapped; (3) Polina Mode-4 containment auto-react loop; (4) **regen-cap is
per-planAssetId, not per-shot** — new-plan-per-iteration bypasses it. Fix = finding#2 + SHOT-level cap.

## NEXT — deferred code-phase (priority)
1. finding#2: EPREV cosmetic JSON → PASS-with-cleanup (the doom-loop trigger).
2. SHOT-level regen cap (image-gens + plan-regens per shot, across all plan versions) → HALT+escalate.
3. Cap EXEC-EREF-DESIGNER plan-regen per shot; 4. cap Polina auto-recovery per shot.
5. Loud Anthropic→gemini fallback; 6. pipeline provider badge; 7. REVISION→APPROVED for human Director;
8. buildShotListFromAnchorChain failure.

## Open
- SH25/SH26 canon (button panel/location) — awaiting Polina's review text (Director's paste was empty).
  Canon inconsistent: SH09=button_cluster, SH26=floor_indicator, SH25=none.
- Music: mock/empty — Director uploads "our music" via upload-music. Idea: media-assets in Library (reuse).
- SH09 fixed (start v4+end v4 APPROVED cons=100). SH07 doors slide. SH22 unblocked (q6 override).
- Worktree cleanup ("потом"): diff agent-a410e (21 uncommitted) + agent-ad3d (casting-UI) vs master, then
  clean ~16 dead worktrees. Vercel+Inngest-Cloud migration = future sprint. A/B Polina-model test
  scheduled `trig_01UXiw6LWk4t6nJvwEhPcHwh` (2026-06-22).
- Config: desktop = always-on pipeline host, home via Chrome Remote Desktop. env TEXT_LLM_DEBUG_TIER=true
  + CONCIERGE_PROVIDER=gemini (both reversible). Gemini free ~10 RPM caveat.

Related: [[anti_additivity_principle]], [[critic_revision_cap_doctrine]], [[nudge_polina_dont_act_for_her]],
[[concierge_uses_openai]], [[backlog_td_partial_animatic_and_provider_caps]], [[session_2026-06-14_arch-sprint-identity-casting]].
