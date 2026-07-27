---
name: shot-identity-refactor-decision
description: "Post-E12 conservatory fix — shot identity = series-episode-shot (SS-Sxx-Exx-SHnn), drop act/scene from identity; delete the ~21 normalize band-aids."
metadata: 
  node_type: memory
  type: project
  originSessionId: 8b27ec40-d924-4fab-a65f-a476763450a4
---

**✅ SHIPPED 2026-06-27 — MERGED to master `4b1f3f4` (all 5 phases).** Identity now `S{season}-E{episode}-SH{number}` minted BY POSITION in code (`canonicalShotId`, `lib/api/shot-id.ts`); `collectShotIdViolations` = HARD HALT gate rejecting legacy compound; band-aids (`normalizeShotId`/`shotIdsMatchLoose`/SH-fallback) deleted; `resolveShotId` button-number input; feed/UI = SH-token+status+version. E01-E12 = LEGACY opaque (no data migration). Verify on merge: tsc·0 / vitest 1010 / replay·30. ⚠️ Validator only proven in mock/replay — **first LIVE E13 run is the real gate test** (NEXT). ⚠️ worktree dev: `next dev --turbopack` panics on junction node_modules (symlink out-of-root) → run Next without `--turbopack` or from the main repo. The rest below is the original decision record.

Director decision 2026-06-25 (E12 session, after the SH10 + SH12/13/14 numbering chaos): **finish E12 on current mechanics first, THEN do this as a first-class refactor.**

**The conservatory flaw (root of ALL the numbering bugs):** the system never decided what a shot's IDENTITY is. Two contradictory models coexist:
1. positional compound `A2-SC07-SH12` (scene baked into identity) — `vgen-shot-helpers.ts:266` comment: «SH numbering resets per scene… bare SH conflates».
2. episode-unique SH (E11 `7094c8d` «episode-continuous unique SH numbering») — `SH12` alone is unique.

Half-migrated: identity is still STORED/PASSED as the positional string with the **unstable scene** inside. Scene = POSITION (drifts on board re-version, agent re-number, human templating «по аналогии с SH10»), not identity. Every fix so far is a band-aid at ONE door (`normalizeShotId`, `shotIdsMatchLoose`). **69 files touch compound shot_id; ~21 carry scene-stripping band-aids.** New code/agents/humans keep rebuilding the compound id from the unstable scene → the class never dies (SH10, SH12/13/14, E11 «18/20 not found»).

**Target model (Director, «сверхдостаточно»):** identity = **`S{season}-E{episode}-SH{number}`** — series · episode · shot. **No `SS` prefix, no act, no scene** in the stored string (Director q2 2026-06-26 tightened it: even `SS` dropped). Example `S15-E12-SH07`. Act/scene are NOT shown in prod (q8); feed/UI shows `SH101 · approved · ref-план v03` (number+status+asset-type+version). Fabricating a scene becomes impossible by construction (it's not in the id).

**PROGRESS — CORE COMPLETE 2026-06-27 (branch `claude/shot-identity-S-E-SH`, 4 commits, NOT yet merged — gated on E12 already done):** Phase 0 ✅ `c0cc36a` (deterministic position-mint + HALT validator, `maxActInShotIds` removed). Phase 1 ✅ `ec93d3e` (single-source `lib/api/shot-id.ts` + `resolveShotId` button-number on trigger door). Phase 2 ✅ `810f6df` (DELETED `normalizeShotId`/`shotIdsMatchLoose`/`getStoryboardShotById` SH-fallback + `FULL`/`BARE` REs → exact `===`; consumers `plan-regen-guard`+`episode-references` switched; **EREF-critic landmine closed** — `SHOT_ID_REF_RE`→`SHOT_ID_RE`). Phase 3+4 ✅ `9960320` (`shortShotLabel`→SH-token q8; mock-providers+runner fixtures→canonicalShotId). Phase 3-UI ✅ `443a82d` (ActivityEventRow + Gallery labels→SH-token; **activity-feed version** pulled from filename already in event title `…-v03-` → "approve SH101 ref plan v03", zero plumbing). **ALL PHASES DONE.** Green every phase (tsc·0 / vitest 1010 / replay 30). Net ~−50 LoC incl. new SSOT module. node_modules junctioned worktree→main. **NEXT: live SMOKE (Director-sequenced «закончим фазы → потом смоук»), then merge to master (E12 gate clear) → E13 first episode on new identity.** PLAN.md left to master-session.

**Director Q&A 2026-06-26 (LOCKED, plan in `~/.claude/plans/shot-identity-refactor-S-E-SH.md`):** q1 plan now, merge AFTER E12 final · q2 `S-E-SH`, drop SS/act/scene from string · q3 number frozen forever (gaps OK, never re-pack — THIS kills the bug class) · q4 **E01–E12 = LEGACY** (frozen/opaque, new scheme E13+, no heavy data-migration) · q5 delete band-aids immediately · q6 button-number input drives approve/disapprove/generate/regen · q7 filenames UNCHANGED (naming-validator+archivist untouched) · q8 feed shows number+status+version, act/scene gone · q9 phased (5 phases, verify-gate each) · q10 model-economy = separate topic, here only make id model-independent (validator → HARD GATE/HALT). Two shrinkers: no data-migration (legacy opaque), no legacy display-adapter (label = SH-token, exists in both formats). One catch: act-count invariant must move from id-parsing (`maxActInShotIds`) to board `act:` field or it goes blind.

**Load-bearing invariant (makes or breaks it):** SH numbering MUST be **episode-unique** (no per-scene reset). E11 started it; the refactor must **enforce the invariant for all episodes + backfill/renumber old ones** (or scope new identity to the new convention). Without this, bare SH conflates on the old «resets per scene» convention.

**Shape of the fix (subtractive, net-negative code):** pick the SH-unique identity → demote act/scene to display → **DELETE the ~21 band-aids** (nothing left to normalize). Plus a data migration (existing assets carry compound ids).

NOT a hotfix — a deliberate project: map blast-radius (69 files) → design identity model → phased migration. Related: [[backlog_shot_centric_paradigm]] (timeline grid = shot-buttons), [[anti_additivity_principle]] (Director flagged my «normalize at the door» as band-aid #22 — additive armor over a rotten foundation).
