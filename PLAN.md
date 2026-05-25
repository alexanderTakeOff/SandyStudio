# SandyStudio — PLAN.md
## Master Production Tracker | v0.2 | DRAFT

> Single source of truth for current phase, blockers, next steps, ownership.
> Updated **in the same session as code change** (CLAUDE.md §12 Ritual 1).
> Read by Claude Code at every session start (after CLAUDE.md).
>
> Archive: `docs/PLAN-history.md` — completed Sprints S0–S8, change log
> до 2026-04-30, post-pilot tasks PA-001..006, decisions D-001/D-002 history.

---

## CURRENT STATE

```
Phase:    **Sprint q7a — Continuity Stability (TD-33 + TD-35) — SHIPPED 2026-05-23 morning**
          Multi-axis continuity anchors on Designer Plan (`continuity_anchors[]` array
          with `kind: spatial_same_location | temporal_previous_shot`), with back-compat
          parser tolerance for legacy `scene_continuity_anchor_asset_id` (13 existing
          S15-E01 Plans unaffected). TD-35 freshness guard: REST + executor + PA tool
          layered, hard-fail `PLAN_ANCHOR_STALE` directs Polина to `regenerateRefPlan`.
          Vanim Plan end_image/seed/quality_tier wired from Animator → runner → Seedance
          (4 previously-stripped fields now reach the provider). Plan:
          `~/.claude/plans/q7a-structured-zephyr.md`.

Status:   ✅ tsc clean · vitest **481/481** (+30 new) · replay-pilot **29/29**.
          14 files modified + 2 new (freshness module + tests). Squash-merged to master.

          🔴 **Mid-sprint diagnosis (2026-05-22 evening, Director surfaced):** «все шоты
          с одного ракурса, кровать всегда слева кроме шота с дыркой». Root cause is
          architectural, NOT today's sprint:
          • Designer writes diverse `camera_intent` (WIDE/MEDIUM/CLOSE/CLOSE_UP) with
            explicit contrastive rationale — DECISIONS are correct.
          • `openai-edits-multi.ts:13-17` self-documents: «No `strength` parameter is
            exposed by the API → identity is locked hard, emotion/action prompt has
            weaker influence... Per-reference weight not supported».
          • Single canonical Location Bible reference image (one viewpoint) is passed
            as equal-weighted ref in every multi-edit call → gpt-image-2 copies its
            layout → all shots same angle.
          • TD-30 (spatial anchor, yesterday) + q7a (temporal anchor, today) are
            amplifiers — they add MORE same-angle refs. They are NOT the root cause
            (first shot in location, no TD-30 anchor, already showed locked angle).
          • IMG metadata.shot_reference loses camera_angle/sub_area Designer decisions
            entirely — no audit trail on which angle landed.

          ⏳ **OPEN q15/q16/q17** for Director decision (deferred from 2026-05-22 PM):
          • q15 — confirm root-cause diagnosis
          • q16 — immediate next step (a: flag-gate anchors temp-fix; b: Bible sub-area
            refs spring; c: switch to Flux Pro Ultra Redux with per-ref weight; d: ...)
          • q17 — q7a sprint disposition (a: behind flag; b: rollback TD-30+TD-33; c:
            leave as-is) — Director chose merge-to-master (≈ q17c).
          ⚠️ **Do not push more shots through pipeline until q16 decided** — same-angle
          bug reproduces on every new shot.

          📝 **TD-37 — feedback-loop integrity (Director q21y, 2026-05-23 AM)**
          Recon launched per Director directive «как замечания доходят до фронта
          уходящего на исполнение». Storyboarder-class «silent drop в runner»
          bug is CLOSED for all 3 modern runners (Designer/Animator/GAGAD —
          revisionNote inject into prompt as HARD CRITERION block, verified).
          BUT real losses identified, severity-ranked:
          • 🔴 CRITICAL — **Polина-как-медиатор**: Director's verbatim words
              get paraphrased by Polина before she calls regenerateRefPlan PA
              tool. Designer LLM sees Polина's interpretation, not the original
              Director intent. Empirically tested 2026-05-23 with `==BEGIN_VERBATIM==`
              markers + explicit «дословно» instruction → Polина followed
              correctly → fix-direction is "two modes": paraphrase (default)
              vs verbatim-quote (explicit markers). Recommend new PA-tool
              parameter `revisionNoteMode: 'paraphrase' | 'verbatim'`.
          • 🟡 MEDIUM — **`[Prod Assistant]` prefix wrapping** in
              `lib/concierge/tools/dispatch.ts:187` for requestRevision tool.
              Director's text wrapped with procedural noise that LLM may
              discount. Recommend strip prefix when revisionNote contains
              `==VERBATIM==` markers or when explicit author flag set.
          • 🟡 MEDIUM — **Critic acceptance_criteria flattening** in
              `exec-eprev.ts` nextEvent callback. Reviewer's `issues[]` array
              joined into `\n- ` bullet string before forwarding to Designer.
              Nested or multi-line criteria lose structure. Recommend
              preserve as JSON array in event payload + Designer extracts
              structured.
          • 🟡 MEDIUM — **Concurrent revision-notes collision** — second
              `requestRevision` overwrites first without merge. No history.
              Recommend append-only `revision_log[]` instead of singular
              `revision_log` field.
          • 🟢 LOW — upstreamApprovalNotes silent-empty on mock supabase
              (replay-pilot only, not production).
          Class fix priority: #1 (verbatim mode) is biggest payoff and
          smallest patch — ~30 LoC PA-tool parameter + dispatch.ts switch.
          #2-4 are followup work.

          🔴 **TD-39 — PA delivery acknowledgment gap (Director surfaced 2026-05-25)**
          When Polина calls a dispatch tool (`requestRevision`, `approveAsset`,
          `regenerateRefPlan`, `triggerAgent`, `setBibleContent`...) the tool
          returns "succeeded" as soon as the HTTP endpoint replies 200. That
          endpoint only proves: (a) DB row was written, (b) Inngest event was
          emitted. It does NOT prove: (c) Inngest function actually picked the
          event up, (d) a `jobs` row reached `status='RUNNING'`, (e) the agent
          stays alive past first checkpoint, (f) the work didn't immediately
          fail. Polина then tells Director «отправлено» and moves on. In Mode 1
          (manual) Director eyeballs the DAG and notices. In **Mode 3 / Mode 4
          this is catastrophic** — silent loss, no escalation, pipeline just
          stops with nobody knowing.
          Architectural confirmation: `lib/concierge/tools/dispatch.ts:256-271`
          `parseFetchResponse` returns `ok()` purely on HTTP status. No probe
          back into `jobs` table. No wait. No retry.
          Layered fix proposal:
          • **Layer 1 — sync ack inside the tool (~2-3h, 80% coverage).**
              After `internalFetch`, poll for `jobs.status IN ('RUNNING',
              'COMPLETED')` OR `activity_events(event_type='agent_started')`
              tagged with the new asset/event for up to N seconds (default 10s,
              configurable). If not seen → return `fail('dispatched but no
              executor pickup within Ns', 'pickup_timeout')` so Polина
              naturally tells Director "отправил, но не подхватили — чек
              Inngest".
          • **Layer 2 — watchdog cron (~6h).** Scheduled Inngest function every
              60s scans `jobs WHERE status='RUNNING' AND updated_at < NOW() -
              INTERVAL '5 min'` → marks FAILED + emits `activity_event
              (event_type='job_stalled')`. Polина's existing `auto-react`
              + `pa-orphaned-awaiting-sweep` already listens to activity →
              naturally escalates to Director.
          • **Layer 3 — proactive PA awareness (~1-2 day).** After each
              dispatch, Polина records `awaiting_jobs[]` in her thread metadata.
              Next turn (auto-react or ambient tick) she calls a new
              `checkAwaitingJobs` tool that reports COMPLETED → continue,
              FAILED → escalate, RUNNING > N min → ask Director, NOT STARTED
              > N sec → resend OR escalate. Closes Mode 3/4 properly.
          Layer 1 is the must-have for Mode 3/4 to be usable. Estimated patch:
          ~50-80 LoC in `dispatch.ts` + new `lib/concierge/tools/wait-for-pickup.ts`
          + 1 SQL helper + tests. Layers 2+3 are followups.

Next:    1. Restart smoke (SH21/SH22 plan-level regen + onwards) — ONLY after q16.
          2. Polина briefing: q6 skill update from yesterday is SUPERSEDED by q7a Step 7
             (eref-shot-composition trimmed to Plan-contract one-liner).
          3. TD-36 (StudioShell ergonomics — 3 fixes dictated 2026-05-22 evening,
             not urgent) — Director still owes screenshot for fix #3.
          4. **TD-39 Layer 1 — PA delivery ack (Director-flagged 2026-05-25, MUST-have
             before any Mode 3/Mode 4 run).**

Mode:    ===5=== authorized for commit+push+merge (Director directive 2026-05-23 AM).
         Mode 1 governance.
Date:    2026-05-25
```

## SPRINT STATUS

Sprints S0–S8 (foundation + spec) all COMPLETE 2026-04-23..28 — details in `docs/PLAN-history.md`.

### Sprint 9 — Web application (live)

| Phase | Description | Status |
|-------|-------------|--------|
| 1–4 | Schema + scaffold + Inngest + agent jobs library | ✅ COMPLETE 2026-04-28 |
| 5a–5c | UX specs + API routes + first-run + cockpit | ✅ COMPLETE 2026-04-29 |
| 5d | Pipeline kebab + CodeMirror editor + preview drawer | ✅ COMPLETE 2026-04-30 |
| 6 | Per-episode sub-pages, budget detail tab, jobs detail panel | ⏳ partially (episode page + timeline done) |
| 7 | Approval Authority Matrix per-row editing + delegate UI | ⏳ pending |
| 8 | Real providers — gpt-image-1 + Drive + Veo 3/3.1 | ✅ COMPLETE 2026-04-30 (Kling/Suno/YouTube deferred) |
| 9 | PM2 ecosystem + Tailscale + production hardening | ⏳ pending |
| A.1 | Animatic director_overrides + EpisodeTimeline Phase A | ✅ COMPLETE 2026-05-06..07 |
| A.2 | VGEN auto-COMPLETE + EXEC-STITCH + Audio reorg + Bug A/C/D | ✅ COMPLETE 2026-05-08..10 |
| **Mode 2.5 Phase 1-A + 1-B + Phase A** | Prod Assistant + memory + TTS + 13 tools + verbal approval + gpt-5.5 + BEHAVIOR_CONTRACT | ✅ COMPLETE 2026-05-08..12 (PR #23 OPEN) |
| **Sprint P0/α/β/γ** | Flux 422 + E20 archive + Realtime trigger + Seedance capability manifests + E21 production via PA | ✅ COMPLETE 2026-05-14..18 |
| **Sprint φ** | Skills-as-capabilities lazy two-step API + 2 broad capability playbooks + EREF chain fix + RejectModal + EREF state mirror + gpt-image-2 | ✅ COMPLETE 2026-05-18 (master `cc43944`) |
| **Sprint «Дизайнер и Аниматор»** | Episode Reference Designer + Animator full agents + 2 Critics + PA integration + delivery_targets + E22 smoke. Closes architectural gap: VGEN/EREF as template-functions → as decision-making agents | ⏳ IN PROGRESS Day 1/11 (2026-05-18) |

---

## ACTIVE BACKLOG

### Long-debt (долговая тетрадка) — small fixes, не блокирующие

| # | Bug / improvement | Severity |
|---|---|---|
| 1 | Friendly agent names everywhere (EXEC-SW → "Screenwriter"). Re-trigger modal, Inbox, Pipeline DAG, Activity feed | UX |
| 2 | Per-stage trigger button in DAG (instead of generic Re-trigger modal with dropdown) | UX |
| 4 | `markJobFailed` on any throw, not only gate-fail. Job rows shouldn't sit RUNNING after Inngest function.failed | Reliability |
| 5 | Re-trigger dedup: refuse if same agent already has COMPLETED/RUNNING job for that asset | UX |
| 6 | Asset preview drawer in Inbox (image/video/audio/markdown). Today: `confirm()` modal for visuals | UX |
| 7 | Tooltips on buttons (Mode 1/2/3 picker, APPROVE/REVISE/REJECT); inline mode descriptions | UX |
| 8 | Authority Matrix per-row editing UI (currently read-only display) | Phase 7 |
| 13 | `episodes.status` doesn't update after milestone approvals — stays `BRIEF_APPROVED` even when published | Reliability |
| 14 | `schedule-analytics` cron not firing after EXEC-PUB. Verify runner.ts EXEC-PUB emits `result.next_event` properly | Reliability |
| 15 | Mode 4 auto-revert to Mode 1 on session end (per governance.md §4) | Compliance |
| 16 | EXEC-VGEN base file_type duplicate `shot` token: produces `VID-shot-shot1` | Cosmetic |
| 17 | Videomatic FFmpeg export aspect ratio: requested 16:9, observed 1:1 with content centered. First real MP4 produced 2026-05-08. Inspect ffmpeg canvas dims, source clip dimensions, padding/crop in `webapp/lib/agents/providers/ffmpeg-stitch.ts` | Reliability |
| 18 | Prod Assistant TTS quality — Director confirmed 2026-05-08 smoke: голос "как больной робот". Web Speech SpeechSynthesis на Windows = системные голоса (Pavel/Irina). Upgrade path: ElevenLabs или OpenAI TTS API (~$0.015/1K chars). Decision deferred until 2nd use | UX |
| 20 | **PA chat streaming + cancel button + alive-indicator.** Surfaced 2026-05-19 SS-S15-E01 smoke: Polina chat is sync POST `/api/concierge/chat` that hangs 50-110+ sec per turn (multi-roundtrip OpenAI + tool_calls). Client shows static thinking dots — no progress, no cancel, no per-tool visibility. When OpenAI errored on 450KB context bomb (since fixed via listSeriesBibles strip), UI stuck in `isLoading=true` indefinitely with no timeout. Three layered remediation: (a) **Level 1 cosmetic** ~30-40 min — fix dot animation CSS keyframes + client-side 90s timeout with toast/auto-recover + fake cancel button (closes fetch, server keeps spending). (b) **Level 2 SSE streaming + real cancel** ~4-6h — `/api/concierge/chat` returns Server-Sent Events stream; client renders text deltas as they arrive + per-tool plashka «Polina вызывает createSeries…»; real cancel via AbortController on client → server detects req.signal.aborted → cancels OpenAI mid-flight via AbortController on SDK call. (c) **Level 3 activity feed integration** +1-2h on Level 2 — emit `activity_events(event_type=pa_tool_call)` for each tool dispatch so events also show in main activity panel (not just chat); Realtime subscription pushes them to UI. Director-preferred minimum at session 2026-05-19: q1b (Level 1 + listSeriesBibles strip = the strip is done in commit 55958c8). Q for next session: Level 2 + 3 as one «PA Streaming + Cancel» mini-sprint. Decision deferred until after SS-S15-E01 first complete cycle. | UX / Reliability |
| 23 | **Designer post-pilot auto-fanout-trigger (NEW gap 2026-05-20).** After `cdb7f9f` Pilot Pass fix, REV-world_check.APPROVED fan-outs only first 2 shots as SPC-ref_plan events. Remaining shot ids land in `episodes.metadata.designer_fanout_pending` (+ `designer_pilot_count` + `designer_fanout_total`). Missing: mechanism that auto-fan-outs the remaining shot ids when Director approves both pilot SPC-ref_plan assets. Mirror EREF v2 `sandystudio/exec-eref/fanout-trigger` event pattern: (a) new Inngest event `sandystudio/exec-eref-designer/fanout-trigger`; (b) approve route detects last-pilot-approved condition (count APPROVED SPC-ref_plan == designer_pilot_count) and fires the event; (c) handler reads `designer_fanout_pending`, fires one Designer plan event per stashed shot id, clears the array. Effort: ~2-3h with tests. Today's smoke can be unblocked by Polina manually calling `triggerAgent('EXEC-EREF-DESIGNER', {shotId})` per remaining shot (20×). Required for the next series so production doesn't need manual fan-out | Reliability / UX |
| 22 | **DELETE asset / asset_updated events not actionable for PA auto-react.** When Director deletes an asset from Library, the handler writes `event_type='asset_updated'` which is NOT in the Postgres trigger's actionable whitelist (migration 0030). Polina therefore can't autonomously react to «Director deleted X». Two options: widen whitelist to include 'asset_updated' (potentially noisy on every edit), or refactor delete handler to use `agent_completed` with `actor='EXEC-BIBLE-AUTHOR'` (already validated pattern from `6f54ddd`). Effort: ~30 min. Defer with TD-22 priority — low (auto-react on deletes is nice-to-have, not blocking) | UX |
| 21 | **Brief↔Bible consistency validator missing (NEW gap 2026-05-20).** Discovered during plan `soft-swimming-thunder.md`. ART-HW writes `SPC-story_brief`; EXEC-SW reads it directly; EXEC-SREV reviews the **script**, not the brief; nobody verifies brief is compatible with Series Bible (character canon, world rules, declared style anchor). Risk: brief asks for behavior/look the Bible forbids; contradiction surfaces three layers downstream as Designer/Animator HALT, costing wall-clock + tokens with no clear cause. Options: (a) new Critic agent EXEC-HW-CRITIC between ART-HW APPROVED and EXEC-SW trigger — symmetric with EREF Designer's Critic + Animator's Critic shipped in Sprint «Дизайнер и Аниматор» (recommended); (b) extend EXEC-SREV to also re-read the brief and flag brief↔Bible drift in addition to script↔brief drift; (c) light pre-check in `gate.ts` for SPC-story_brief APPROVED transition mirroring the Bible canon precondition EXEC-EREF already does at gate.ts:286. Effort: ~6-10h for option (a). Defer until current Polina fix lands + SS-S15 smoke completes | Reliability / Creative |
| 39 | **PA delivery acknowledgment gap (BLOCKS Mode 3/4).** Director surfaced 2026-05-25. PA dispatch tools (`requestRevision`, `approveAsset`, `regenerateRefPlan`, `triggerAgent`, `setBibleContent`) return success on HTTP 200 from the underlying API endpoint — proves DB write + Inngest event emit, NOT that the Inngest function actually picked up the work. Polина reports «отправил» to Director and proceeds. In Mode 1 Director eyeballs the DAG; in **Mode 3 / Mode 4 = silent loss**. Architectural confirmation: `lib/concierge/tools/dispatch.ts:256-271 parseFetchResponse`. Layered fix: **L1** sync ack — after internalFetch, poll `jobs.status IN (RUNNING,COMPLETED)` OR `activity_events(event_type='agent_started')` for ≤10s; return `pickup_timeout` if not seen; ~50-80 LoC + tests (~2-3h, 80% coverage, MUST before Mode 3/4). **L2** Inngest cron every 60s marks `jobs RUNNING > 5min` as FAILED + emits `job_stalled` event for Polина auto-react (~6h). **L3** Polина records `awaiting_jobs[]` per thread + new `checkAwaitingJobs` tool reads status next turn → COMPLETED/FAILED/escalate (~1-2d). See CURRENT STATE TD-39 for full proposal. | Reliability / Mode 3-4 blocker |
| 19 | **Asset content edits overwrite in place — no version increment.** Surfaced 2026-05-19 SS-S15-E01 «Heavy Friend» smoke. `PUT /api/assets/[id]/content` (UI «Edit brief» button + PA tool `editBrief`) mutates same row → filename stays `v01`, no audit between agent and Director edits, «approve» targets ambiguous last-writer-wins state. Director's expected model: «my edit = v02 · agent's edit = v03 · approve targets a specific version». Affects ALL Plan-assets (SPC-brief / SCR-script / STB-storyboard / SPC-ref_plan / SPC-shot_plan / SPC-gag_plan / BIB-*). `setBibleContent` PA tool already does «create new version» correctly — this is the inconsistency to fix. Remediation: endpoint INSERT row v+1 instead of UPDATE; status DRAFT for new version; old row stays. ~30-40 min endpoint + ~15 min regression test. UI version selector dropdown is separate ~2h. Decision deferred per Director 2026-05-19 — keep current behaviour through smoke, fix before next series | Reliability / Audit |

**Already fixed in Phase 5c** (don't re-add): #3 Story phantom stage hidden · #9 Multi-asset milestone chain via `computeNextEvents` (STB×3, animatic fan-out, metadata→thumb, ready→pub) · #10 Pipeline View stage filter · #11 Factory writes `agent_completed` · #12 STAGE_FROM_ASSET prefix matching.

### Long-term architecture roadmap (LT-01..LT-14)

| # | Item | Status |
|---|---|---|
| LT-01 | **Mode 2.5 — APPRENTICE governance**. Agent-led pipeline, Director supervises, conversational control, Skill Editor learning loop. Bridge between Mode 2 and Mode 3 | ✅ **Phase 1-A + 1-B + Phase A SHIPPED** 2026-05-08..12 (PR #23 OPEN). Prod Assistant + 13 tools + verbal approval + gpt-5.5 + BEHAVIOR_CONTRACT. Phase B Skill Editor / Learning Loop design ready (`~/.claude/plans/valiant-soaring-karp.md`), implementation deferred — wait for Director green-light + 2 weeks of Phase A operation evidence |
| LT-02 | **EpisodeTimeline** — unified review surface (animatic frames → real mp4s → stitched final). Multi-track audio, hybrid playback, drawer prev/next | ✅ **Phase A SHIPPED** 2026-05-06..07 (AnimaticPlayer + EpisodeTimelineSection). Final-cut integration via Bug D pill 2026-05-10 |
| LT-03 | **EXEC-STITCH** — ffmpeg concat assembly → final mp4. Renderer, not editor | ✅ **COMPLETE 2026-05-08** (Phase A.2 PR β). `lib/agents/providers/ffmpeg-stitch.ts`, concurrency 1, FFMPEG_PATH env + winget Windows fallback. SS-S14-E01 first real mp4. Transitions (fade/dissolve) deferred — hard cut for now |
| LT-04 | **Audio block reorg** — MGEN before Animatic, animatic renders WITH music for pacing review | ✅ **COMPLETE 2026-05-08** (Phase A.2 PR γ). MGEN fires after `REV-world_check`, EDIT gates on EREF+music, musicAssetId baked into animatic_v1. Smoke #2 on new episode pending |
| LT-05 | **Skill Editor / Skill Update Candidate** — rule candidates store, Director approval flow, audit trail. Prerequisite for Mode 2.5 Learning Loop | DESIGN PENDING (Path A, deferred after 2 weeks of Mode 2.5 Phase 1 operation) |
| LT-06 | **Improve `buildShotPromptV2`** — inject storyboard rich data + Bible canon (action_prose, expected_emotion, expected_gag, camera_angle, character emotions) per technology.md §1 "quality > token cost" | PLANNED — Phase 1.5 follow-up after VGEN epic merges |
| LT-07 | **Variants per generation** — Veo 3 `numberOfVideos: 1-4`. UI dropdown + multi-asset persist + side-by-side review in drawer | PLANNED — Phase 1.5 |
| LT-08 | **Vertex AI quota mitigation** — Veo 3 429 at concurrency 2+3. Options: (a) quota increase request; (b) Inngest backoff retry; (c) batch sleep; (d) failover to Kling | PLANNED — Phase 1.5 |
| LT-09 | **Pipeline stage progress arc animation** — animated arc filling around stage emoji as % done. Respect `prefers-reduced-motion` | PLANNED — backlog |
| LT-10 | **Scalable timeline for 60+ shots** — virtualised scroll / mini-map / chapter grouping. Trigger when first episode > 30 shots | PLANNED — backlog |
| LT-11 | **Episode page noise cleanup** — pillbar + Videomatic + activity feed + cards stacked. Re-organise into tabs / collapsible. Coordinate with uiux.md | PLANNED — backlog |
| LT-12 | **Foldable Activity Feed** — group consecutive same-agent rows ("12× VGEN single-shot completed in 4m") | PLANNED — backlog |
| LT-13 | **Activity Feed time filters** — "older than 1h / 1d / 1w" chips to dim/hide stale events | PLANNED — backlog |
| LT-14 | **Bible locations + styles in VGEN prompt** — extend `buildShotPromptV2` to inject location + style snippets. Mirror Phase A.1 character-canon pattern | PLANNED — backlog |

### VGEN params vs Bible — audit conclusion (2026-05-07)

No bugs in current VGEN parameter sourcing. Two gaps logged: series-level `vgen_defaults` UI (LT-07) and Bible locations/styles in prompt (LT-14). Full audit table in `docs/PLAN-history.md` if needed.

---

## RULES (enforce every session)

### UI/UX

- Any visual change → read `specs/system/uiux.md` first.
- Use semantic theme tokens — no raw hex in components.
- Approval Queue = highest-priority UI path (Phase 6).
- Do NOT implement Interactive Asset Galaxy v2 unless explicitly planned.
- Update `specs/system/uiux.md` if visual rules change.

### Methodology — SDD (Spec Driven Development)

Spec DRAFT → REVIEW → APPROVED → Implementation → Output REVIEW → APPROVED. No agent writes content until the spec for that content is APPROVED.

### Post-pilot architectural tasks (PA-001..PA-006)

All absorbed or in-flight:
- PA-001/002/003 Character Reference Architecture — ✅ done via EREF v1+v2 + Phase A.1 character-canon text injection.
- PA-004 `config/defaults.yaml` review — ✅ done piecemeal during Phase 5c/8.
- PA-005 Character Visual Development Workflow — spec at `specs/production/character_visual_development.md` v0.1; UI absorbed into LT-07.
- PA-006 Multi-Audience KPI Layer — spec at `specs/production/audience_kpi.md` v0.1; QA enforcement deferred (post-MVP).

### Open decisions

- **D-001** Character visual consistency — ✅ A2-Kling → partial reversal: Veo 3 img2vid for MVP (~75% consistency), Kling re-evaluated as Phase 8.5.
- **D-002** Assembly tool — ✅ B4 FFmpeg + optional DaVinci colour pass.

History in `docs/PLAN-history.md`.

---

## CHANGE LOG (last 30 days)

Pre-2026-04-30 entries → `docs/PLAN-history.md`.

| Date | Change | By |
|------|--------|----|
| 2026-05-18 | **Sprint «Дизайнер и Аниматор» kickoff** — Director-approved 11-day arc to close architectural gap (VGEN+EREF as template-functions → as decision-making agents). Two new full agents (Episode Reference Designer + Animator) + two Critics (Designer's Critic + Animator's Critic) + PA integration (askAgent tool + Plan-asset approval flow) + UX fix (PA panel always-visible) + brief extension (delivery_targets). Closes Director-flagged Stage A issues #1 (EREF aspect ratio) and #2 (camera too subtle) at root cause, not symptom. Issue #3 (no audio yet) deferred to next sprint. Diagnosis memo in chat; Day 1 starts: migration 0031 + asset types + naming + delivery_targets + glossary + skills tree + PA panel fix. | Director + Claude Code |
| 2026-05-18 | **Sprint φ + 2026-05-16 hotfixes + gpt-image-2 MERGED to master** (squash commit `cc43944`, 206 commits, 188 files, +19782/−435). Skills-as-capabilities refactor (lazy two-step API: getAgentSkillManifest → loadAgentSkillBodies), 2 broad capability playbooks (`storyboarder-situational-comedy`, `eref-shot-composition`), seedance-prompting ACTIVE, 3 atomic σ seeds DEPRECATED. EREF chain bug fix (approve route resolves REV-* → underlying STB asset id via findLatestApprovedAssetId). RejectModal directorConfirm true. regenerate-image route skips auto_upscale provider entries. EpisodeAssetDrawer/AssetImagePromptSection visible busy/done states. EREF state mirror to episodes.metadata.eref_pilot_state. gpt-image-1 → gpt-image-2 across openai-image, openai-image-edit, openai-edits-multi (~15% cost refresh). E21 Stage A: 22/22 EREF generated, 2 VGEN pilots APPROVED, $4.46 / $25 budget. tsc clean · vitest 216/216 · replay-pilot 29/29. | Director + Claude Code |
| 2026-05-12 | **PR #23 MERGED** to master (merge commit `8fa5c00`, --merge style preserves 227 auto-sync commits). Mode 2.5 PA + Mode 3 readiness drill shipped. | Director + Claude Code |
| 2026-05-12 | fix(srev): runner's internal `findApprovedAsset` (script-reviewer.ts) — was a second layer of the same deadlock, requiring `status === 'APPROVED'` after gate already passed. Renamed semantically (still legacy name) to accept `REVIEW`/`REVISION`/`APPROVED` so Story Editor can review pending drafts. tsc clean, 166/166. (`lib/agents/runners/script-reviewer.ts`) | Claude Code |
| 2026-05-12 | fix(gate): Story Editor's upstream gate now accepts SCR in `REVIEW`/`REVISION`/`APPROVED` status — pre-fix gate required APPROVED upstream, but Story Editor IS the gate FROM REVIEW to APPROVED (chicken-and-egg deadlock for the internal Writer↔Story Editor loop). Added `AgentDependency.allowedStatuses` field, single-status path still uses .eq() (test compat), multi-status uses .in(). 166/166 tests. (`lib/agents/gate.ts`) | Claude Code |
| 2026-05-12 | feat(pa): BEHAVIOR_CONTRACT rule 1b "Proactive Pipeline Driving" — PA must push Director with next concrete proposal, not wait for "что дальше?". Flight-crew analogy from Director's 17:05 directive: Director draws the route, PA flies the plane. Each PA response ends with next concrete action OR single targeted unblock question. Mode 3 readiness measure: how rarely Director has to ask what's next. (`lib/concierge/system-prompt-builder.ts`) | Claude Code |
| 2026-05-12 | docs(tech): `technology.md` §7 "Multi-agent task handoff protocol" — 4 subsections (task definition · handoff invariants · loop closure · skill-over-plumbing). Lessons learnt from E20 v02 fiasco. Director directive 2026-05-12 "зафиксируем как надо действовать". (`technology.md`) | Claude Code |
| 2026-05-12 | feat(workflow): close Writer↔Story Editor internal loop — Director directive 2026-05-12 "Writer плохо → Story Editor возвращает Writer'у, не показывать Director'у плохой draft". (1) `agents/exec/script_reviewer.md` — 4 new hard checks: S09 per-scene ≤8s (Veo cap) + preferred 3-5s · S10 total runtime ±5% of brief target · S11 gag density floor (≥1 per 6-7s per technology.md §3.5) · S12 revisionNote compliance as hard contract. (2) `inngest/functions/exec-srev.ts` `nextEvent` verdict-based: REVISE/FAIL → Writer auto-fire with review markdown as revisionNote; PASS → SB+COPY. Pipeline now self-converges before Director sees draft. (`agents/exec/script_reviewer.md`, `inngest/functions/exec-srev.ts`) | Claude Code |
| 2026-05-12 | fix(ui): factory.ts activity_event titles → human role names. Was `"EXEC-SW completed"` / `"EXEC-SW: Write Script started"`, now `"Writer completed"` / `"Writer started"`. Closes Director's 16:56 screenshot showing "EXEC-SW completed" in Preview drawer header. (`lib/agents/factory.ts`) | Claude Code |
| 2026-05-12 | fix(screenwriter): root cause of v02-worse-than-v01 — 3 chained bugs. (1) `revisionNote` was silently dropped at factory.ts → runner.ts → runScreenwriter chain — Writer ran fresh without Director's note. (2) When note DID reach prompt, instruction was "Apply the **minimum change**, do not rewrite scenes that were not flagged" — opposite of restructure intent. (3) No machine validation of self-QA → Writer hallucinated "80s ≈ 60s within tolerance". Fixes: `RunAgentArgs.revisionNote` field, factory forwards from event data, screenwriter prompt now treats note as HARD ACCEPTANCE CRITERIA (explicit unit count / duration / forbidden tokens / pronouns enforced as hard contract; full restructure on "rewrite into N units" requests; self-validate before submit). tsc clean, 166/166 tests. (`lib/agents/runner.ts`, `lib/agents/factory.ts`, `lib/agents/runners/screenwriter.ts`) | Claude Code |
| 2026-05-12 | fix(pipeline): REQUEST_REVISION auto-chains to producing agent — `revisionEventForAsset(file_type)` maps SCR/REV/STB/AUD/VID-animatic/SPC-metadata → Inngest event of producer; route now dispatches re-run after status flip. Closes Mode 3 readiness gap surfaced by Director 16:44 "никто не работает" + PA correct articulation. Per-shot VGEN/EREF/thumbnail/publish intentionally NOT chained (they have dedicated UI paths). (`app/api/assets/[id]/approve/route.ts`) | Claude Code |
| 2026-05-12 | docs(tech): `technology.md` §3.5 "Shot rhythm & gag density" — action/comedy cut every 3-5s, hard generator cap 8s/shot (Veo 3 range 4-8s), gag floor 6-7s, target 8-10 gags per 60s episode. Story Editor must verdict REVISE if density below floor. Director directive 2026-05-12 16:37. | Claude Code |
| 2026-05-12 | fix(pa): approval gate now position-aware — when a Director turn contains BOTH approval and rejection tokens (e.g. "не решили, но одобряю N"), the LATER token wins. Pre-fix the bare "нет" mid-sentence triggered rejection BEFORE later "одобряю" got scanned. New helpers `approvalPosition` / `rejectionPosition` / `verdictForTurn`. 166/166 tests, tsc clean. (`lib/concierge/approval-check.ts`) | Claude Code |
| 2026-05-12 | feat(pa-tools): event-awareness layer — 2 new read-only tools `getAsset(assetId, includeContent?)` and `getRecentActivityEvents(episodeId?, sinceMinutes?, limit?)` + BEHAVIOR_CONTRACT rule 1a forcing PA to call `getRecentActivityEvents` at start of every Director turn when an episode is in focus, then surface completions/draft readiness BEFORE answering literal question. Closes Director's 16:23 directive "события которые произошло должно быть известно всем участникам" — PA can now read full asset bodies (review notes, agent self-critique) and check pipeline events proactively. Future EXEC-DIR-AI (Mode 3) inherits same tools. PA tool count 14 → 16. Push-based Realtime layer deferred. | Claude Code |
| 2026-05-12 | feat(ui): agent role names sweep — centralized `lib/api/agent-names.ts` (30+ EXEC-*/BOARD-*/ART-*/Director → industry-standard short English roles). Pipeline DAG labels (14 rows), Episode page TriggerModal dropdown + brief approval text, AssetPreview drawer agent_id, AssetDetailDrawer "Bible Editor" replaces EXEC-BIBLE-AUTHOR (3 spots), EpisodeReferencesGallery empty state. PA `system-prompt-builder` AGENT_NAMES block already aligned. Long-debt #1 closed. (`lib/api/agent-names.ts`, `lib/api/pipeline-stages.ts`, `components/preview/AssetPreview.tsx`, `components/series-bible/AssetDetailDrawer.tsx`, `components/episode/EpisodeReferencesGallery.tsx`, `app/(studio)/episodes/[id]/page.tsx`) | Claude Code |
| 2026-05-12 | fix(agents): EXEC-SREV (Script Editor) `SREV_MAX_TOKENS` 3000 → 12000 — Mode 3 readiness drill caught crash loop: Sonnet hit max_tokens before closing JSON block (output 11237-12246 chars / ~3K tokens). Storyboarder uses 16K, Screenwriter 8K; SREV was undersized. `lib/agents/runners/script-reviewer.ts`. | Claude Code |
| 2026-05-12 | feat(pa): AGENT_NAMES block added to system-prompt-builder — short English industry-standard role names (Writer / Story Editor / Production Designer / Storyboard Artist / Script Supervisor / Animator / Composer / Online Editor / Publicist / Key Art Designer / Distribution / Audience Analyst / Bible Editor + 12 strategic/artistic). PA must use role names in user-facing text, technical codes only for debugging. Director directive 2026-05-12 "немножко не по-человечески". (`lib/concierge/system-prompt-builder.ts`) | Claude Code |
| 2026-05-12 | chore(e01): 49 SS-S14-E01 legacy assets soft-archived (DRAFT/REVIEW/REVISION → REJECTED). Closes Director's 10:10 "закрой эту тему чтобы она больше не поднималась". 13 APPROVED E01 shots preserved (final-cut state). 49 activity_events written. Pending approvals down 18 → 1 (only E20 brief remains). Script: `webapp/scripts/close-e01-legacy-pending.ts`. | Claude Code |
| 2026-05-12 | chore(bible): Sandy v02 DRAFT created with full canonical text — clone of v01 LOCKED image fields + 2309-char canon per S14 STYLE CANON v1.1. Closes Director's 09:58 observation "пропущены текстовые блоки в описании героя". Phase D Character Identity Model deferred (PA-proposed schema captured in observations). Asset id `d01b424c-cd47-48d3-b2b1-6bd52d59c7a5` awaiting Director lock via UI. Script: `webapp/scripts/clone-sandy-v02-with-text.ts`. | Claude Code |
| 2026-05-12 | fix(ui): Library SWR polling 30s→10s after Director observation "обновление через несколько секунд немножко долговато". 3× API hits but cached Bible JSON is light. (`components/series-bible/SeriesBibleView.tsx`) | Claude Code |
| 2026-05-12 | docs(canon): S14 STYLE CANON v1.1 — outline gains pencil-like edge clause after Director validation on H/J v3 (Pink Panther-родственная теплота). §1 Line & Shape + §8 generation prompt template updated. Hatching/scribble explicitly forbidden — pencil = outline-only, fills stay flat vector. Awaiting Director lock as `SS-S14-SBL-style_s14_canon_v1-v01-LOCKED`. Draft: `webapp/scripts/style-canon-draft.md`. | Claude Code |
| 2026-05-12 | feat(library): kebab DELETE shipped — DELETE /api/assets/[id] route (scope: DRAFT/REVIEW/REVISION/REJECTED) + AssetCard kebab activates 'Delete' with confirm dialog. APPROVED/LOCKED blocked. activity_event logged. Closes Director's 09:14 ask "удалять как минимум драфты без всяких ограничений". (`app/api/assets/[id]/route.ts`, `components/series-bible/AssetCard.tsx`) | Claude Code |
| 2026-05-12 | fix(pa): verbal approval window now counts only Director turns (was: all turns including assistant/tool). Closes Director's 08:38 friction "Почему повторно одобрение Хотя я давал на создание И генерацию". Compound approvals now survive PA's multi-step execution. `windowSize=4` semantics changed; tsc clean, 166/166 tests. (`webapp/lib/concierge/approval-check.ts`) | Claude Code |
| 2026-05-12 | fix(ui): Bible/Library auto-refresh — `components/series-bible/SeriesBibleView.tsx` SWR config gains `refreshInterval: 30_000` + `revalidateOnFocus: true`. Matches studio-wide pattern (Activity/Budget/Episodes/Inbox/Series list all 30-60s). Closes Director's 08:27 observation that Library doesn't refresh after PA enrichBible / regenerateBibleImage / status flips — was only mutate'ing on in-page actions, server-side writes from PA tools didn't propagate without manual page reload. | Claude Code |
| 2026-05-12 | chore(s14): style canon cleanup (Director q2 / soft archive) — `scripts/cleanup-s14-style-canon.ts`. Phase A: 3 stale assets → REJECTED (LOCKED `style_episode_perfume_02` 3D-cafe culprit + DRAFT with .mp4 staging + bonus LOCKED `location_neon_cafe`). Phase B: 47 dependents cleared their `metadata.image_prompt.style_anchor_asset_id` (5 active Bible — Perfume Madame, Sandy Variant, 3 E20 locations — + 42 SS-S14-E01 episode_refs in DRAFT/REVIEW/REJECTED). 13 APPROVED SS-S14-E01 final-cut shots preserved per q2. All ops logged in `activity_events` for audit. Bypassed asset_status state machine for LOCKED → REJECTED via service-role one-off. | Claude Code |
| 2026-05-12 | feat(pa-tool): `regenerateBibleImage` tool — Director-triggered reroll for already-enriched Bible / IMG-* assets. Closes the gap PA hit during Perfume Madame / E20 location smoke: `enrichBible` only works for first enrichment, `Asset already enriched — use /regenerate-image` for reruns, but `/regenerate-image` was UI-only. New tool POSTs `prompt + directorConfirm:true` to `/api/assets/[id]/regenerate-image` with verbal-approval gate. Refuses on LOCKED. Surfaces `new_version` and `cost_usd`. Registered in `lib/concierge/tools/index.ts`. 14 PA tools now total. tsc clean, 166/166 tests pass. (auto-sync commits `4f99c38..32d73a8`) | Claude Code |
| 2026-05-12 | feat(hooks): 5 Operational-Ritual hooks (Task 2 of `purrfect-stirring-hollerith.md`). Hook A `plan-md-staleness-check` (SessionStart, Ritual 2, warns > 3 days) · Hook E `parallel-session-warn` (SessionStart, > 3 worktrees) · Hook B `plan-md-update-guard` (PreToolUse Bash `git commit*`, Ritual 1, soft-warns if code committed without PLAN.md) · Hook C `verify-trio-on-push` (PreToolUse Bash `git push*`, Ritual 3, runs tsc + vitest, blocks on fail) · Hook D `session-end-memo-check` (Stop, Ritual 4, warns if no `session_YYYY-MM-DD_*.md` memo). Helper `lib/git-changed.cjs` shared by B+C. All soft (exit 1) by default; `SANDY_HOOKS_OFF=1` global kill. Wired in `.claude/settings.json`. (commit `de7d004`) | Claude Code |
| 2026-05-12 | docs: CLAUDE.md slim 604→347 lines (−42.5%) + `docs/CLAUDE-history.md` archive (279 lines). Same recipe as PLAN.md slim. §2/§4/§5/§8 heavy compress; canonical strings preserved (resolver, agent IDs, modes, hard limits, 8 arch rules, 4 rituals). Anti-stale fixes: §6 Mode 2.5 SHIPPED, §5 model `gpt-5.5` + reasoning=none, §4 EXEC-STITCH +1. Combined with PLAN.md slim: session-start token budget ~22K → ~7.7K (−65%). Plan: `~/.claude/plans/purrfect-stirring-hollerith.md` Task 1. (commits `e32adcb`, `512fac1`) | Claude Code |
| 2026-05-12 | merge: origin/master → claude/quizzical-brown-462555 (Operational Rituals + PLAN.md slim). PLAN.md taken from master, re-actualised Mode 2.5 status post-merge (commit `908412c`) | Claude Code |
| 2026-05-12 | feat: Mode 2.5 Phase A — gpt-5.4-mini → **gpt-5.5** + `OPENAI_REASONING_EFFORT=none` + `OPENAI_MAX_OUTPUT_TOKENS=8000` (was burning 2500 reasoning_tokens on `low`). System-prompt restructured into 10 blocks: **BEHAVIOR_CONTRACT** (rules 1-8, top-priority), **ACTIVE_INTENT** (dynamic from recent turns), **BIBLE_DOMAIN** (text canon vs image-only Library), model_id injection. `behavior_drift` activity_event LOG-ONLY emitter detects permission-asking phrases. Direct API test: 9.7s full markdown gen (was 52s 0 chars) | Claude Code + Director (Phase A) |
| 2026-05-11 | feat: Mode 2.5 Phase 1-B — 13 OpenAI function-calling tools (getStudioStatus, listSeries, listSeriesBibles, getEpisode, findEpisode, getNextGate, listPendingApprovals, createEpisode, triggerAgent, approveAsset, requestRevision, setBibleContent, …). **Verbal approval gate** Cyrillic-safe (token-based scan, was broken on `\b` regex), full-window scan over 4 director turns. **`setBibleContent` overwrite-DRAFT** (PUT instead of POST for non-LOCKED, Director: "не плодить новые драфты"). Voice continuous mic + 5.5s silence tolerance, panel push via CSS vars, `!fb`/`!todo`/`===PAON===` ambient capture + Monitor task, slash commands /pa-recent /pa-summary /pa-resume (PR #23) | Claude Code + Director |
| 2026-05-10 | docs: PLAN.md + CLAUDE.md update — §12 Operational Rituals added (4 rituals: PLAN update in-session, session-start sanity check, verify trio, session-end memo). Root cause of quality degradation: stale PLAN.md. (commit `5da90b0`) | Claude Code |
| 2026-05-10 | fix: pipeline DAG order — Music before Animatic, Final Cut row for EXEC-STITCH; Bug D STITCH pill in Episode Timeline; audio-reorg smoke plan. tsc clean + 166/166 tests. (commit `d1c820d`) | Claude Code |
| 2026-05-08 | **Phase A.2 MERGED (PR #22)** — VGEN auto-COMPLETE + EXEC-STITCH (local ffmpeg, Windows winget fallback) + Audio reorg (LT-04) + Bug A (drawer regen swap) + Bug C (Approve/Reject hide post-APPROVED). 5 STITCH iteration fixes (backslash→fwd slash, realpath, FS direct read, /staging/ resolve, ffmpeg path resolver). SS-S14-E01 final-cut.mp4 3.99 MB | Claude Code |
| 2026-05-08 | fix: regen rebuilds prompt with Bible canon + instant timeline refresh on approve (PR #18) | Claude Code |
| 2026-05-08 | feat(vgen): provider verification stamp + Bible character canon in prompt + audit (PR #17) | Claude Code |
| 2026-05-08 | feat: improved buildShotPromptV2 + theme color tokens for status palette (PR #16) | Claude Code |
| 2026-05-08 | fix(videomatic): playback bugs, regenerate UX, big numbers, color palette, Veo 3.1 labels (PR #15) | Claude Code |
| 2026-05-07 | feat(timeline): Generate-this-shot for missing VGEN cells + colored cell numbers (PR #14). Director smoke verified pipeline param sourcing — LT-14 logged | Claude Code |
| 2026-05-06 | feat: Veo 3.1 upgrade + EpisodeTimeline Phase A polish (PR #13). LT-01..LT-09 directives captured. Smoke tests propose-don't-auto-fire rule established (CLAUDE.md §10) | Director + Claude Code |
| 2026-05-06 | fix(timeline): VID-shot preview drawer regenerate + demote on APPROVED (PR #12); EpisodeTimeline Phase A unified review surface (PR #11) | Claude Code |
| 2026-05-06 | feat: Bible enrich CTA (PR #10); Universal Video Editor Surface + Veo 3 + Pilot Pass (PR #9) | Claude Code |
| 2026-05-02 | Backbone v2 — Bible Extension flow + real agents (Phases 5b–5e) | Claude Code |
| 2026-04-30 | 🎯 First real provider call gpt-image-1 + Drive adapter + Veo 3 adapter (BLOCKED on billing → unblocked same day). Phase 8 step 8 /settings/providers UI + Phase 5d step 3 preview drawer SHIPPED. Migrations 0013..0015. Full detail in `docs/PLAN-history.md` | Claude Code + Director |

---

*SandyStudio PLAN.md | v0.2 | Status: DRAFT*
*Updated in same session as code change per CLAUDE.md §12 Ritual 1*
*Director reviews sprint exit criteria before next sprint begins*
