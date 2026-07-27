---
name: session_2026-06-17_format-authority-slice1
description: "2026-06-17 session — recovered frozen session, render-duration model, then episode FORMAT authority Slice 1 (shipped + live-smoke PASS). Slice 2 (IMAGE) is next."
metadata: 
  node_type: memory
  type: project
  originSessionId: 3c6cc861-ac4a-418d-992d-2fbce714f1e1
---

# Session 2026-06-17 — Episode FORMAT authority (Slice 1) SHIPPED + live-validated

## Arc of the session
1. Recovered frozen session `4ad23077` (died mid-Edit on animator/SKILL.md 2026-06-16 15:23) → finished the **render-duration model** (duration = RENDER duration clamped to provider [min,max], creative cut lives in animatic, trimmed at stitch). Master `67d9d74`.
2. Director spotted the Approve-panel showed **1080p** while the **episode setting** was 720p → uncovered that `episodes.metadata.generation_config` (the SINGLE SOURCE OF TRUTH, resolved by `lib/api/resolve-generation-params.ts`) was honoured **only at render**; every authoring/critic agent was BLIND and invented FORMAT.
3. Built + shipped **Slice 1** (video) + live-validated on the real E10 deadlock.

## What landed (master @ `4493648`)
- `f6d323a` Slice 1: Animator producer conforms FORMAT (provider/aspect/quality/resolution) via the **same `resolveVideoParams`** the render path uses, honouring `allow_shot_overrides` (NOT hardcoding episode-wins). Reverse-maps provider impl↔alias (`vanimAliasFor`); clamps duration to RESOLVED provider; recomputes cost; scrubs fabricated "Director hard-contract" FORMAT policy_notes. Injects episode-FORMAT authority block into Animator + Critic prompts. `animator.md`: Option B (prose stops restating format/dur/cost numbers) + NO-FALSE-ATTRIBUTION for FORMAT. `shot-plan-contract.ts` ShotPlanPatch += aspectRatio / resolution|null / policyNotes. `runner.ts` exported `readEpisodeVideoConfig`.
- `fee8fd6` fix: (a) authority block was showing provider in IMPL vocab (`seedance-fal-img2vid`) → Critic V01 false mismatch; `episodeProviderAliases()` now translates impl→alias. (b) fab-scrub was gated on formatChanged → fabrication survived when LLM already conformed; now unconditional when episode declares FORMAT.
- `4493648` PLAN.md PM-6.

## Live smoke (the proof)
E10 SH12/SH13 (deadlocked for days on V07 duration "2s<3s" → really the whole FORMAT chain). Re-authored via Polina → **resolution 720p** (was phantom 1080p), **cost $1.21** (was $2.722, 1080p×2.25 phantom), **no fabrication**, provider valid alias, **Critic PASS (V01–V13 all green)**. Deadlock broken.

## Verify
tsc 0 · vitest **886/886** (+11) · replay-pilot 30/30.

## NEXT — Slice 2 (IMAGE), fresh session
Plan file: `~/.claude/plans/generic-hopping-ladybug.md` (§"Дальше"). Mirror Slice 1 for IMAGE:
- **`resolveImageParams` is currently DEAD** (defined in resolve-generation-params.ts, never called anywhere) → image FORMAT is **entirely ungoverned** (worse than video, which at least had render-time enforcement).
- Wire `resolveImageParams` into `episode-reference-designer.ts` (EXEC-EREF — hardcodes `EREF_DESIGNER_PROVIDER_ALLOWLIST=['gpt-image-2']`) + `episode-reference-critic.ts`.
- Kill hardcodes: `episode-references.ts` legacy `EREF_QUALITY='medium'` + `1024x1024`; `thumbnail-renderer.ts` `SRC_SIZE='1536x1024'`+`quality='medium'`+provider.
- Episode image config lives at `generation_config.image.{provider_id, quality}` (E10 = openai-edits-multi/high). Reference SIZE derives from delivery_target (SIZE_BY_DELIVERY_TARGET), NOT re-resolved.
- Then **Slice 3 (dispatch)**: carry shot-override format into event payloads for allow_shot_overrides=ON (11 dispatch sites bypass; OFF self-heals at render via runner re-resolve).

## E10 status
SH12/SH13 v06 plans now PASS → ready to approve. Other shots with 1080p-drift (SH01/02/05-10/14) will conform to 720p on next re-author. Then render → stitch.

## Env / operational
- Servers (dev :3000 + inngest :8288) were restarted by Тео into THIS session's background tasks on `fee8fd6` — a fresh session won't own them; Director should re-take his two terminals (`npm run dev` + `npm run inngest:dev`) or they keep running detached.
- Mode `===1===` ANALYTICS (Director set mid-session; studio code edits still went through). E10 governance Mode 2.
- env still: TEXT_LLM_DEBUG_TIER=true + CONCIERGE_PROVIDER=gemini (E10 ran Animator on gemini-2.5-flash).
- Many `tmp-*.ts` diagnostic scripts left in `webapp/` (untracked) — safe to delete.

Related: [[plan_md_living_anchor]] · [[nudge_polina_dont_act_for_her]] · [[anti_additivity_principle]]
