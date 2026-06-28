# SandyStudio — PLAN.md
## Master Production Tracker | v0.3 | DRAFT

> Single source of truth for current phase, blockers, next steps, ownership.
> **Living anchor, NOT an append log. Hard cap ≤ 200 lines** — add one line, cut two.
> Updated in the same session as code change (CLAUDE.md §12 Ritual 1).
> History → `docs/PLAN-history.md` (+ `git log -- PLAN.md`). Read after CLAUDE.md every session start.

---

## 🧭 NORTH-STAR (re-anchor here every turn — see rules/common/partnership.md "Compass")

- **Goal (Star):** AI movie factory — first product *Silent Sandy*, a multi-episode AI-animated comedy series, Director-gated at every step.
- **Phase:** E12 done + shot-identity (S-E-SH) merged; next = first LIVE **E13 прогон** (validates the HALT-gate on a real model) → then version-editor (slice 0) → shot-centric refactor.
- **Active intents (drift-check against these):** (1) E13 live run = real gate test; (2) hold PLAN.md + Compass partnership discipline; (3) keep cost sane (Polина harness); (4) finish E12 distribution (copy/thumbnail).
> Stable block — change only when goal/phase/intents genuinely shift, not per session.

---

## CURRENT STATE

```
Date:   2026-06-28 (S2(a)+(b) + S3-measurement SHIPPED — дабл-фаер + billing-петля + gate-лог)
Mode:   ===5=== EDIT (Director-authorized — «погнали, иди до конца фазы»).

2026-06-28 (S3-measurement SHIPPED → master `c8d412c`, Director q2a). decideGate choke-point + gate_decision_log.
  `gate-decision.ts`: build-exhaustive GATE_CLASS Record<AgentId> (mechanical/creative/hard_limit — новый агент
  не пройдёт нерасклассифицированным) + pure decideGate (behaviour-preserving: autonomous=Mode4) + writer.
  migration 0040 gate_decision_log (только writer-колонки, без мёртвой схемы; human-ground-truth остаётся в
  activity_events, E13-анализ джойнит). factory: 2 чтения governance_mode===4 (autoApprove/autoChain) теперь
  через decideGate + 1 строка лога на ран. tsc·0/vitest 1040/replay·30 (Mode-4 не изменился, Mode 1-3 next-events
  тесты целы). 6 форков next-events НЕ коллапсил — отложено в S6/S7 (anti-additive: шов не несущий пока).
  NEXT (решает Директор): watchdog-residual full-close · S-reorder (pilot-first ref/video) · или E13 live-прогон.

2026-06-28 (S2(a)+(b) leak-closing SHIPPED → master `862acc8`,`df53433`). (a) dispatch_intent: заменил racy
  Step 0b (TOCTOU read→оба рендерят: E07×2, E12 SH10 ~$1.21) на АТОМАРНЫЙ claim — migration 0039 table
  UNIQUE(episode,shot,agent) + RPC `claim_dispatch_intent` (терминальный статус→re-claim, regen жив);
  input_hash=ledger-колонка НЕ в ключе; снёс дублёр findInFlightShotDuplicate. (b) billing→escalate-not-loop:
  `provider-failure.ts` классифицирует persistent-billing (fal+OpenAI+Anthropic, text-sig) → factory-catch
  ставит «⛔ Provider out of funds» + metadata.auto_react=false → `logEvent` НЕ будит Полину (зеркалит
  isSelfCausedNotify) → петля failure→wake→failure разорвана; within-wake уже ловил SPIN-guard.
  tsc·0 / vitest 1030 / replay·30. ОСТАТОК (flagged): watchdog может нуднуть 1×/интервал (SPIN-bounded, не
  петля) — полный close gate'ит watchdog на billing-halted эпизоде, отложено. S2(c) поглощён (b).

2026-06-27 PM-2 (S1 cost-visibility SHIPPED). AI-factory autonomy+cost refactor planned (adversarial-hardened
  by 3 lenses; plan `~/.claude/plans/calm-percolating-sifakis.md`; direction in NORTH_STAR §4 + PLANET.md).
  S1 landed: cross-provider LLM pricing fix (MODEL_RATES += gpt-5.5/5.4-mini/5.4/gemini — non-Anthropic was
  Sonnet-defaulted → concierge cost-breaker's cost-limb now works on ALL providers, was decorative); Полина
  cost VISIBLE as per-episode `concierge` line (tokens×price, NO production ceiling — Director D1);
  CONCIERGE_AUTO_REACT_MAX_CALLS 200→40. tsc·0/1014/replay30. gate_decision_log table → S3 (lands with its
  writer `decideGate`); cost-rollup anchor/ref split → S2. NEXT: S2 leak-closing (dispatch_intent + FAILED-cap).

2026-06-27 PM (Compass + PLAN master-only + E12 distribution copy). Built **the Compass** (anti-drift
  forcing-function): per-turn re-anchor to North-Star, Director msg = HYPOTHESIS not order, drift-check,
  visible header v2 `Star/Planet/Course` (rules/common/partnership.md). **PLAN.md = master-only** (feature
  branches never touch it; `.gitattributes merge=union` safety; branch-aware plan-md-update-guard) — CLAUDE.md
  §12. **E12 copy fixed at ROOT:** specs/distribution/metadata.md v0.2 (cold-viewer/SEO-first, English) +
  copywriter.md + thumbnail-designer.md (overlay English); live E12 SPC-metadata rewritten (asset df9ac692).
  NEXT: q8a E12 thumbnail overlay МОЁ ВРЕМЯ!→MY TIME!; q4 portable doctrine repo+bootstrap.

2026-06-27 (Shot-identity refactor → master `4b1f3f4`). E12 done → gate cleared. Слита ветка
  claude/shot-identity-S-E-SH (5 фаз): identity = `S{сезон}-E{эпизод}-SH{номер}` (no SS/act/scene),
  номер присваивается ПО ПОЗИЦИИ в коде (canonicalShotId) → независимость от модели; collectShotIdViolations
  = HARD HALT-гейт (отвергает legacy-компаунд); снесены пластыри normalizeShotId/shotIdsMatchLoose/SH-fallback;
  single-source lib/api/shot-id.ts + resolveShotId (button-number вход "7"/"SH7"/full); feed/UI → SH-токен+статус+версия.
  E01-E12 = LEGACY (opaque, без миграции данных). master был +1 (8722b04 perf-timeline) — авто-мерж без конфликтов.
  Verify на слитом: tsc·0 / vitest 1010 / replay·30. ⚠️ worktree dev: turbopack падает на junction node_modules
  (симлинк out-of-root) — запускать Next без --turbopack ИЛИ из главного репо.
  NEXT: первый ЖИВОЙ E13-прогон провалидирует гейт на реальной модели (mock/replay его не ловит).

2026-06-25 (Полина $100/сутки Anthropic-дренаж — root-fix). Диагноз: петля watchdog↔auto-react × Opus 4.8
  (695 вызовов/сутки, 81% auto-react; budget_log не трекал консьерж → расход был невидим, не «Opus дорогой»).
  Лечение в master (tsc·0 / vitest 997 / replay·30): W1 петля — self-echo skip (events.ts isSelfCausedNotify),
  watchdog no-new-state + close-stale-threads, debounce 5s→20s; W2 reasoning OFF на Opus (гл. причина цены);
  W3 cost-трекинг в budget_log с episode_id + дневной circuit-breaker $20/24ч; W4.a история 80→24; W5 backstop
  25→6, auto-react output→800. Держим Opus, харден. (EREF дубль-дедуп этой записи заменён атомарным
  dispatch_intent в S2(a) 2026-06-28.) План: ~/.claude/plans/functional-tickling-ullman.md.

2026-06-22 PM (E11 video run + AI-EP readiness probe). Тео ведёт прогон в роли AI EP (Pascal), Полина — исполнитель.
  E11 DONE (1-й 4-актный эпизод). 3 фикса в master (tsc·0 / 926 / replay·30): (1) normalizeShotId на единой
  trigger-двери; (2) Storyboarder: число актов из сценария, не хардкод «3» (тройной act-инвариант, HALT);
  (3) STITCH/автостарт исключают удалённый ≤0.5с-шот (isDeletedShot). Дыры AI EP → memory/ai_ep_conception_gaps.md.

2026-06-17 → 2026-06-14 entries (FORMAT-authority slice-1, the 06-16 PM UI/observability/contract series,
  E10 clean-run, identity+casting arch sprint, condensed SHIPPED) → trimmed 2026-06-27 to docs/PLAN-history.md
  + `git log -p -- PLAN.md` + session memos (session_2026-06-15/-16/-17, _2026-06-14_arch-sprint).

GATE-HARDENING RFC (docs/RFC-2026-06-04-…): 10 invariants, 3 phases.
  ✅ Phase 1 SHIPPED (7c76a05): single-approved→INVALIDATED+DB indexes (0036), loud Drive-aware
     resolver + media-preflight gate, atomic pre-spend budget ceiling (0037). Prod DB applied.
  ✅ Phase 2 code COMPLETE (b8ef059/108e8ee/cff8007/bb0669c/37a2390): provider contract (img2vid
     throws imageless), critic auto-bounce cap=2→HALT, VGEN/EREF fold+gate+agent_failed.
     NOTE: critic cap=2 is per-plan-version — SH23 runaway proved it doesn't bound a SHOT (new plan per iter).
  🔨 Phase 3 PENDING = OUTPUT-critic (frame-sampler → vision) + camera/quality_tier checks.

OPERATING DOCTRINE (memory: nudge_polina_dont_act_for_her):
  • Тео = Director's proxy. Nudge Polina via team-chat (POST /api/team-chat/post,
    author=Тео, Bearer TEAM_CHAT_TOKEN) in Director's voice; she executes + LEARNS.
  • Discriminator: Polina misused a working tool → TEACH (nudge); SYSTEM broke
    (tool/gate/dispatch/worker) → Тео FIXES CODE. Mode 2.5: only Director's verbal
    «да» authorizes Polina mutations — Director nudges+approves, Тео on-call for bugs.
  • Keep Inngest worker (:8288) + dev (:3000) alive via preview_start, NEVER manual
    bash (double-supervisor = port-8288 war; killing worker = silent stall).

Hardening backlog (before 10-20 ep run) — full list in memory (backlog_* memos): live items = #1 episode.status
  stuck BRIEF_APPROVED, #3 fan-out sendEvent outside step.run, #4 schedule-analytics silent-fail, #5 trigger
  doesn't validate episode.status, critic REVISE→producer auto-close + revision cap. (WCHK auto-read, PA q<N>y
  gate, EREF gallery/anchor drawer, Reference-Artist Drive-bytes — all FIXED.)
OUTPUT-CRITIC design (docs/output-critic-architecture-design.md): needs_revision (sync-vs-async + per-episode
  regen budget cap). Mode-3 key. Camera same-angle (q16) carried. Episodes: S15-E01 "Heavy Friend", E02 in prod.
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
| 19 | Version-aware text editor — save=new REVIEW version, per-version approve/reject, version rail, one window all text artifacts. **Plan APPROVED 2026-06-20** (`~/.claude/plans/workstation-reference-designerdesigner-r-twinkling-hamming.md`); slice-0 of shot-centric refactor (memory `backlog_shot_centric_paradigm`). IN PROGRESS | Reliability/Audit |
| 20 | PA chat sync POST hangs 50-110s, no progress/cancel — L1 done; L2 SSE streaming + cancel deferred | UX/Reliability |
| 21 | Brief↔Bible consistency validator missing — new EXEC-HW-CRITIC or extend SREV (~6-10h) | Reliability |
| 22 | DELETE asset `asset_updated` event not in PA auto-react whitelist (~30 min) | UX |
| 23 | Designer post-pilot auto-fanout: remaining shot ids stashed but not auto-fired on pilot approve | Reliability |
| 39 | PA delivery ack — L1 DONE (trigger+approve paths). L1.5 per-event corr (inngest_event_id col) deferred | ~~Mode 3/4 blocker~~ |

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
| 2026-06-27 | **Compass v2 + PLAN master-only** (partnership.md, CLAUDE.md §12, `.gitattributes merge=union`, branch-aware guard) · shot-identity S-E-SH merged `4b1f3f4` · E12 distribution copy → cold-viewer/SEO English (metadata.md v0.2 + agents + live asset df9ac692). PLAN compacted 269→<200. | Тео |
| 2026-06-02 | **PR #27 → master `baa1e00`** — Key Art Designer multi-canon thumbnail pipeline + Drive-backed media route. Live art gate PASS on SS-S15-E01 ($0.34, 3 thumbnails, v12 winner). PLAN.md compacted 339→≤200. | Master-session |
| 2026-06-01 | **PR #26 → master `072194e`** — TD-85 resolution discipline in Shot Plan pipeline (runner hard-gates resolution vs provider contract, Critic V13). | Claude Code |
| 2026-05-18 | Sprint φ + gpt-image-2 MERGED (`cc43944`, 206 commits). Skills-as-capabilities. Designer+Animator sprint kickoff. | Director + Claude |

---

*SandyStudio PLAN.md | v0.3 | DRAFT — master-session updates after every state change. Keep ≤ 200 lines.*
