---
name: session-2026-06-17-anchor-mode-b-smoke
description: Session memo 2026-06-17 PM — anchor-mode B (regenerate surfaces) shipped + live smoke PASSED on E10 SH25/SH26 (orbit⇒ref-only validated end-to-end via Polина).
metadata: 
  node_type: memory
  type: project
  originSessionId: 1cdf7435-577c-487c-82dc-ec725e78672d
---

**What landed (anchor-mode doctrine, orbit⇒ref-only):**
- **B1** — `VGENShotPanel` anchor toggle «🎯 только реф / 🔗 два якоря»: ref-only nulls end_image + hides picker, two-anchor reveals it + fails loud if empty. Reuses `ProviderControlPanel` `fields`-whitelist + `supports_end_image` cap; **ProviderControlPanel untouched**. (`cde49fd`)
- **B2** — `regenerateShot(shotId, anchorMode)` PA tool in `vgen-execute.ts`: thin wrapper over the existing `/api/assets/:id/regenerate-video` REST route; resolves shotId→newest VID-shot via `ilike`; fail-loud on two-anchor-without-end-frame; mirrors `regenerateVideoFromPlan` gate/auth/pickup. +13 unit tests. concierge.md rule 10 (train personnel). (`48fe57f`)
- C (regen 8 infected E10 shots ref-only) **NOT done — PARKED** per Director till go on spend.

**Live smoke — PASSED, Director accepted («нет дёрганий как с двумя якорями»):**
- Ran on E10 SH25+SH26 (2 of 4 ungenerated shots — full set SH25-28; SH27/28 still ungenerated, SH28 EREF in REVISION).
- **Polина drove the WHOLE pipeline autonomously** (Animator→critic→approve→VGEN) via an `authorized_principal` nudge (posted to `/api/team-chat/post` with `EXEC_DIR_AI_TOKEN` Bearer — this is what lifts the read-only auto-react gap; author='Тео'). Needed 2 nudges: start, then «continue to render» (she pauses at the turn boundary after authoring, before critic finishes).
- **Doctrine validated on virgin shots:** Animator DISCRIMINATES — SH26 (orbit 10°)→`seedance-standard` ref-only (cited doctrine in rationale); SH25 (static match-cut)→`seedance-with-end-image` two-anchor (legit exception). V15 critic PASS on both. Both rendered 720p/4s (~$2.42).

**Commits (all pushed, origin/master HEAD = `1ba3f58`):** `cde49fd` B1 · `48fe57f` B2 · `9563bb2` PLAN(B shipped) · `1ba3f58` PLAN(smoke passed). A was prior-session `0718d9e`+`a3735eb`.

**Verify:** tsc·0 · 912/912 tests · replay-pilot 30/30. (B2 +13 tests.)

**Servers:** restarted FRESH on HEAD this session (the 18:41 servers predated all anchor commits). Prod build impossible offline (`next/font/google` JetBrains Mono can't fetch) → running `npm run dev` (turbopack) + `npm run inngest:dev`, ONE listener each on :3000/:8288, 30 functions registered. **Left running overnight** (Polина alive). For long renders: don't edit files mid-run (turbopack churn).

**Open / NEXT (Director surveyed the plan, will pick in the morning):**
1. Finish **E10** to final cut (26/28 rendered; gen SH27+SH28 → re-stitch → final). Тео's recommended next.
2. **C** — regen 8 infected ref-only (~$10-15), awaits Director go on spend.
3. **canon-existence preflight** (blocks E09; Director's flagged ВАЖНО).
4. Architecture: casting-before-brief / full traversable pipeline, ART-AD stage.
5. Backlog opened this session → [[backlog_td_vgen_endimage_metadata_gap]] (render never stamps end_image; can't verify two-anchor honored).

See [[anchor_mode_orbit_ref_only]] (smoke-confirmed) + [[nudge_polina_dont_act_for_her]] (authorized_principal token is the working nudge mechanism).
