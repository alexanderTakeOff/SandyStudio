# SandyStudio — PLAN.md
## Master Production Tracker | v0.3 | DRAFT

> Single source of truth for current phase, blockers, next steps, ownership.
> **Living anchor, NOT an append log. Hard cap ≤ 200 lines** — add one line, cut two.
> Updated in the same session as code change (CLAUDE.md §12 Ritual 1).
> History → `docs/PLAN-history.md` (+ `git log -- PLAN.md`). Read after CLAUDE.md every session start.

---

## CURRENT STATE

```
Date:   2026-06-15 (E10 anchor run + provider-cost firefight; master @ 7cd2238)
Mode:   ===5=== EDIT · Governance Mode 4 (E10). Master PUSHED to origin (…7cd2238).

2026-06-15 SESSION (memo: memory/session_2026-06-15_e10-gemini-cap-fixes.md). 3 root fixes pushed:
  regen-cap (d2cdd40, lib/api/plan-regen-guard.ts — autonomous regen cap, in-flight guard) ·
  Mode-4 supersede (83f5235, lib/api/single-approved.ts — demote prior APPROVED slot sibling +
  approve WHOLE anchor pair) · Polina→Gemini (7cd2238, lib/concierge/llm.ts, CONCIERGE_PROVIDER=gemini
  OpenAI-compat, live-verified tool-calling). E10: 28/28 anchors generated on GEMINI-FREE plans
  (Anthropic credits dry → TEXT_LLM_DEBUG_TIER=true). OpenAI hit `Billing hard limit` → blocked ALL
  gpt-image too → Director topped up (images STAY on OpenAI). SH07 doors slide-fixed; SH09 regen
  cons=100; SH22 unblocked (q6 override of cosmetic EPREV).
  🔴 SH23 RUNAWAY (forensics): cosmetic-EPREV doom-loop × Polina Mode-4 containment auto-react →
  58 plan versions / 45 imgs (36 invalidated) / 39 Polina regens over 3h → burned OpenAI limit.
  regen-cap MISSED it (per-planAssetId; new-plan-per-iteration bypasses). CODE-PHASE (q1=6/q2=note):
  ✅(1) finding#2 EPREV cosmetic→PASS — V05/V09 advisory + V07 deterministic re-validate + executor
  baseline-negatives by construction; lone-cosmetic REVISE→PASS downgrade. ✅(2) SHOT-level cap
  shotRegenCap()=6 across all plan versions (img+plan), factory pre-run = universal chokepoint (auto-
  chain+Mode-4+Polina), early-return HALT+escalate. tsc·0/847/30. LOCAL-UNPUSHED. STILL OPEN code:
  (3)≈covered by (2); (4) Polina auto-recovery per shot; (5) loud Anthropic→gemini fallback; (6)
  provider badge UI; (7) REVISION→APPROVED human Director; (8) buildShotListFromAnchorChain. SH23
  cleanup (58 plans) — after these land.
  OPEN: SH25/SH26 canon (button-panel/location — await Polina review); music (Director uploads via
  upload-music; idea: media-assets in Library); worktree cleanup (diff a410e+ad3d, clean ~16 dead);
  Vercel+Inngest-Cloud migration (future sprint); A/B Polina-model test scheduled 2026-06-22.
  Config: desktop = always-on host, home via Chrome Remote Desktop.

ARCH SPRINT 2026-06-14 (Director: pipeline = full traversable process surface; fix recurring
  uuid fragility systemically, not patches). One root: no single declarative model of stages +
  polymorphic identity. Plan = identity-foundation-first → declarative 2-tier registry → series
  tier → casting stage → render tail → clean E10. Decisions: identity first; unify registry,
  migrate next-events.ts incrementally behind flag.
  DONE: Thread 0+2 (fa10591) — episode cast scoping + TD-63 injector removed + object reference
  contract end-to-end. A1 (6caf41e) — episodes.series_id code→UUID + FK (migration 0038 live;
  heals genre+thumbnail latent bugs). E09 VERIFIED visually: SH07 intruders gone, SH08 panel canon
  (object refs work end-to-end; panel proven via manual objects[] inject on old E09 plans).
  Phase D core (uncommitted→committing): D1 ART-AD contract v0.2 (episode casting+breakdown+
  preflight) + validateCanonExists; D2 casting API POST /api/episodes/[id]/cast (canon-preflight
  HARD GATE → SPC-episode_cast DRAFT → approve locks scoping); D3 'casting' stage node in registry
  (before brief, ART-AD). tsc·0 / 829 / 30.
  Phase D DONE (backend): + A2 shot_id SSOT (b900ad9) + castEpisode PA tool (565f357). Casting fully
  usable via system (API + preflight + PA tool + stage node). Casting UI panel (StageWorkspacePanel,
  episode-scoped) DEFERRED to a frontend session (needs live app).
  WCHK ×2 DONE (cb5d974): ordering — exec-wchk inputAllowedStatuses+REVIEW, runner resolves board
  REVIEWABLE (mirror Script Critic) → validates pre-approval, no stall; verdict-stamp — authoritative
  banner so content headline == metadata.verdict. + regular-path negative→provider (5ea1151).
  ALL pushed to origin (…cb5d974).
  #2-batch DONE (Director go): #3 regular-path object refs (70f8da2, contract symmetric both paths) +
  #1 mode-aware checker fallback + stats (c953c54: skip→Mode4 pass / Mode1-2 Director / Mode3 EXEC-DIR-AI
  +dashboard_flag, always a checker_fallback stat) + #2 anchor visual gate (24bbf1a: ANCHOR_VISUAL_GATE
  default ON, advisory — stamps metadata.visual_review + anchor_intruder_flag stat, non-blocking).
  ALL pushed (…24bbf1a). tsc·0/829/30.
  NEXT: A3 atomic boundary (🔴 CREATE FUNCTION migration = Director OK); Phase B registry; Phase C
  series tier; casting UI panel (frontend); brief-authoring skill. Director: ALL phases before E10.

E10 CLEAN-RUN (Mode 4, brief+cast verbatim E09): identity contract proven by construction (SH01-06/
  09/10 anchors all identity=[sandy_hourglass]). Finding-#1 FIXED 2026-06-14 (data disproved the
  factory-double-fire hypothesis): root = Polina's UNCAPPED "Mode 4 auto-recovery" — she re-fired
  /regenerate-image-from-plan up to 6×/plan (SH10) on advisory visual-gate flags, ~4min+$ each, no
  escalation. FIX = shared assertPlanRegenWithinCap chokepoint (in-flight + autonomous cap
  PLAN_REGEN_CAP=3 → HALT+escalate Director; human uncapped), wired into /trigger (folded old
  in-flight guard) + /regenerate-image-from-plan. tsc·0/836/30. Findings #2-#5 → TD backlog.
  E09 anchors polluted except SH07/SH08 (regen on clean E10).

SHIPPED (in git log, condensed): WCHK STRENGTHENING (4ff5262, 06-11 — CREAD double-fire killed,
  state-ledger CHK-W08 + inventory-cascade CHK-W04, comedy-soft verdict, CONTINUITY_LEDGER_ENABLED) ·
  C1-GATE SPRINT (9988c5f…7a7f568, 06-10 — genre single-source, C1 plan-gate, EXEC-CREAD universal
  readability critic behind READABILITY_GATE_ENABLED) · TD-86 GEN-CONFIG (6929ba6, 06-09 —
  resolve-generation-params.ts single precedence authority, settings UI provider panels).

GATE-HARDENING RFC (docs/RFC-2026-06-04-…): 10 invariants, 3 phases.
  ✅ Phase 1 SHIPPED (7c76a05): single-approved→INVALIDATED+DB indexes (0036), loud Drive-aware
     resolver + media-preflight gate, atomic pre-spend budget ceiling (0037). Prod DB applied.
  ✅ Phase 2 code COMPLETE (b8ef059/108e8ee/cff8007/bb0669c/37a2390): provider contract (img2vit
     throws imageless), critic auto-bounce cap=2→HALT, VGEN/EREF fold+gate+agent_failed.
     NOTE: critic cap=2 is per-plan-version — SH23 runaway proved it doesn't bound a SHOT (new
     plan per iter). See 2026-06-15 NEXT (shot-level cap).
  🔨 Phase 3 PENDING = OUTPUT-critic (frame-sampler → vision) + camera/quality_tier checks.

OPERATING DOCTRINE (memory: nudge_polina_dont_act_for_her):
  • Тео = Director's proxy. Nudge Polina via team-chat (POST /api/team-chat/post,
    author=Тео, Bearer TEAM_CHAT_TOKEN) in Director's voice; she executes + LEARNS.
  • Discriminator: Polina misused a working tool → TEACH (nudge); SYSTEM broke
    (tool/gate/dispatch/worker) → Тео FIXES CODE. Mode 2.5: only Director's verbal
    «да» authorizes Polina mutations — Director nudges+approves, Тео on-call for bugs.
  • Keep Inngest worker (:8288) + dev (:3000) alive via preview_start, NEVER manual
    bash (double-supervisor = port-8288 war; killing worker = silent stall).

Hardening backlog (before 10-20 episode run): #1 episode.status stuck BRIEF_APPROVED
  (approve/route.ts,S) · #3 fan-out sendEvent not in step.run (factory.ts,M) · #4
  schedule-analytics silent-fail (S) · #5 trigger doesn't validate episode.status ·
  critic REVISE→producer bounce doesn't auto-close in Mode 1 (SREV/EPREV/VPREV; add
  + revision cap 2-3 → HALT) · WCHK Continuity Critic auto-read FIXED 2026-06-02
  (exec-wchk/ in factory isCriticChain + gate allowedStatuses REVIEW — full SREV
  parity) · PA approval-gate now recognizes Director's q<N>y/q<N>n format (was
  blocking mutations on «q19 Y») · EREF gallery now shows IMG-anchor_* (anchor
  episodes were invisible; d76722c, live-verified E02 4 anchors) · anchor drawer
  now has full action bar Regenerate/Request-revision/Approve (regen reroutes
  EXEC-EREF+planAssetId→execute-from-plan, was mis-firing pilot start; also fixes
  PA regenerateImageFromPlan for EREF; live-verified) · EREF Reference Artist FIXED — scene_master /
  continuity-anchor / Bible-ref bytes now resolve via media-cache+Drive (new
  readAssetMediaAsBase64), not dead /staging path (media-no-branches regression;
  E02 «Scene master bytes unreadable») · Key Art Critic
  (thumbnail_critic) UNSTAFFED — agents:[], no agent/event; needs full build like
  EPREV/VPREV (Director scope call) · naming-hook whitelist HELD on branch
  worktree-agent-a998b0b832df50dce (needs Director OK, gov-hook).
OUTPUT-CRITIC design (docs/output-critic-architecture-design.md): needs_revision
  (sync-vs-async + per-episode regen budget cap). Mode-3 key. Sprint AFTER Topic-2.
Camera same-angle (q16) carried. Episodes: S15-E01 "Heavy Friend", S15-E02 in prod.
```

---

## SPRINT STATUS

Sprints S0–S8 (foundation + spec) COMPLETE 2026-04-23..28 — `docs/PLAN-history.md`.

### Sprint 9 — Web application (live)

| Phase | Description | Status |
|-------|-------------|--------|
| 1–4 | Schema + scaffold + Inngest + agent jobs library | ✅ 2026-04-28 |
| 5a–5d | UX specs + API routes + cockpit + pipeline kebab + editor + preview drawer | ✅ 2026-04-29..30 |
| 6 | Per-episode sub-pages, budget detail, jobs panel | ⏳ partial (episode page + timeline done) |
| 7 | Approval Authority Matrix per-row editing + delegate UI | ⏳ pending |
| 8 | Real providers — gpt-image-2 + Drive + Veo 3/3.1 ✅; Kling/Suno/YouTube deferred | 🟡 partial |
| 9 | PM2 + Tailscale + production hardening | ⏳ pending |
| A.1/A.2 | Animatic overrides + EpisodeTimeline + VGEN auto-COMPLETE + EXEC-STITCH + Audio reorg | ✅ 2026-05-06..10 |
| Mode 2.5 | Prod Assistant + 13 tools + verbal approval + gpt-5.5 + BEHAVIOR_CONTRACT | ✅ 2026-05-08..12 (PR #23) |
| φ / Designer+Animator | Skills-as-capabilities + EREF Designer + Animator + 2 Critics (decision-making agents) | ✅ φ merged `cc43944`; agent arc IN PROGRESS |
| Distribution tail | Key Art Designer (thumbnail) ✅ #27; COPY/PUB + Audience Analyst | 🟡 Topic 2 |

---

## ACTIVE BACKLOG

### Long-debt (small fixes, non-blocking)

| # | Item | Severity |
|---|------|----------|
| 2 | Per-stage trigger button in DAG (not generic Re-trigger modal) — folds into Topic 3 | UX |
| 4 | `markJobFailed` on any throw, not only gate-fail (rows stuck RUNNING after fn.failed) | Reliability |
| 5 | Re-trigger dedup: refuse if same agent has COMPLETED/RUNNING job for that asset | UX |
| 13 | `episodes.status` stuck at BRIEF_APPROVED even after publish | Reliability |
| 14 | `schedule-analytics` cron not firing after EXEC-PUB — verify next_event emit | Reliability |
| 15 | Mode 4 auto-revert to Mode 1 on session end (governance.md §4) | Compliance |
| 16 | EXEC-VGEN base file_type duplicate `shot` token (`VID-shot-shot1`) | Cosmetic |
| 17 | FFmpeg export aspect: requested 16:9, observed 1:1 centered — `ffmpeg-stitch.ts` | Reliability |
| 18 | PA TTS quality "больной робот" — upgrade to ElevenLabs/OpenAI TTS; deferred to 2nd use | UX |
| 19 | Asset content edit overwrites in place, no version increment — endpoint should INSERT v+1 | Reliability/Audit |
| 20 | PA chat sync POST hangs 50-110s, no progress/cancel — L1 done; L2 SSE streaming + cancel deferred | UX/Reliability |
| 21 | Brief↔Bible consistency validator missing — new EXEC-HW-CRITIC or extend SREV (~6-10h) | Reliability |
| 22 | DELETE asset `asset_updated` event not in PA auto-react whitelist (~30 min) | UX |
| 23 | Designer post-pilot auto-fanout: remaining shot ids stashed but not auto-fired on pilot approve | Reliability |
| 39 | PA delivery ack — L1 DONE (trigger+approve paths, 2026-06-02). L1.5 per-event corr (inngest_event_id col) deferred | ~~Mode 3/4 blocker~~ |

Fixed in Phase 5c (don't re-add): #1 friendly names · #3 phantom stage · #9 multi-asset chain · #10 stage filter · #11 agent_completed · #12 prefix match.

### Long-term roadmap (LT-05..LT-14, all PLANNED/backlog)
LT-05 Skill Editor learning loop (Mode 2.5 Phase B) · LT-06 buildShotPromptV2 rich Bible inject · LT-07 variants-per-gen UI · LT-08 Veo quota mitigation · LT-09 stage progress arc · LT-10 scalable 60+ shot timeline · LT-11 episode page tabs cleanup · LT-12 foldable activity feed · LT-13 activity time filters · LT-14 Bible locations+styles in VGEN prompt. (LT-01..04 SHIPPED.)

---

## RULES (enforce every session)

**UI/UX** — any visual change → read `specs/system/uiux.md` first; semantic theme tokens only (no raw hex); Approval Queue = highest-priority path; update uiux.md if visual rules change; no Asset Galaxy v2 unless planned.

**SDD** — Spec DRAFT → REVIEW → APPROVED → Implementation → Output REVIEW → APPROVED. No content before its spec is APPROVED.

**Post-pilot (PA-001..006)** — all absorbed: PA-001/2/3 char-ref via EREF + Phase A.1 canon inject; PA-004 defaults reviewed; PA-005 `character_visual_development.md` v0.1 (UI → LT-07); PA-006 `audience_kpi.md` v0.1 (QA deferred).

**Open decisions** — D-001 char consistency: A2-Kling → MVP Veo 3 img2vid (~75%), Kling = Phase 8.5. D-002 assembly: FFmpeg + optional DaVinci. History in `docs/PLAN-history.md`.

---

## CHANGE LOG (recent)

Pre-2026-05-18 → `docs/PLAN-history.md`.

| Date | Change | By |
|------|--------|----|
| 2026-06-02 | **PR #27 → master `baa1e00`** — Key Art Designer multi-canon thumbnail pipeline + Drive-backed media route. Live art gate PASS on SS-S15-E01 ($0.34, 3 thumbnails, v12 winner). +smoke collision fix. Topic 3 (systematic pipeline) inventory launched. PLAN.md compacted 339→≤200 (history → PLAN-history.md). | Master-session |
| 2026-06-01 | **PR #26 → master `072194e`** — TD-85 resolution discipline in Shot Plan pipeline (runner hard-gates resolution vs provider contract, Critic V13). tsc · 610 tests · 29 replay. | Claude Code |
| 2026-05-27 | TD-72 Animator's Critic V04 softening SHIPPED (PR #24); TD-74 designed (later → TD-83/85). Detail in PLAN-history. | Claude Code |
| 2026-05-23 | Sprint q7a — multi-axis continuity anchors + freshness guard SHIPPED. Camera same-angle root-cause diagnosed (q16 open). TD-37 feedback-loop recon. | Claude Code |
| 2026-05-18 | Sprint φ + gpt-image-2 MERGED (`cc43944`, 206 commits). Skills-as-capabilities. E21 Stage A 22/22 EREF + 2 VGEN pilots. Designer+Animator sprint kickoff. | Director + Claude |

---

*SandyStudio PLAN.md | v0.3 | DRAFT — master-session updates after every state change. Keep ≤ 200 lines.*
