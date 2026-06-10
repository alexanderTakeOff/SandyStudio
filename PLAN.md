# SandyStudio — PLAN.md
## Master Production Tracker | v0.3 | DRAFT

> Single source of truth for current phase, blockers, next steps, ownership.
> **Living anchor, NOT an append log. Hard cap ≤ 200 lines** — add one line, cut two.
> Updated in the same session as code change (CLAUDE.md §12 Ritual 1).
> History → `docs/PLAN-history.md` (+ `git log -- PLAN.md`). Read after CLAUDE.md every session start.

---

## CURRENT STATE

```
Date:   2026-06-10 (C1-Gate Phases 1-3 implemented; tsc·0 / vitest 761/761 / replay-pilot 30/30)
Mode:   ===5=== EDIT · Governance Mode 1 MANUAL.  Master: 6929ba6 (pushed)

C1-GATE Phases 1-3 (2026-06-10): Genre single-source fix (GAGAD was silent 0 fires
  because episodes.series_id stores CODE not UUID → all genre lookups null). genreForEpisode
  reuses seriesIdForEpisode code→UUID resolver. EPREV V10 injects DB fact (no hallucination).
  chain-flags.ts new module (3 flags, absorbed from next-events.ts). exec-vgen: decideFanoutEmit
  pure helper + C1-gate step + c1_valid metaPatch. +2 test files (761 total). NEXT: dry-run
  smoke (Phase 4 CREAD wiring pending separate session).

TD-86 GEN-CONFIG (2026-06-09, plan eager-launching-anchor.md): Director's provider/
  format directives no longer lost. NEW resolve-generation-params.ts = single
  precedence authority (episode generation_config.video > shot/plan override >
  assignment > series > delivery-aspect > fallback; episode-authority only on
  declared fields → no regression). Wired into the TWO real consumers — runner
  EXEC-VGEN (covers pilot/single-shot/fanout/legacy) + regenerate-video route;
  emitters stay dumb (subtractive: 6 sites→2, anti-additivity). settings-route
  persists generation_config{video,image}+caps-validate; EpisodeSettingsCard gains
  collapsible video+image provider panel (reuses ProviderControlPanel +fields prop)
  +allow_shot_overrides toggle; VGENShotPanel locks format when override off
  (+confirm badge, q26b). ASPECT_BY_DELIVERY_TARGET consolidated to provider-
  capabilities. tsc·0/vitest 754/replay-pilot 30. SHIPPED+pushed 6929ba6 (+music-fix
  f978921: replaceMusicLayer — Replace-music wrote only music_url, stale audio_tracks
  [music] shadowed it → E03 v03 regression). E03 1st final-cut STITCHED v01 63s/24sh
  (Director verified file OK, expected косяки). NEXT: Director smoke — E03 9:16/standard
  → re-fanout → confirm metadata aspect/res.

E02 FINAL-CUT WYSIWYG (2026-06-08, e7c76d7, SHIPPED+pushed): re-stitch byte-identical
  → stitch .find()'d stale v06 of two APPROVED animatics. Fixed (newest-wins +
  approve-slot + media→vNN rename + shared clipLengths). NEXT: Director re-stitch E02.

GATE-HARDENING RFC (docs/RFC-2026-06-04-…): 10 invariants, 3 phases.
  ✅ Phase 1 SHIPPED (7c76a05): single-approved→INVALIDATED+DB indexes (0036),
     loud Drive-aware resolver + media-preflight gate, atomic pre-spend budget
     ceiling (0037, no double-charge). Applied to prod DB.
  🔨 Phase 2 in progress:
     ✅ U1/I5 provider contract (b8ef059) — img2vid throws imageless (Seedance-422
        / t2v-drift fix), one check from capability model, no per-provider dup.
     ✅ U4/I9 critic auto-bounce (108e8ee) — critic-loop.ts applyCriticVerdict:
        VPREV/EPREV now enforce cap=2→HALT→Director (was uncapped infinite loop);
        counter = plan version (survives re-author). +6 unit tests.
     ✅ U2/I4+I6 fold (cff8007) — execVgenStart+SingleShot → ONE gated execVgenRun
        (multi-event, isPilot); gate+agent_failed, −~160 lines, dead pilot cap gone.
     ✅ EREF-fold (bb0669c) — gate + agent_failed for EXEC-EREF (same as U2).
     ✅ U3/I3 (37a2390) — dropped EXEC-VANIM from media-preflight (loads no bytes;
        was blocking whole stage on one bad anchor). Subtractive, no shotId thread.
     ✅ U5/I8 CLOSED-as-covered: fan-out skip-status + Inngest step-memoization +
        I7 budget ceiling cover the common cases; narrow residual (double-spend on
        mid-step failure) needs runAgent step-split — deferred, bounded by ceiling.
  Phase 2 code COMPLETE. NOTE: trio doesn't exercise Inngest handlers → VALIDATE
  U1+U2+EREF-fold on paid Veo/Seedance smoke WITH Director before push (q9).
  Phase 3 = OUTPUT-critic (frame-sampler → vision) + camera/quality_tier checks.
  Verify after each unit: tsc·0 / vitest 664 / replay-pilot 30. Paid smoke = WITH Director.

E03 «Shorts Test» (bf175902-…, Mode4/$50/anchor=true): FIRST live Inngest Mode-4
  brief→final. CORE BUG (TD-87): Mode-4 auto-chain (factory nextEvent) ≠ computeNextEvents
  → WCHK jumps to EDIT, SKIPS EREF+MGEN → EDIT dies; manual recovery EREF-DESIGNER failed
  (needs per-shot shotId), MGEN ok (NEW music≠E02 reuse). anchor viable (LOCKED bedroom loc).
  FIX=converge Mode-4 on computeNextEvents (one router→lib). TD-86: EpisodeSettingsCard=
  single source (provider/format/res/quality)+post-brief gate (budget=hard,settings=warn).

OPERATING DOCTRINE (memory: nudge_polina_dont_act_for_her):
  • Тео = Director's proxy. Nudge Polina via team-chat (POST /api/team-chat/post,
    author=Тео, Bearer TEAM_CHAT_TOKEN) in Director's voice; she executes + LEARNS.
  • Discriminator: Polina misused a working tool → TEACH (nudge); SYSTEM broke
    (tool/gate/dispatch/worker) → Тео FIXES CODE. Mode 2.5: only Director's verbal
    «да» authorizes Polina mutations — Director nudges+approves, Тео on-call for bugs.
  • Keep Inngest worker (:8288) + dev (:3000) alive via preview_start, NEVER manual
    bash (double-supervisor = port-8288 war; killing worker = silent stall).

Shipped this session: PR#26 TD-85 · PR#27 Key Art (v12) · PR#28 TOPIC 3 pipeline ·
  media-no-branches (d1a58cf) · series-active-derived (430918c) · screenwriter
  max_tokens 8000→16000 RU truncation fix (5b7fc1d) · SREV Script-Critic auto-read (dffe5b3).

Cost-accounting FIXED 2026-06-03: recordCost now in ALL 5 direct routes (regen
  image/video, bible generate-image/enrich/extensions) + factory — leak closed.
  Historical ~$48.68 BACKFILLED to budget_log (npm run backfill-direct-costs,
  idempotent; tab now $147.96 was $98.59). PA batch-stall watchdog SHIPPED
  (pa-batch-stall-watchdog, 5-min cron): FANOUT_RUNNING + idle>6m → nudge Polina
  to continue (fixes silent mid-batch stop; awaiting-only nets were too slow).
  Tools: npm run episode-timing <EP> (compute/hands-on/wall-clock).

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
