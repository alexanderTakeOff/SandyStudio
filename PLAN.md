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
Phase:    **Sprint «Дизайнер и Аниматор» — KICKOFF 2026-05-18** (11 дней, EREF → VGEN canonical agentification)
Status:   ✅ **Sprint φ + 2026-05-16 hotfixes + gpt-image-2 — MERGED to master 2026-05-18** (squash commit `cc43944`)
            • Skills-as-capabilities refactor (lazy two-step API + 2 broad capability playbooks)
            • EREF chain bug fix (review-id → underlying STB resolution) + RejectModal directorConfirm
            • EREF pilot state mirror в episodes.metadata (closes UI gap FANOUT_RUNNING → FANOUT_COMPLETE)
            • gpt-image-1 → gpt-image-2 across openai-image / openai-image-edit / openai-edits-multi
            • Branch `claude/quizzical-brown-462555` tip 3993374; worktree disposition deferred
            • Verify: tsc clean · vitest 216/216 · replay-pilot 29/29

          ✅ **Stage A smoke 2026-05-18 (E21)** — 2 VGEN pilots APPROVED (Sandy SH01 establishing,
             SH02 action via Seedance fal-img2vid 4s). Budget $4.46 / $25. Director surfaced
             **3 architectural issues** during review:
             1. 🔴 EREF aspect ratio bug — refs generated 1:1 (1024×1024), Seedance crops to 16:9
                losing top/bottom. Critical for E22+ canonical episodes.
             2. 🟡 Camera movement слишком subtle — Seedance under-emits motion despite skill
                favoring «static + 5% push-in» default.
             3. 🟡 «no audio yet» в VGEN panel — animatic missing music_asset_id в metadata.

          ⏳ **Sprint «Дизайнер и Аниматор» — Director-approved 2026-05-18** — root-cause fix for
             issues 1+2 (issue 3 deferred to separate sprint). Architectural diagnosis:
             **VGEN + EREF — единственные стадии пайплайна без write-agent и без reviewer.**
             Все остальные стадии (Script→SREV, Storyboard→WCHK, Bible→BIBLE-LOCK) имеют
             Writer-agent + Reviewer-agent + Director gate. VGEN/EREF — template-функции,
             которые шаблонно склеивают строку и зовут провайдер. Closing this gap:

             **Two new agents + two critics:**
             • **Episode Reference Designer** (EXEC-EREF становится full agent) — decision space:
               provider per shot type (gpt-image-2 vs Flux), size per delivery_target (1536×1024
               YouTube vs 1024×1792 Shorts), variants count, pilot strategy, camera coverage.
               Output: `SPC-ref_plan-<shot_id>` asset.
             • **Designer's Critic** (EXEC-EPREV) — validates Plan: aspect=delivery_target,
               provider obosnovan, sub_area variation, Bible style canon present.
             • **Animator** (EXEC-VGEN становится full agent) — decision space: provider per
               shot role, quality tier per hero-marker, aspect per delivery_target, seed
               locking, end_image strategy. Output: `SPC-shot_plan-<shot_id>` asset.
             • **Animator's Critic** (EXEC-VPREV) — V01-V09 hard checks (7-slot structure,
               ≤1 primary action, NEGATIVE non-empty, CONTINUITY references EREF anchor,
               STYLE matches Bible canon, CAMERA aligns STB, SUBJECT matches characters,
               duration vs action complexity, no on-screen text).

             **Coms model (Director-confirmed):** Polina = единственный голос. Agents работают
             silent, публикуют structured Plan-asset + activity events. PA reads, summarizes,
             asks approval verbally. Per-agent dialog через PA-proxy (`askAgent` tool). NO
             отдельных team-chat threads на каждого агента.

             **UI:** zero new timeline rows. Diagnostic Plan inspector в existing Episode
             Asset Drawer (read-only). PA panel always-visible UX fix Day 1.

             **Brief extension:** `series.delivery_targets[]` + `episode.brief.delivery_targets[]`
             — для S14 default `['youtube_landscape']`. Designers/Animators читают список,
             решают какой aspect/размер генерить.

             **11-day breakdown:**
             - Day 1: Schema + migration 0031 + asset types + naming + delivery_targets +
                      glossary + skills tree + PA panel always-visible fix
             - Day 2-3: Episode Reference Designer agent + skill + 12+ unit tests
             - Day 4: Designer's Critic + 8-10 hard checks + REVISE auto-chain
             - Day 4.5: PA integration (3 tools + askAgent + diagnostic inspector)
             - Day 5: E22 EREF smoke + retro memo
             - Day 6-7: Animator agent + skill + 15+ unit tests (replaces buildShotPromptV2)
             - Day 8: Animator's Critic + V01-V09 + auto-chain
             - Day 8.5: PA integration for Animator (3 tools + diagnostic + regenerate route patch)
             - Day 9-10: E22 full episode smoke через PA + quantitative retro
             - Day 11: Final memo + technology.md §3.6 + skill v0.2 updates + buffer

             **Issue 3 (no audio yet)** — отдельный sprint после «Дизайнер и Аниматор».
             Root cause likely в animatic runner: musicAssetId не пишется в `animatic_v1.metadata`
             даже когда music asset APPROVED.

          ⏳ **PR γ status**: `webapp/docs/pa-gap-audit-e21.md` живёт от Sprint γ, остаётся
             как production-audit doc. Не блокирует Sprint «Дизайнер и Аниматор».

          Phase sequence (master mainline):
          • ~~**P0**~~ (Flux 422 + E20 archive) — COMPLETE 2026-05-14
          • ~~**α**~~ (Realtime + team-chat) — COMPLETE 2026-05-14
          • ~~**β**~~ (Seedance capability manifests) — COMPLETE 2026-05-14
          • ~~**γ**~~ (E21 production через PA) — COMPLETE 2026-05-18 (E21 Stage A: 22/22 EREF
                                                  generated, 2 VGEN pilots APPROVED)
          • ~~**φ**~~ (Skills-as-capabilities refactor) — COMPLETE 2026-05-18 (cc43944)
          • ✅ **Day 1 of 11 COMPLETE** — Sprint «Дизайнер и Аниматор» schema groundwork
          • **Day 2-3** — IN PROGRESS — Episode Reference Designer agent

✅ **Day 1 deliverables (2026-05-18):**
          • Migration **0032** `0032_designer_animator_sprint.sql` written — additive: adds
            `series.metadata jsonb` (mirrors episodes.metadata 0029, holds `delivery_targets[]`),
            widens `activity_events.event_type` whitelist with 6 new types
            (plan_proposed, plan_approved, plan_revised, plan_rejected, agent_question,
            agent_answered), reserves `agent_failed` (catch-up for 2026-05-12 SREV hotfix).
            Migration 0031 was already taken by `concierge_turns_publication_fix` (post-cc43944
            merge); bumped to 0032 to avoid collision.
          • Naming convention: no changes needed — `SPC` already whitelisted in 0002 assets
            CHECK + naming-validator hook covers `prompts/` directory.
          • Glossary extended with 6 new canonical terms: «Episode Reference Designer»,
            «Designer's Critic», «Animator», «Animator's Critic», «Plan-asset», «delivery_targets»,
            «askAgent (PA tool)». Also extended «Validator» entry to mention new EXEC-EPREV/EXEC-VPREV.
          • Skill stubs: `.claude/skills/eref-designer/SKILL.md` + `.claude/skills/animator/SKILL.md`
            written as `status: STUB / maturity: stub-day-1`. Populated Day 2-3 (Designer) and Day 6-7
            (Animator) when runners implement decision rules.
          • PreviewDrawer UX fix shipped: overlay now respects `--pa-pad-left/--pa-pad-right` CSS
            vars from ConciergePanel — PA panel stays visible on preview open, no more «уходит за blur».
            File: `webapp/components/preview/PreviewDrawer.tsx`. Browser smoke deferred to Day 5
            with E22 EREF run.
          • Verify trio: tsc clean · vitest **216/216** · replay-pilot **29/29**.

Next:     Day 2-3 — Episode Reference Designer agent implementation:
          1. `agents/exec/episode_reference_designer.md` — system prompt + decision contract
          2. `webapp/lib/agents/runners/episode-reference-designer.ts` — runner with full
             Bible / STB shot / Script scene / delivery_targets injection
          3. Populate `.claude/skills/eref-designer/SKILL.md` with decision rules:
             provider per shot type, size per delivery_target, variants count, pilot strategy,
             camera coverage, sub_area variation, negative-term baseline
          4. 12+ unit tests covering decision dimensions + Plan-asset JSON schema parse
          5. Integration point in `factory.ts` so EREF events route to the new agent
          6. Verify trio after milestone

Mode:     ===5=== EDIT MODE active · Mode 1 (MANUAL governance) · auto-sync OFF
Date:     2026-05-18
```

---

```
Phase:    **P0 + α + β SHIPPED 2026-05-14** — Flux 422 fix · E20 archived PARTIAL · Postgres trigger
          Realtime + team-chat unified thread · capability manifests + Seedance full
          controls + seedance-prompting skill. γ kickoff posted, awaiting Director brief in PA.
Status:   ✅ **P0(a) Flux 422 fix** — `flux-pro-ultra-fal.ts` now sends `image_size: { width, height }`
            object (fal.ai rejected the legacy `"1024x1024"` string with HTTP 422). Locked by 6
            new unit tests + dimension regression guard.

          ✅ **P0(b) E20 archive — full UI feature** (instead of CLI hack):
            • Migration `0029_episodes_archive.sql` — `ADD VALUE 'ARCHIVED'` в `episode_status` enum
              + `episodes.metadata jsonb` column + GIN index + whitelist `episode_archived` в
              activity_events constraint. **Applied via `supabase db push` 2026-05-14** (CLI was
              linked + authenticated; MCP `apply_migration` still denied).
            • `webapp/lib/supabase/types.gen.ts` regenerated — `metadata: Json` + ARCHIVED in
              enum union. Tactical casts dropped from archive/route.ts (one `as never` remains on
              the .update() args, mirrors approve/route.ts and animatic-timing/route.ts pattern).
            • NEW endpoint `POST /api/episodes/[id]/archive` — body `{state: 'PARTIAL'|'COMPLETE',
              reason}`. Side-effects in single request: compute completed_shots → write
              `metadata.archival` payload → flip status to ARCHIVED → CANCEL zombie jobs
              (QUEUED/RUNNING/RETRYING) → log `episode_archived` audit event. Idempotent (409 on
              re-archive).
            • UI: Episode page header — new **Archive…** button + state radio (PARTIAL/COMPLETE)
              + reason textarea + audit caption + warning-tinted ARCHIVED pill showing
              `state · completed/total`. Hides button once already ARCHIVED.
            • **E20 backfill** via service-role CLI script (`scripts/archive-e20-partial.ts`,
              same shape the endpoint writes). Preview server `/login` redirect blocked UI-route
              backfill, DB-side proof is stronger anyway:
                status=ARCHIVED · metadata.archival.{state:PARTIAL, 17/19, reason, final_cut_path}
                · 0 jobs still RUNNING/QUEUED/RETRYING (8 zombies cancelled) · audit event logged
                · verify script: `scripts/verify-e20-archive.ts`.

          ✅ **Auto-sync OFF** (Director directive 2026-05-14): `.claude/settings.json`
            PostToolUse block emptied. 14 prior auto-sync commits remain on
            `claude/quizzical-brown-462555` branch (no master merge per Director directive
            "не мержи в мастер. чанк большой сначала проверим в бранче").

          ✅ **Verify trio (Ritual 3)**: tsc clean · vitest **204/204** (+6 new flux tests) ·
             replay-pilot **29/29**.

          ✅ **β architecture decision (Director-approved 2026-05-14)** — Polina's full provider/
             model refactor draft logged as "6-12 month direction"; β ships Claude counter-proposal:
             capability manifests on existing `MultiVideoGenProvider`/`MultiImageGenProvider` +
             universal `<ProviderControlPanel capabilities= values= onChange= />` UI +
             `MultiVideoGenInput.provider_params` opaque pass-through + single
             `.claude/skills/seedance-prompting/` prompt skill. 1-2 days vs Polina's 1-2 weeks.
             Directly solves "Director can't set seed/resolution/duration/aspect_ratio in UI" pain.

          ✅ **α SHIPPED 2026-05-14** (commit `9ac1af9`) — migration 0030 trigger
            `activity_events_to_concierge` writes pipeline_event turns server-side
            (replaces silent client-side hook); `/api/team-chat/post` Bearer-auth endpoint
            (`TEAM_CHAT_TOKEN` env); new `useConciergeTurnsRealtime` hook;
            ConciergePanel renders `claude` + `pipeline` bubble variants; PA
            `TEAM_CHAT_FROM_CLAUDE` system-prompt block; α smoke 2 lanes ✓.

          ✅ **β SHIPPED 2026-05-14** (commit `1627fb4`) — `lib/api/provider-capabilities.ts`
            shared manifest · widened `MultiVideoGenInput/Capabilities` with
            seed/resolution/end-image/full aspect set · Seedance adapter forwards new
            params + resolution cost mult + duration [4,15] · regenerate-video endpoint
            accepts new body fields · `<ProviderControlPanel>` capability-aware UI ·
            VGENShotPanel uses it · `.claude/skills/seedance-prompting/SKILL.md` STUB v0.1.

          ⏳ **γ kickoff posted 2026-05-14** — `webapp/docs/pa-gap-audit-e21.md` live
            audit doc · team-chat kickoff turn `27bd17da` in PA thread `bdbdafcf-...` ·
            Director's brief is the next gate. Production budget cap ~$80.

          Phase sequence:
          • ~~**P0**~~ — COMPLETE (`0510adc`, `11a621c`)
          • ~~**α**~~ — COMPLETE (`9ac1af9`)
          • ~~**β**~~ — COMPLETE (`1627fb4`)
          • **γ** — IN PROGRESS — E21 production through PA chat (zero webapp clicks)
          • **δ** (~3-7 d) — Character Identity Model (migration 0031 + EREF + drawer)
          • **ε** (~1-2 w) — Skill Editor / Learning Loop (`valiant-soaring-karp.md`)

Next:     Director types brief into PA panel → PA fires `createEpisode` → I monitor
          team-chat thread, surface gaps into `webapp/docs/pa-gap-audit-e21.md`, post
          observations via `npx tsx scripts/team-chat-post.ts --file <msg>` as needed.
          Final γ smoke = first published SS-S14-E21 episode.

Mode:     ===5=== EDIT MODE active · Mode 1 (MANUAL governance) · auto-sync OFF
Date:     2026-05-14
```

---

```
Phase:    Phase 2 Video Provider — Seedance 2.0 integration COMPLETE 2026-05-13 19:30 UTC
Status:   ✅ fal.ai Seedance 2.0 wired as multi-provider via existing `MultiVideoGenProvider` abstraction.
            Director's "сделай выбор провайдера через дропдаун" closed end-to-end across UI + API + runner.
            • NEW: `lib/agents/providers/fal-seedance.ts` (REST queue, mirrors `veo-gemini.ts` shape)
            • NEW: `__tests__/lib/agents/providers/fal-seedance.test.ts` — 11 tests passing (slug resolution,
              env override, parent-truncated URL quirk, 429/FAILED surfacing, cost math, data-URL inline,
              duration clamp [4,15])
            • EXTEND: `video-gen-multi.ts` — register `seedanceFalProvider` + dispatch in `getMultiVideoProvider`
            • EXTEND: `lib/api/vgen-defaults.ts` — `VgenProviderId` widened to include `seedance-fal-img2vid`;
              `FALLBACK_DEFAULTS.provider_id` flipped to Seedance (Director directive — new default)
            • EXTEND: `lib/agents/provider-resolver.ts` — `seedance-fal[-img2vid]` → `FAL_KEY` env mapping
            • REFACTOR: `lib/agents/runner.ts` EXEC-VGEN — direct `generateVideoVeoGemini` → `getMultiVideoProvider(provider!.providerId).generate(...)`. Veo Standard img2vid force-8 quirk preserved as Veo-only branch.
            • REFACTOR: `app/api/assets/[id]/regenerate-video/route.ts` — body `provider` field; provider chain (body → asset meta → series default → fallback); capability-based duration clamp.
            • EXTEND: `app/api/episodes/[id]/vgen/generate-single-shot/route.ts` — body `provider` field forwarded into Inngest event.
            • EXTEND: `inngest/functions/exec-vgen.ts` — `VgenEventData.provider`, `syntheticResolvedProvider()` helper; per-event override beats `provider_assignments` global default in both pilot + single-shot handlers.
            • UI: `components/vgen/VGENShotPanel.tsx` — new Provider `<select>` (Seedance / Veo). Cost preview is provider-aware. POST body includes `provider`.
            • UI: `components/vgen/VGENShotSection.tsx` — `pickProvider()` normalizes legacy variants ('veo-3' ↔ 'veo-3-img2vid', etc.) when seeding panel.
            • UI: `components/timeline/EpisodeTimelineSection.tsx` — provider `<select>` left of Generate Fast/Standard buttons. Defaults to Seedance.
            • CATALOG: `lib/api/provider-catalog.ts` — Seedance entries added to `video` + `character_video` candidates (existing `/settings` ProviderSettings auto-picks up).
            • MIGRATION: `0028_widen_vgen_provider.sql` APPLIED — `provider_assignments.character_video.active_provider_id = 'seedance-fal-img2vid'` confirmed in DB.

            Verify trio: tsc clean · vitest **198/198** (was 187, +11 new) · replay-pilot **29/29**.
            Real probe: Seedance Fast 5s img2vid via existing CLI test script — $1.21, 103s wall clock, 2.5 MB mp4. Provider stack working through every layer.

            Out of scope (deferred):
            • Seedance-specific prompt builder + skill `seedance-prompting` — Director said "пока не подключай — обсудим" (separate next PR, structure researched in session `nervous-bose-8196fc`)
            • StageKebabMenu per-stage "Provider › […]" section — Phase 8 task
            • 1080p resolution selection — Phase 2.1
            • Longer Seedance durations (10-15s) — Phase 2.1, caps at 8s for animatic parity

Next:     Director smokes the integration via UI:
          1. Open any episode → timeline → pick a missing VID cell → confirm provider dropdown shows Seedance + Veo → click Generate · Fast → verify new VID-shot has metadata.provider_id='seedance-fal-img2vid'.
          2. Open VGENShotPanel for an existing shot → flip Provider to Veo Standard → Regenerate → verify metadata.provider_id='veo-3-img2vid'.
          3. (optional) /settings → Providers → swap default if desired.

Mode:     Mode 1 (MANUAL) — Director approves each gate.
Date:     2026-05-13
```

---

```
Phase:    Phase A.2 COMPLETE (PR #22 merged 2026-05-08) + DAG visual fix (commit d1c820d 2026-05-10)
          ✅ VGEN auto-COMPLETE — episode flips to GENERATION_APPROVED when all VID-shots APPROVED
          ✅ EXEC-STITCH — local ffmpeg final-cut assembly (first real mp4 produced SS-S14-E01)
          ✅ Audio reorg (LT-04) — MGEN fires after REV-world_check, EDIT gates on EREF+music
          ✅ Bug D — STITCH status pill in Episode Timeline toolbar (Stitching / Ready / Failed)
          ✅ Pipeline DAG — Music before Animatic + new Final Cut row (was: Music after VGEN)

          ✅ **PR #23 MERGED 2026-05-12 17:22 UTC (commit `8fa5c00`, --merge style)** — Mode 2.5 PA + Mode 3 readiness drill on master
             ✅ Phase 1-A: Prod Assistant rename + modular system-prompt builder (10 blocks) + concierge_threads/turns (migration 0025) + TTS + voice continuous mic + panel push CSS vars
             ✅ Phase 1-B: 16 PA tools (was 13 + getAsset + getRecentActivityEvents + regenerateBibleImage) + verbal approval gate position-aware (Cyrillic + later-token-wins + Director-turn-window) + cookie-forwarded auth
             ✅ Phase A: gpt-5.5 + reasoning_effort=none + BEHAVIOR_CONTRACT rules 1-8 + 1a (event awareness) + 1b (proactive driving) + AGENT_NAMES block
             ✅ Mode 3 drill — 14 chained bugs fixed: SREV max_tokens 12000, agent role names everywhere, requestRevision auto-chain, revisionNote propagation, Writer HARD CONTRACT prompt, SREV verdict routing + S09-S12 checks, gate accepts REVIEW status, runner findApprovedAsset accepts REVIEW, Library 10s polling, kebab DELETE
             ✅ Hooks shipped: 5 Operational-Ritual hooks (A staleness, B commit-guard, C verify-on-push, D session-memo, E parallel-worktree)
             ✅ Docs: CLAUDE.md slim 604→347, technology.md §3.5 (shot rhythm/gag density) + §7 (handoff protocol)
             ⏳ Phase D (Character Identity Model) — schema articulated by PA + Director (16:03), spec captured in observations. Migration 0026 + UI + backfill ~3-7 days. Awaiting Director green-light.

          ✅ **2026-05-13 evening — E20 partial close + VGEN/STITCH fix pack (10+ patches)**
             Pipeline закрыт partial **17/19 shots** — Veo quota exhausted на SC11. Animatic trimmed 19→17 (60s→54s) via `webapp/scripts/trim-e20-animatic-sc11.ts`. STITCH executed: first 32s (music truncated через `-shortest`), потом 96s (concat actual mp4 durations).

             FIXES:
             - `regenerate-video/route.ts` forwards `vgen_pilot` metadata — Approve "1/2" bug closed
             - `AssetPreview.tsx`: `<audio/video key={drive_path}>` — browser cache не держит старый stream после Replace
             - `AnimaticPlayer.tsx`: pills solid `var(--accent-success)` + glow + weight 700 + textShadow — Director "тускло-зелёные" closed
             - `buildShotPromptV2`: firstSentence truncate, drop role label / quoted title / Beat:/Mood:, add 16:9, endWithPeriod helper. Tests rewritten 23 passing
             - `runner.ts EXEC-VGEN`: `Math.round` все 3 ветки duration; `forced 8s для Standard + img2vid` (Veo 3.1 docs); console.info debug log
             - `veo-gemini.ts`: surface full Veo body в error message — bare 4xx больше не молчит
             - `ffmpeg-stitch.ts`: `-stream_loop -1` music — short music больше не truncate'ит video. Tests 10 passing
             - `EpisodeTimelineSection.tsx`: two-button **Generate · Fast / Standard** footer + passes `quality_tier` — обход Fast 429 quota через Standard bucket
             - `lib/supabase/client.ts` singleton + `useActivityRealtime.ts` channel dedupe — closes WebSocket leak that turned next-dev в 2-5GB zombie
             - Migration **0027 applied** — `activity_events_authenticated_select` SELECT policy for `authenticated`. Realtime push был silent из-за RLS блок на anon channel
             - `scripts/backfill-pa-ambient.ts` — persist 21+2 ambient system turns retroactively when Realtime missed events

             E20 final cut: 96s (concat actual VID-shot durations). q1 = trim per-shot к animatic shot_list timing (54s correct).
             OPEN BUG: Realtime push still 0 POSTs to /api/concierge/ambient — browser hook не fires. Workaround: backfill script. q2 = Postgres trigger.

             Verify final 17:28 UTC: tsc clean · vitest **185/185** · replay-pilot **29/29**.

          ✅ **2026-05-13 10:00 UTC — Realtime push для PA + EREF skip-if-approved + 19/19 coverage**
             Director directive: PA должна узнавать о pipeline events мгновенно, не pull-only. Phase 10A.0 item B shipped.
             Migration `0026_realtime_publish_activity_events.sql` (NEEDS MANUAL APPLY — `apply_migration` MCP denied permissions): `ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events` + `REPLICA IDENTITY FULL`.
             NEW backend: `lib/concierge/ambient-events.ts` (decision + filter + metadata extract), `app/api/concierge/ambient/route.ts` (POST endpoint, RLS guard, dedupe by activity_event_id).
             NEW frontend: `hooks/useActivityRealtime.ts` (Supabase Realtime subscription per thread), `ConciergePanel.tsx` invokes hook with current threadId.
             NEW prompt block `PIPELINE_EVENTS_SINCE_LAST_REPLY` в system-prompt-builder.ts — лифтит system role turns в LLM context, окно "since last assistant reply", cap 8 most recent.
             EREF runner: skip-if-already-approved (loop iterates only shots без APPROVED ref) — re-run idempotent + topup-only. E20 теперь **19/19 coverage** (16 ранее + 3 missing закрыты PA/Director через UI пока я работал на Realtime).
             Verify: tsc clean · vitest **182/182** (+9 new ambient-events tests) · replay-pilot 29/29.

          ✅ **2026-05-13 — Composer upload regression fix (sibling worktree, commit `2d72849` merged in)** — closes Director's report «зашёл в композер, вижу мок, нет кнопок»
             — NEW route `/api/assets/[id]/upload-music-direct` writes binary to AUD-music asset
             — `AssetPreview.tsx` renders `MGENActionsBlock` for AUD-music (not LOCKED):
               • 🎵 Upload track — file picker .mp3/.wav, 20MB, → upload-music-direct
               • ✨ Run generation — re-fires EXEC-MGEN, «mock» chip (Suno not wired)
             — Status stays REVIEW after upload (Director still approves explicitly)
             — Director smoke #2 (Audio reorg on new episode, `webapp/docs/smoke-tests/audio-reorg-smoke.md`) now unblocked

          ✅ **2026-05-12 19:25 UTC — EREF prompt builder fix + Spatial Coverage Manifest (q3a)**
             Director через PA (18:58) surfaced: EREF `image_prompt` шаблон игнорирует `camera_angle` / `camera_movement` / `camera_motivation` / location `sub_area` — все 19 shots коллапсируют на одну flat location plate, storyboard spatial intent теряется на gpt-image-1 шаге.
             Cancelled running fan-out `01KRERN7ZW5KT0T62QY3A1RAKS` (Director-approved q1). 8 refs остались (2 pilots APPROVED + 6 fanout REVIEW/REVISION/REJECTED) — q2c: Director review через UI первым делом.
             `lib/agents/runners/episode-references.ts` parser теперь читает camera_* + location.sub_area из storyboard JSON; prompt builder использует formatted spatial block; closing instruction: "Two shots in same location must show visibly different viewpoints, do NOT replicate flat plate".
             NEW `lib/api/eref-spatial-coverage.ts` — pure derivation `deriveSpatialCoverage(shots) → entries[]` с per-shot spatial_anchor + camera_direction (17 vocabulary mappings) + variation_note (per-location anchor reuse tracking). Phase 1 of Spatial Coverage Manifest layer (UI/persistence asset — follow-up).
             NEW `__tests__/lib/api/eref-spatial-coverage.test.ts` — 7 unit tests on anchor inference, variation tracking, vocabulary mapping.

          ✅ **2026-05-12 18:30 UTC — surgical patch STB E20 v02 + gate.ts MGEN unblock**
             STB v02 was production-usable but missing camera fields. One-off `webapp/scripts/patch-e20-stb-camera.ts` added `camera_movement` + `camera_motivation` to all 19 shots (acts→shots flatten). Includes 2 orbit experiments (SH06 `slow_orbit_around_subject`, SH10 `orbit_pullback`). Idempotent.
             Storyboarder skill updated (`agents/exec/storyboarder.md`): Default camera vocabulary section with 17 movement values + rules-of-thumb per shot_role; `camera_motivation` field added to shot schema; edge case "Style Bible camera vocab missing" now uses MVP defaults instead of stalling.
             PA approved STB v02 → WCHK COMPLETED 18:24 → EREF+MGEN fired in parallel 18:27.
             **MGEN failed `Upstream gate failed: Approved animatic (need 1, found 0)`** — leftover from pre-LT-04 audio reorg (Director directive 2026-05-08 q3b moved Composer BEFORE animatic). `lib/agents/gate.ts EXEC-MGEN` now requires APPROVED storyboard + APPROVED world_check (not animatic).
             Re-fired EREF + MGEN events: **MGEN COMPLETED ✅**, EREF RUNNING (~3-5min gpt-image-1 fan-out). Verify trio clean.

          ✅ **2026-05-12 evening hot-fix — SREV REVIEW-loader layer (Sprint 10 precursor)**
             SREV на v03 крашился мгновенно (4× function.failed, ~50ms каждый).
             Root: `runner.ts:87` `loadAgentInputs` фильтрует `.eq('status','APPROVED')` — 3-й слой того же бага что чинили днём (gate + runner findApprovedAsset уже принимали REVIEW).
             Fix: `loadAgentInputs.allowedStatuses?` параметр, `AgentFunctionSpec.inputAllowedStatuses?`, EXEC-SREV прокидывает `['APPROVED','REVIEW','REVISION']`.
             Bonus: `agent_failed` activity_event через try/catch + step.run('log-agent-failure') (idempotent на Inngest retries) — PA теперь видит причины падения через `getRecentActivityEvents`.
             Verify: tsc clean · vitest 166/166 · replay-pilot 29/29.

Next (after /clear in fresh session — Director directive 2026-05-13 evening, ~17:30 UTC):
          1. **q1 — STITCH per-shot trim** ✂️ (~30-45min)
             ffmpeg concat сейчас берёт full mp4 durations (96s output). Patch: переключить concat-list builder на per-file `outpoint <animatic.shot_list[i].duration_seconds>` directive → final cut respects storyboard timing → 54s correct.
             File: `webapp/lib/agents/providers/ffmpeg-stitch.ts` + unit tests + re-fire STITCH event.
          2. **q2 — Postgres trigger Realtime reliable** 🔔 (~30min)
             Browser hook silent: 0 POSTs на /api/concierge/ambient несмотря migration 0027. Replace fragile client subscription с server-side trigger: on `activity_events` INSERT → automatic insert into `concierge_turns` для active thread. Migration 0028.
             После — `useActivityRealtime.ts` можно simplify или удалить.
          3. **q3 — Team-chat (Director's directive)** 💬 (~50min)
             Минимальный unified channel: POST /api/team-chat/post endpoint → persist в PA thread с `role=system metadata.kind='claude_message'` + content `**Клод:** ...`. ConciergePanel рендерит distinct bubble. PA system prompt block lifts мои messages в её context (рядом с PIPELINE_EVENTS).
             Я постю через curl. Director сейчас пишет в его field в webapp → "Директор:". Я в том же thread → "Клод:". PA отвечает в том же — все три видят всё.
          4. E20 publish — approve current 96s OR wait q1 → re-stitch 54s
          5. Sprint 10 plan (Director-approved earlier — q1y q2a q4y):
             - 10A Reviewer Unification — 5-7 дней
             - 10B Phase D Character Identity Model — 3-7 дней
             - 10C Skill Editor / Learning Loop — 5-7 дней

Mode:     ===5=== EDIT MODE (Director активировал) → /clear для fresh session
Date:     2026-05-13
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
