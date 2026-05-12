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
Phase:    Phase A.2 COMPLETE (PR #22 merged 2026-05-08) + DAG visual fix (commit d1c820d 2026-05-10)
          ✅ VGEN auto-COMPLETE — episode flips to GENERATION_APPROVED when all VID-shots APPROVED
          ✅ EXEC-STITCH — local ffmpeg final-cut assembly (first real mp4 produced SS-S14-E01)
          ✅ Audio reorg (LT-04) — MGEN fires after REV-world_check, EDIT gates on EREF+music
          ✅ Bug D — STITCH status pill in Episode Timeline toolbar (Stitching / Ready / Failed)
          ✅ Pipeline DAG — Music before Animatic + new Final Cut row (was: Music after VGEN)

          ✅ Mode 2.5 Phase 1-A + 1-B + Phase A COMPLETE — claude/quizzical-brown-462555 (LT-01), PR #23 OPEN
             ✅ Phase 1-A: Prod Assistant rename + modular system-prompt builder + concierge_threads/turns (migration 0025 applied to remote) + TTS + voice continuous mic + panel push CSS vars
             ✅ Phase 1-B: 13 OpenAI function-calling tools (read + dispatch + setBibleContent overwrite-DRAFT) + verbal approval gate (Cyrillic-safe token-based, full-window scan) + cookie-forwarded auth
             ✅ Phase A: gpt-5.4-mini → gpt-5.5 swap + reasoning_effort=none + max_completion_tokens=8000 (direct API test 9.7s full content, was 52s+0 chars on reasoning_effort=low). BEHAVIOR_CONTRACT (rules 1-8, top-priority block), ACTIVE_INTENT dynamic block, BIBLE_DOMAIN block, behavior_drift activity_event LOG-ONLY emitter
             ⏳ Phase B Skill Editor / Learning Loop — design ready (~/.claude/plans/valiant-soaring-karp.md "Phase B"), implementation deferred until Director green-lights
             ⏳ Slash commands /pa-recent /pa-summary /pa-resume + Monitor task on pa-feedback.log

Next:     1. PR #23 → review → merge to master (merge with master DONE 2026-05-12 morning, no conflicts left)
          2. Director smoke #2 (Audio reorg on new episode) — plan at webapp/docs/smoke-tests/audio-reorg-smoke.md
          3. Phase 1.5 backlog — variants_per_generation (LT-07), vgen_defaults UI, buildShotPromptV2 (LT-14)
          4. UI cleanup LT-10..13 (scalable timeline 60+, episode page noise, foldable Activity Feed)

Mode:     ===5=== EDIT (Director active) — switches to ===1=== at session start per CLAUDE.md
Date:     2026-05-12
```

### Episodes in DB (production-grade)

| Episode | Status | Mode | What it proves |
|---------|--------|------|----------------|
| **SS-S01-E01** "The Red Carpet" | Mock chain published end-to-end | 4 (AUTOTEST) | Pipeline DAG works in mock — historical record |
| **SS-S14-E01** | 13/13 VID-shots APPROVED → final-cut.mp4 (~3.99 MB, 0:32.75) | 1 (MANUAL) | **First real production** — ffmpeg concat + music. $8.27 spent / $25 budget. Audio reorg pending re-validation on new episode |

### Migrations on remote Supabase

```
0001..0009  Phase 1-4 base schema
0010        series + approval_authority_matrix + app_config storage scope
0011..0012  relax assets.file_type CHECK + dashes in variants
0013..0020  content / drive_fields / series bible / activity_events extensions
0024        eref_one_approved_per_shot
🟡 0025     concierge_threads + concierge_turns (in claude/quizzical-brown-462555, NOT applied to cloud yet)
```

### Two-terminal local dev (canonical)

```bash
cd webapp && npm run dev          # Terminal 1 → http://localhost:3000
cd webapp && npm run inngest:dev  # Terminal 2 → http://localhost:8288 (dashboard)
```

⚠ **Don't** run `npm run build` while dev is active — corrupts `.next/` webpack cache → 500 on every API route. Recovery: kill servers, `rm -rf webapp/.next`, restart.

---

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
