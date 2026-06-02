# SandyStudio — PLAN.md
## Master Production Tracker | v0.3 | DRAFT

> Single source of truth for current phase, blockers, next steps, ownership.
> **Living anchor, NOT an append log. Hard cap ≤ 200 lines** — add one line, cut two.
> Updated in the same session as code change (CLAUDE.md §12 Ritual 1).
> History → `docs/PLAN-history.md` (+ `git log -- PLAN.md`). Read after CLAUDE.md every session start.

---

## CURRENT STATE

```
Date:   2026-06-02
Mode:   ===5=== EDIT (master-session authorized) · Governance Mode 1 MANUAL
Master: f44381f

Just shipped (this session):
  • PR #26 TD-85 · PR #27 Key Art thumbnail (art gate PASS, v12) · PR #28 TOPIC 3 systematic
    pipeline (15→19 stages, Designer→Critic→Artist, StageWorkspacePanel, Critic-canon vocab).
  • MEDIA fix (f44381f): all media display via /api/media cache route; branch /staging retired —
    persist writes to worktree-independent FILMS/_media_cache flat <S>/<E>/media/; route accepts
    id OR filename. tsc · 642 tests · 30 replay. Remaining: upload routes (upload/music) still
    write /staging — repoint next (smaller path).

Active / next (orchestrated master-session + worktree subagents):
  • TOPIC 3 — MERGED; Director UX-smoke in progress (workstation panel, muted rows, verdicts).
  • OUTPUT-CRITIC architecture — DESIGNED (docs/output-critic-architecture-design.md); adversarial
    verdict=needs_revision. Mode-3 autonomy key (AI judges generated artifacts, not just plans).
    CRITICAL open: sync-vs-async invocation + per-episode regen budget cap. Dedicated sprint AFTER Topic-2.
  • TOPIC 2 (q6) — finish distribution (COPY/PUB) + Audience Analyst → full E02 smoke on clean pipeline.
    Real publish+analytics DEFERRED to ~10-20 Shorts (mock until then).

Open architectural threads (carried, see docs/PLAN-history.md):
  • Camera same-angle (q16) — openai-edits-multi has no per-ref weight; single Location ref
    locks layout → all shots same angle. Options: flag-gate / Bible sub-area refs / Flux Redux.
  • TD-39 — PA delivery ack gap BLOCKS Mode 3/4 (long-debt #39).

Budget E21: $4.46 / $25.  Episodes: SS-S15-E01 "Heavy Friend" (full pipeline, S15 active series).
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
| 39 | **PA delivery ack gap — BLOCKS Mode 3/4.** L1 sync ack must-have (~2-3h). Detail in PLAN-history | Mode 3/4 blocker |

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
