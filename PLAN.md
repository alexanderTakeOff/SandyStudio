# SandyStudio — PLAN.md
## Master Production Tracker | v0.3 | DRAFT

> Single source of truth for current phase, blockers, next steps, ownership.
> **Living anchor, NOT an append log. Hard cap ≤ 200 lines** — add one line, cut two.
> Updated in the same session as code change (CLAUDE.md §12 Ritual 1).
> History → `docs/PLAN-history.md` (+ `git log -- PLAN.md`). Read after CLAUDE.md every session start.

---

## CURRENT STATE

```
Date:   2026-06-17 (anchor-mode B regenerate-surfaces @cde49fd+48fe57f local; A @a3735eb on origin)
Mode:   ===5=== EDIT (Director activated 2026-06-17 — anchor-mode doctrine: orbit⇒ref-only). A+B done; C (8 shots) PARKED per Director. · E10 governance Mode **2**.

2026-06-17 PM-8 (anchor-mode doctrine B — regenerate surfaces, local-unpushed cde49fd+48fe57f). orbit⇒ref-only
  is the default (E10 A/B smoke). B1: VGENShotPanel anchor toggle «🎯 только реф / 🔗 два якоря» — ref-only nulls
  end_image + hides picker, two-anchor reveals it + fails loud if empty; reuses ProviderControlPanel fields-whitelist
  (ProviderControlPanel untouched). B2: regenerateShot PA tool (thin wrapper over regenerate-video REST; «перегени
  SH07 без якорей»→ref-only; resolves shotId→newest VID-shot via ilike; concierge.md rule 10). tsc·0/912/replay30 (+13
  tests). PUSHED origin @9563bb2. **SMOKE PASSED 2026-06-17:** E10 SH25+SH26 (2 of 4 ungenerated, run end-to-end by
  Polина autonomously via authorized_principal nudge): Animator DISCRIMINATES — SH26 orbit→ref-only (cited doctrine),
  SH25 static→two-anchor; V15 PASS both; rendered; Director accepted («нет дёрганий как с двумя якорями»). Caveat→
  backlog: VGEN render never stamps end_image metadata (can't verify two-anchor honored; possible plan→render gap).
  C (regen 8 infected ref-only) still PARKED till Director go on spend.

2026-06-17 PM-7 (episode FORMAT authority — Slice 2 IMAGE, code-complete UNCOMMITTED). Root: `resolveImageParams`
  was DEAD (never called) → image FORMAT entirely ungoverned; EREF executor hardcoded `EREF_QUALITY='medium'`,
  ignoring `generation_config.image` (E10 had explicit quality=high, rendered medium). FIX (EREF-only scope per
  Director): Layer A enforcement — `readEpisodeImageConfig` + `resolveImageParams` wired into
  episode-references.ts (regular + anchor + legacy-stamp), removed EREF_QUALITY hardcode (episode wins for
  provider+quality; gemini coerced→null, stays via app_config). Layer B awareness —
  `buildEpisodeImageFormatAuthorityBlock` (impl→alias gpt-image-2; no size, no override; quality enforced at
  render, NOT a plan field) injected into Designer + EPREV critic + 2 skill .md. Default quality for
  un-configured episodes = high (Director q). SIZE stays delivery-derived. tsc·0/892/replay30 (+6 tests).
  NEXT: live smoke E10 (single-shot regen → quality=high via Polina); then Slice 3 (dispatch override payload),
  Slice 2b (thumbnail + bible quality).

2026-06-17 (episode FORMAT authority — Slice 1, master @ fee8fd6). Root: episode `generation_config`
  (provider/aspect/quality/resolution) was the single source of truth ONLY at render; the Animator authoring
  path was blind → invented FORMAT. E10 (cfg=720p, overrides OFF) → Animator wrote 1080p → phantom 2.25× cost,
  critic HALT, fabricated "Director hard-contract: resolution=1080p". FIX: producer conforms FORMAT via the
  SAME resolver the render uses (resolveVideoParams), honouring allow_shot_overrides (NOT hardcoding episode-
  wins); provider vocab impl↔alias (vanimAliasFor/episodeProviderAliases); unconditional fab-scrub; Option B
  (prose stops restating format/dur/cost numbers); critic gets the authority block. **Live smoke: SH12/SH13
  re-author → resolution 720p, cost $1.21 (was $2.72), no fabrication, critic PASS — days-long deadlock
  broken.** tsc·0/886/replay30. Remaining E10 1080p-drift shots conform on next re-author. (Slice 2 → PM-7.)

2026-06-16 PM-5 (render-duration model, @67d9d74, in memory session_2026-06-17). `duration_seconds`=RENDER
  duration clamped to provider manifest [min,max] (not raw animatic cut); creative cut trimmed at stitch.
  animator-critic V14 compares vs provider-clamped cut. +2 tests.

2026-06-16 PM-4 (UI/observability, master @ a465213). Activity feed: shared `ActivityEventRow` (3 feeds→1,
  −dup markup) + Director-command highlight (UUID actor=human) + critic verdict in row (·REVISE + warning
  severity, factory.ts — neighbour-session work, committed by Тео). q10 cancel: stale VGEN token silently
  aborted manual renders (kind:cancelled) → now q21-gate HONEST block ($0, reason) + ✕ Clear-block on banner;
  runner check fan-out-only. Plan-contract: human-Director approve REVISION→APPROVED (#7) + reason on
  Generate-from-plan. Cleared stale E10 token. tsc·0/873/replay30. ⚠️ parallel session shares C:\SandyStudio
  working tree — coordinate commits.

2026-06-16 PM-3. Diagnosed E10 "Reference Artist re-ran" alarm: episode-level exec-eref/start (no
  shotId) re-fires the WHOLE-episode pilot pass → redundant IMG-episode_ref SH01/SH02 (REVIEW, ~$0.11)
  on an episode already done (28×2 IMG-anchor + animatic v58 APPROVED). Root: trigger route reroutes EREF
  to per-shot only when shotId+planAssetId present; bare episode trigger = pilot start, no idempotence
  guard (→ fan-out-trigger-shape backlog). NOT blocking video. Polina passivity: model reverted Gemini→
  gpt-5.5 (.env.local, needs restart) + LIVING WORK-PLAN LOOP (4b01a23): reconcile (real status not
  events; APPROVED=done, REVISION/REVISE=blocked) → advance (mark done + single next step) → act/report →
  HALT (markAwaitingDirector). Protocol on existing machinery, no new orchestrator. tsc·0/tests-pass.
  PENDING: server restart to load gpt-5.5+loop. Loop auto-EXECUTES only in bold modes (3/4) — Mode 2 =
  sharp reconcile+report, still needs Director "да"; hands-free ⇒ flip E10 to Mode 3.

2026-06-16 PM-2. TD-84 Shot Plan = editable CONTRACT PAGE (prompt+provider+quality+resolution+seed+anchors;
  PUT /content edit; «Generate from plan» = canonical /trigger path, provider from plan). Removed legacy
  drawer footer (Fast/Standard + provider dropdown → fired plan-less generate-single-shot → silent C1-reject).
  One shared parser `lib/api/shot-plan-contract.ts` read by runner AND contract page (no drift, +9 tests).
  Resolver status-priority APPROVED>REVIEW>image (f31e28b, fixes SH02 hidden video). Worktree cleanup: 18 dead
  removed + naming-validator studio-code whitelist on master (36f0445). q21 readiness-gate CORE (0d8adfb):
  validateShotReadyForGeneration orchestrates plan-parse+provider-caps+media-preflight → fail-loud BEFORE
  paid dispatch; wired into /trigger VGEN plan-path (the silent-C1 path). NEXT q21 slice: factory/autonomous
  + other routes. q21 not stricter than runner (provider/duration→warnings, won't false-block Polina). tsc·0/870/replay30. master @ 6d430c8 (pushed).

2026-06-16 PM. Polina "can't see storyboard" ROOT (613cb17 pillbar, 03c4613 routing): every
  episode-scoped concierge tool resolved `args.episodeId ?? ctx.episodeId` → trusted Gemini's guessed
  episode CODE over the thread-bound UUID → `.eq('episode_id', code)` = 0 rows = false "not found".
  Shared resolveEpisodeId/resolveEpisodeCode (tools/types.ts): thread binding is authority. STB v2 was
  APPROVED all along. Also VGEN pillbar ghost: `has_vid_shots` kept "Cancel VGEN" banner alive forever →
  scared Director after each editor approval; now visible only on real running work. tsc·0/850/concierge175.
  Timeline cell resolver (f31e28b) now picks APPROVED over newer draft. NEXT: kick servers + Polina retest.

2026-06-16 SESSION. E10 furniture-bug ROOT FOUND + fixed: `agents/exec/episode_reference_designer.md`
  LAYOUT LOCK had a hardcoded BEDROOM example («mirror, carpets, bed… MUST appear») the Designer-LLM
  copied verbatim into EVERY plan → gpt-image painted furniture into the elevator (SH01/SH26). De-leaked
  to location-agnostic (scene_master/location-Bible/object_slug); softened anti-invention so script props
  still allowed. SH01 reverted v02→v01 (clean); SH25/SH26 re-authored + anchors regenerated CLEAN
  (verified by eye). Other fixes: q13 single mode-source `lib/concierge/resolve-mode.ts` (episode>global>1,
  both chat routes); factory shot-cap now exempts principal='director'; chat copy-format (time+author in
  text, ConciergePanel); gallery perf — EREF strips request `?w=` thumbnails (1.7MB→0.9KB/tile) via shared
  `lib/media-thumb.ts`. tsc·0/847. Backlog: skill-abstraction audit (eref-shot-composition elevator-set +4),
  critic canon-check, surgical-revision, approve-route forward principal. Polina on Gemini: works but
  drops required tool args (reason/episodeId) — model weakness.

2026-06-15/-14 SESSIONS → archived in session memos (session_2026-06-15_e10-gemini-cap-fixes.md,
  session_2026-06-14_arch-sprint-identity-casting.md). Key landed: regen/SHOT caps + Mode-4 supersede;
  ARCH sprint — episode cast scoping, series_id UUID migration 0038, Phase D casting core (API + preflight
  + PA tool + 'casting' stage node), shot_id SSOT, WCHK ×2. All pushed (…cb5d974). Casting UI panel DEFERRED.
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
