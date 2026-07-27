---
name: backlog_2026-07-05_live-run-queue
description: "Open TD queue + plans from the 2026-07-05 E16 live-run session (kebab, casting, pipeline gate bugs, retry-caps, cell-pulse)"
metadata: 
  node_type: memory
  type: project
  originSessionId: ae206a0d-c852-47fd-8791-e571200cedcf
---

Queue surfaced during the 2026-07-05 E16 «Sandy in The Gym» live run (Director dictating items while Тео built UI). Absolute-dated for recall.

## Episode status
- **E16 «Sandy in The Gym» — FINAL CUT DONE** (Polina + chain + Director dojali). The EXEC-EREF stall was pure canon-staleness: after gym_equipment canon appeared, the NEW ref_plans just needed approval; old APPROVED plans sat stale. Director unblocked with ONE manual command to Polina «approve the new plans» → chain flowed to final cut. This is EXACTLY the loop the canon-as-input invariant (q15) would automate.

## Shipped / in-flight this session
- **Key Art UI** — committed `64ba90b` (Fix 1b gallery of 3 concepts + per-variant approve/revoke; Fix 3 Edit-plan in drawer). Verified tsc·1145.
- **Kebab two-field rework** — SHIPPED `1b3a0a6` (per-shot popover = two fields Image/Video, each with its own design→critic→artifact sub-chain; two-directional approve/revoke tick on every line; critic verdict chips; reference generate/regen; video click→wide drawer; NONE removed; object-aware badges). Superseded the first 4-partition attempt after Director live-review («порядок не очень»). tsc·0/1145. Files: `components/animatic/AnimaticPlayer.tsx` (4 partitions Design·Critic·Image·Video, dividers only between; two-directional approve/снять tick; critic verdict chips; NONE removed; per-partition "generating…" badges; reference generate button), `components/timeline/EpisodeTimelineSection.tsx` (refCriticsByShotId/shotCriticsByShotId memos + handleGenerateReference 3-way + drawerWide), `components/preview/PreviewDrawer.tsx` (initialSize; VID-shot opens wide). Plan: `~/.claude/plans/glistening-drifting-biscuit.md`.

## Queued TD (Director-dictated)
1. ✅ **Retry-caps in Episode Settings** — SHIPPED `3c37e96`. Three per-episode caps via `episodes.metadata` (mirrors concierge_cap_usd): `prompt_revision_cap` (2, → applyCriticVerdict cap at 4 runner sites), `reference_regen_cap` (2, → EREF loop maxRetries), `video_regen_cap` (1, → exec-vgen dedup now count-based). chain-flags `resolve*` helpers; settings route + EpisodeSettingsCard «Retry caps» row. Byte-identical at defaults. ⚠️ replay-pilot deferred (agent-layer change; not run to avoid disrupting live E16 Inngest/DB — run when E16 idle). See [[critic_revision_cap_doctrine]].
2. **Cell-pulse-after-designer bug** (add to TD after «attempts»): timeline cells pulse dim↔bright while a designer runs; when the designer FINISHES the cell drops to DIM — but should be BRIGHT (dim was the pre-start state; finishing = a plan now exists → brighter). Root = `AnimaticPlayer.tsx` `cellPalette`/`liveWork` fallback after the live pulse ends (falls back to cell status colour, which for a fresh DRAFT/REVIEW plan reads dim). Same file as the kebab.
3. **Mode-3 fanout-refs critics not auto-starting** — UNCONFIRMED, «проверь потом». Suspicion: after the ref Designer finishes in a Mode-3 fanout, the ref Critic (EXEC-EPREV) doesn't auto-fire. Designer's nextEvent SHOULD chain it (`inngest/functions/exec-eref-designer.ts:50-62` → `sandystudio/exec-eprev/review-plan`). VERIFY before fixing — may be a false alarm.

## ⭐ Canon-staleness prokol (architecture, Director «ВАЖНО», q15 PENDING)
Director asked why old ref_plans weren't flagged when `gym_equipment` canon appeared. **Root (precise): the freshness engine (`input-versions.ts` + `state-matrix` + reconciler) versions ONLY per-shot artifact edges — `UPSTREAM_BY_AGENT` = {VANIM: shot_plan←ref_image, VGEN: video←shot_plan} (`input-versions.ts:32-35`). The `ref_plan ← Bible canon (SBL)` edge is NOT in the graph — canon is never a versioned input, so the staleness engine is structurally BLIND to canon changes.** Not a missing hook — canon is absent from the input-DAG entirely.
- **Polina's proposed fix REJECTED (told Director):** (1) skill-rule in eref-shot-composition = wrong layer (skill = authoring-time advisory, can't enforce reverse-invalidation of APPROVED plans — that's runtime/reconciler). (2) her slug-reference scan MISSES her own example — SH16 has `objects:[]`, never references gym_equipment; problem is «canon APPEARED in the location», not «referenced canon changed».
- **Systemic fix (one edge, reuse):** stamp `input_versions.canon` = snapshot of the shot's **location canon ROSTER** (not just referenced slugs) + referenced object/character slugs w/ SBL versions, when EXEC-EREF-DESIGNER writes ref_plan. state-matrix compares roster → drift = STALE → reconciler → REVISION «canon updated to vN». Roster (not referenced-slugs) is what catches SH16. Invariant: **every APPROVED artifact versions ALL inputs incl. canon.**
- Rides on the reconciler (inert behind `MECHANICS_AUTO_ADVANCE`) → do at clean-episode start, not mid-E16. [[autonomous_factory_architecture_doctrine]] [[backlog_td_canon_existence_preflight]].

## Casting plan (approved, separate — DON'T lose)
Full approved plan is in this session's ExitPlanMode block. Two parts: (A) Brief APPROVED → auto-nudge Polina into casting (reuse `pa/notify-needed`; brief approval already wakes her via `approval_granted`, so prefer teaching the CANONICAL GATE CHAIN «Brief→casting-interview» in `system-prompt-builder.ts:118` over a new event); (B) new `.claude/skills/casting-interview/SKILL.md` (flavor: process, applies_when.agent: [EXEC-CONC]) — Polina drives an interview to fill the library (reuse setBibleContent/enrichBible/markAwaitingDirector/castEpisode), precedent = `series-episode-theme-*` skills. Root: casting has no executor (ART-AD/ART-CAST spec-only), so it stalls after brief. [[autonomous_factory_architecture_doctrine]]

## Pipeline gate-inconsistency diagnosis (systemic, from this run)
Live E16 failures share ONE root — the pipeline is inconsistent about WHICH artifact the Director approves:
- **Storyboard approval SKIPPED → EREF fails.** Critics (CREAD readability + WCHK continuity) fire from storyboarder COMPLETION and gate on «Storyboard REVIEW-or-APPROVED»; Director approves the critic REVIEWS, but nothing promotes `STB-storyboard` itself to APPROVED. EREF's gate requires APPROVED storyboard → «found 0» → job FAILED. Fix direction: approving the last critic gate before an executor (REV-world_check) should also promote the reviewed artifact (STB→APPROVED), mirroring ref-plan→image promotion.
- **Publicist ran but Storyboard didn't** = by design (storyboard waits on REV-script_qa approved + approved cast; publicist only needs script). Not a bug.
Both fold into the casting/gate work — same «rassoglasovannye gejty» theme Director flagged.
