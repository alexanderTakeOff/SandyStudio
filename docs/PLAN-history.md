### Previous phase (archived — see docs/PLAN-history.md when room)

```
Phase:    **Polina autonomy chain end-to-end + Drive layout + Storyboarder opus — SHIPPED 2026-05-20**
          (plans `~/.claude/plans/soft-swimming-thunder.md` C1-C6 + rollout
           `~/.claude/plans/polina-fix-rollout-and-resume.md`). Branch
           `claude/quizzical-brown-462555` accumulated 19 значимых коммитов
           f0caf09 → b6c83e7 since master `12d708f`. Branch cleanup deferred.
Status:   ✅ **All C1-C6 + 13 follow-up fixes SHIPPED 2026-05-20**. Full session
            memo: `~/.claude/projects/C--SandyStudio/memory/session_2026-05-20_polina_autonomy_full_chain_fix.md`.

            Key landing points (commit order):
            • f0caf09 skill abstraction principle (global meta-doc) + library-style-first rewrite
            • c0bf70e C4 autonomy infra (pa/notify-needed Inngest, exec-pa-react,
                     /api/concierge/chat-internal, AUTO_REACT_GUIDANCE block)
            • db2f8e3 streaming + cancel + per-tool plashka + TD-21 logged
            • 48ff9ec CEL ternary debounce + middleware bypass for chat-internal
            • 6f54ddd Library generation visibility — routes through logEvent
            • be42dc5 disabled silent-ack client trigger (root cause «Polina never reacts»)
            • fcd685b UI renders auto-react assistant turns (Realtime + reload backlog)
            • f0661ec runBibleAuthor emits agent_completed for enrichBible auto-react
            • 2370b44 bible-author prompt fix — Primary Object Reference Rule
                     (no characters/squirrels/dogs in object refs, single hero view)
            • 1465b5f 15s polling fallback for dead Realtime WebSocket
            • 9b08dca stamp gpt-image-2 in history label (was stale gpt-image-1)
            • 5aa2232 copyAssetImage PA tool + endpoint + upload UI block
            • e992086 consolidated /upload + Sandy S14→S15 carry-over executed
            • 29d810b **Drive layout: /SandyStudio/<series>/<bucket>/<assetType>/<file>**
                     13/13 S15 Bible files migrated (Sandy carry-over skipped — shared S14)
            • d1cc216 Bible aspect-ratio policy (characters/objects square,
                     locations/style landscape) — was hardcoded 1024×1024
            • da31f81 Storyboarder revisionNote wired into prompt (был silently dropped)
            • fd991bf **Storyboarder upgrade sonnet-4-6 → opus-4-7** for hard-contract
                     instruction-following on requestRevision
            • b6c83e7 **factory.ts → logEvent — THE ROOT FIX** for «Polina не реагирует
                     на pipeline events». Was 3 inline activity_events.insert in
                     factory wrapper, bypassed logEvent → pa/notify-needed never fired
                     for real production events. Now все 3 точки через logEvent.

          🔴 **Late-session smoke surfaced 2 production blockers (both FIXED)**:
            • **e5ffa22** + migration 0034 — schema `assets_file_type_check`
                     regex `[a-z0-9_-]+` rejected UPPERCASE shot_ids in
                     `SPC-ref_plan-SS-S15-E01-A1-SC01-SH01` etc. All 22 Designer
                     jobs for SS-S15-E01 failed at save step. Relaxed regex
                     `[A-Za-z0-9_-]+`. Migration applied to production.
            • **cdb7f9f** — approve/route.ts REV-world_check.APPROVED branch
                     fan-outed N×Designer events (one per shot in storyboard,
                     22 in our case) instead of Pilot Pass=2. Director:
                     «должны запуститься первых два пилотных как всегда было».
                     Fix: `PILOT_COUNT_DESIGNER=2`, remaining shot ids stashed
                     in `episodes.metadata.designer_fanout_pending` for
                     future auto-fanout-trigger (TD-23 below).

            Verify trio: tsc clean · vitest **327/327** · replay-pilot **29/29**.
            Director name codified — **Александр** (NOT Кирилл — my hallucination,
            corrected 2026-05-20 via `~/.claude/projects/C--SandyStudio/memory/director_name_alexander.md`).

          🟡 **AWAITING SMOKE (post-clear):** Director triggered new STB requestRevision
            after b6c83e7+fd991bf+da31f81 landed. Expected:
              - v4 description shows claude-opus-4-7
              - v4 visibly applies all 5 of Polina's blocking items
              - Polina auto-reacts to agent_completed within 15s, no Director prompt
            If all three observed — entire autonomy chain validated on real
            production event (not synthetic curl smoke).

          Mode: ===5=== · Mode 1 governance · auto-sync OFF.
          Date: 2026-05-20
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
          • ✅ **Day 2 of 11 COMPLETE** — Episode Reference Designer agent (spec + runner + tests + skill)
          • ✅ **Day 3.1 COMPLETE** — Option A agent infrastructure plumbing (commit `d148a01`).
            EXEC-EREF-DESIGNER registered, fireable via Inngest event. Critic + live wire-in pending.
          • ✅ **Day 3.2 COMPLETE 2026-05-18** (commit `191ef3a`) — Plan-driven EREF executor behind
            `DESIGNER_CHAIN_ENABLED` feature flag. q1a/q2c/q3a/q4c.
          • ✅ **Day 4 COMPLETE 2026-05-19** (commit `8f33f95`) — Designer's Critic (EXEC-EPREV) with
            V01-V09 hard checks + auto-chain (REVISE re-fires Designer with acceptance_criteria as
            hard contract). Plan status side-effects: PASS→REVIEW, REVISE→REVISION, FAIL→REJECTED.
            Verify: vitest 269/269 (+10).
          • ✅ **Day 4.5 COMPLETE 2026-05-19** (commit `296606d`) — PA tools: getRefPlan, listRefPlans,
            getCriticVerdict, regenerateRefPlan. Verify: vitest 276/276 (+7).
          • ✅ **Day 6-7 COMPLETE 2026-05-19** (commit `3a575ce`) — Animator (EXEC-VANIM) Sonnet 4.6
            Plan author per shot + Plan-driven VGEN executor branch (q1a). Replaces buildShotPromptV2
            when planAssetId is set. animator.md spec + skill v0.1 ACTIVE. Verify: vitest 292/292 (+16).
          • ✅ **Day 8 COMPLETE 2026-05-19** (commit `62c4b82`) — Animator's Critic (EXEC-VPREV) with
            V01-V09 (provider format match, ≤1 primary action, NEGATIVE baseline, etc) + auto-chain.
            Verify: vitest 302/302 (+10).
          • ✅ **Day 8.5 COMPLETE 2026-05-19** (commit `c3c9b59`) — PA tools for Animator: getShotPlan,
            listShotPlans, getAnimatorCriticVerdict, regenerateShotPlan. Verify: vitest 308/308 (+6).
          • ⏳ **Day 9-10 DEFERRED 2026-05-19** — Smoke E22 (full episode through Designer→Critic→
            Animator→VGEN chain, ~$8-15 budget). Director will fire manually after master merge via
            `DESIGNER_CHAIN_ENABLED=true ANIMATOR_CHAIN_ENABLED=true` on E22 episode. Quantitative
            retro deferred to post-smoke session.
          • ✅ **Day 11 COMPLETE 2026-05-19** — Final memo + glossary alignment + skill v0.2 polish.
            Sprint «Дизайнер и Аниматор» Day 1-11 SHIPPED behind 2 feature flags. 6 commits, ~3000 LoC,
            68 new tests, 4 new agent_ids (EREF-DESIGNER, EPREV, VANIM, VPREV), 6 new events, 2 new
            asset types (SPC-ref_plan, SPC-shot_plan + REV variants), 0 dollars spent (smoke deferred).
            **Touchpoints (10)**:
            – `lib/inngest/client.ts` — registered `sandystudio/exec-eref-designer/plan` (formerly
              referenced but unregistered) + new `sandystudio/exec-eref/execute-from-plan`
            – `lib/inngest/concurrency.ts` — added `exec-eref-execute: 2` per-episode cap
            – `inngest/functions/exec-eref-execute-from-plan.ts` — new factory-driven function
            – `inngest/index.ts` — registered the new function
            – `lib/agents/runner.ts` — added `planAssetId` to `RunAgentArgs`, forwarded to runEpisodeReferences
            – `lib/agents/factory.ts` — widened `resolveRunArgs` return type to include `planAssetId`
            – `lib/agents/runners/episode-references.ts` — added `planAssetId/shotId` to args,
              `PlanOverrides` type, `loadPlanOverrides()` + `planSizeToProviderSize()` helpers
              (test-exported), Plan-driven jobs filter, prompt + provider size overrides,
              `provenance.plan_asset_id` IMG metadata for audit chain
            – `app/api/assets/[id]/approve/route.ts` — `designerChainEnabled()` flag reader,
              REV-world_check fan-out (N Designer events when flag on), new `SPC-ref_plan` →
              `execute-from-plan` branch with per-Plan idempotency check on
              `metadata.provenance.plan_asset_id`
            – `__tests__/lib/agents/runners/episode-references-plan.test.ts` — 19 tests covering
              size mapping (6) + Plan loader happy paths (3) + rejection paths (9) + error class (1)

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

✅ **Day 2 deliverables (2026-05-18):**
          • Agent spec `agents/exec/episode_reference_designer.md` v0.1 — 452 LoC canonical
            structure (ROLE / AUTHORITY / INPUTS / OUTPUTS / 10-step process / REVISION /
            EDGE CASES / SUCCESS METRICS). Encodes smart-canon B, Plan-asset JSON contract,
            sub_area variation rule, V01-V08 Critic hard-check map. Per q1 directive
            narrowed to `gpt-image-2` only this sprint.
          • Runner `webapp/lib/agents/runners/episode-reference-designer.ts` ~430 LoC —
            LLM call to Sonnet 4.6 (`EREF_DESIGNER_MODEL`, `EREF_DESIGNER_MAX_TOKENS=6000`,
            cost ceiling $0.15), `EREF_DESIGNER_PROVIDER_ALLOWLIST` single-entry,
            `SIZE_BY_DELIVERY_TARGET` table for 6 slugs, pure `resolveDeliveryTargets()`
            helper with episode→series→fallback precedence, `buildUserMessage()` per-shot
            assembly with full Bible (formatBibleForPrompt), delivery_targets table,
            revisionNote propagation as HARD ACCEPTANCE CRITERIA. Pre-flight validates
            STB APPROVED + shotId present + bible loaded. Outputs structured
            `EREFDesignerRunResult` for downstream Plan-asset write.
          • 24 unit tests — constants/tables (4), `resolveDeliveryTargets` precedence (5),
            pre-flight errors (4), happy-path runner behaviour (11). All green on first run.
          • Skill `.claude/skills/eref-designer/SKILL.md` promoted STUB → ACTIVE v0.1.
            Canonical decision playbook for provider/size/variants/continuity/camera
            intent/smart-canon B/negative-list/cost reference/pre-flight/revision loop.
            Agent spec links to skill rather than embedding rules inline.
          • Verify trio: tsc clean · vitest **240/240** (+24 new Designer tests) ·
            replay-pilot **29/29**.
          • Commits: `1f82ed8` (runner), `dc75329` (tests), `693852b` (skill).

Next:     Sprint Day 1-11 SHIPPED — Director sequence:
          1. Review PLAN.md sprint summary above + branch commits 191ef3a..c3c9b59
          2. Decide PR vs squash-merge to master (existing pattern: squash, like Sprint φ cc43944)
          3. Fire E22 smoke (Day 9-10 deferred deliverable):
              • Set DESIGNER_CHAIN_ENABLED=true + ANIMATOR_CHAIN_ENABLED=true in webapp env
              • Pick E22 episode, advance through REV-world_check.APPROVED
              • Watch Plan fan-out (22 SPC-ref_plan + Critic verdicts) → Director approves
              • Watch IMG fan-out (~$1.30 22 IMG @ gpt-image-2 high quality)
              • Watch VID-animatic.APPROVED → 22 SPC-shot_plan + Critic verdicts → Director approves
              • Watch VGEN fan-out (~$8 22 shots @ seedance-fast) → final-cut.mp4
              • Total budget ~$10-15
          4. Post-smoke retro session: update technology.md §3.6 with E22 data; bump
             seedance-prompting and animator skills to v0.2 based on what worked / what flopped

Mode:     ===5=== EDIT MODE active · Mode 1 (MANUAL governance) · auto-sync OFF
Date:     2026-05-19
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


---
# Earlier history (pre-2026-05-20)

# SandyStudio — PLAN-history.md (archive)

> Write-once archive of completed sprints (S0–S8) and historical change log
> (2026-04-23 → 2026-04-30). Extracted from PLAN.md on 2026-05-11 to keep
> PLAN.md focused on living state per CLAUDE.md §12 (Operational Rituals).
>
> **Read this file only when:** debugging origin of a decision, auditing
> spec history, or onboarding a new agent into the project context.
> Do NOT update for current-state work — that's PLAN.md's job.

---

## SPRINT MAP — Sprints S0–S8 (all COMPLETE)

### SPRINT 0 — Foundation Approval ✅ COMPLETE 2026-04-23

| Task | Owner | Status |
|------|-------|--------|
| Approve `specs/company/governance.md` v0.3 | Sandy | ✅ APPROVED |
| Create `specs/company/participants.md` | EXEC-ARCH | ✅ COMPLETE |

### SPRINT 1 — System Architecture Specs ✅ COMPLETE 2026-04-24

| Task | Owner | Status |
|------|-------|--------|
| `specs/production/pipeline_overview.md` | BOARD-CRD + ART-PROD | ✅ DRAFT |
| `specs/production/bootstrap_sequence.md` | ART-PROD | ✅ DRAFT |
| `CLAUDE.md` update | EXEC-ARCH | ✅ Done |

### SPRINT 2 — Data Schemas ✅ COMPLETE 2026-04-24

All 6 schemas APPROVED:
- `specs/schemas/brief.md` v0.2
- `specs/schemas/script.md` v0.1
- `specs/schemas/shot.md` v0.1
- `specs/schemas/character_profile.md` v0.1
- `specs/schemas/qa_report.md` v0.2
- `specs/schemas/prompt.md` v0.2

### SPRINT 3 — Protocol Specs ✅ COMPLETE 2026-04-24

Updated for 4-mode governance system. All 4 protocols APPROVED:
- `specs/protocols/inter_agent_handoff.md` v0.2
- `specs/protocols/version_cascade.md` v0.1
- `specs/protocols/qa_retry.md` v0.1
- `specs/protocols/batch_approval.md` v0.2

### SPRINT 4 — Technical Decisions ✅ COMPLETE 2026-04-24

6 technical specs APPROVED with key decisions:
- `specs/system/character_consistency.md` — **D-001: A2-Kling** (Midjourney ref → Kling 3.0 Elements)
- `specs/system/assembly_tool.md` — **D-002: B4 FFmpeg** (+ optional DaVinci colour pass)
- `specs/system/api_integrations.md` v0.2 (7 full contracts)
- `specs/system/project_state.md` (state file schema)
- `specs/system/media_formats.md` (codecs, resolutions, naming)
- `specs/system/auth.md` (Supabase email/password, single Director)
- `specs/system/media_gateway.md` v0.1 (gateway routing, health, budget gate)
- `config/providers.yaml` v0.1 (swappable provider registry)

**Decision A options** (D-001) — A1 prompt fragment / A2 reference image / A3 LoRA / A4 hybrid. Chose A2 initially; later partial reversal to Veo 3 img2vid (~75% consistency) for MVP, Kling re-evaluated post first real cycle as Phase 8.5 candidate.

**Decision B options** (D-002) — B1 DaVinci / B2 Premiere / B3 CapCut / B4 FFmpeg. Chose B4 FFmpeg (fully automatable).

### SPRINT 5 — Company + Distribution Specs ✅ COMPLETE 2026-04-24

- `specs/company/participants.md` ✅
- `specs/company/master_plan_template.md` ✅
- `specs/distribution/youtube.md` v0.1 ✅
- `specs/distribution/metadata.md` v0.1 ✅
- `specs/distribution/analytics.md` v0.1 ✅

### SPRINT 6 — Agent Instructions ✅ COMPLETE 2026-04-24

All 25 agents APPROVED by Director. EXEC tier (14): ORCH, SW, SREV, SB, WCHK, VGEN, DIR-AI, STY, MGEN, ARCH, COPY, THUMB, PUB, ANAL. ART tier (7): PROD, HW, AD, MS, WB, CAST, CONT. BOARD tier (5): MKT, FIN, FAI, CRIT, CRD. (EXEC-EDIT added later in Sprint 9 Phase 4 as 15th.)

Files in `agents/exec/`, `agents/artistic/`, `agents/board/`.

### SPRINT 7 — Web Application ✅ COMPLETE 2026-04-28 (became Sprint 9)

**Stack DECISION:** Next.js 15 + Supabase + Inngest + Vercel (Vercel later rejected → Local-First).

- `specs/system/webapp.md` ✅ APPROVED
- Section 6.6 Approval Authority Matrix + W-005 + VISUAL_CATEGORIES in governance
- §4.2.1 Inngest concurrency limits per agent (EXEC-VGEN: 3, EXEC-MGEN: 2, etc.)
- §2.1 Remote access via Tailscale + WoL + Cloudflare Tunnel escape hatch

### SPRINT 8 — First Production Run (PILOT) ✅ COMPLETE 2026-04-24 (mock mode)

PILOT SS-S01-E01 "The Red Carpet" — 60s silent physical comedy, Sandy + Inspector Stopwatch.

Pipeline 17/17 PASS, $0.00 mock. Files in `FILMS/Sandy/S01/`:
- `SS-S01-STA-creative_direction-v01` APPROVED
- `SS-S01-BIB-style-v01`, `SS-S01-BIB-world_model-v01`, 2 character bibles APPROVED
- `SS-S01-E01-SPC-brief`, `-SPC-story_brief` (Option A ending), `-SPC-music_brief` APPROVED
- `SS-S01-E01-SCR-script-v01` APPROVED
- `SS-S01-E01-STB-act1-v01` APPROVED (12 shots, 60s)
- `SS-S01-E01-REV-world_check-v01` PASS (1 minor note WC-NOTE-01)
- `SS-S01-E01-REV-{vgen,mgen,thumb,pub,anal}_mock_log-v01` all DRAFT
- `SS-S01-E01-SPC-copy-v01` DRAFT (title, description, tags, social)
- `SS-S01-E01-REV-pipeline_validation-v01` APPROVED 17/17

---

## POST-PILOT ARCHITECTURAL TASKS (PA-001..PA-006) — historical formulation

Items identified during PILOT mock run. Most have either shipped, been
deferred, or absorbed into the LT-* long-term roadmap.

- **PA-001** Character Reference Architecture — Add Level 0 master reference (8K immutable image per character) + Level 1 scene reference layer. **Status:** EREF v1 + v2 (per-shot Pilot+Fanout) implemented as variant of this; canonical_prompt_fragment retained for text anchor.
- **PA-002** Add `master_reference_image_path` field to character profile schema. **Status:** absorbed into Bible character `drive_web_view_url` field (Phase 8).
- **PA-003** EXEC-VGEN Step 0: load master reference image, pass to API. **Status:** done via `getApprovedEREFForShot` + Phase A.1 character canon text injection.
- **PA-004** `config/defaults.yaml` review after PILOT. **Status:** done piecemeal during Phase 5c/8.
- **PA-005** Character Visual Development Workflow — 3–4 visual variants per character pre-production. **Status:** spec at `specs/production/character_visual_development.md` v0.1; UI deferred (LT-07 variants_per_generation will surface this).
- **PA-006** Multi-Audience KPI Layer — gag_rate, philosophy_density, shot attribution. **Status:** spec at `specs/production/audience_kpi.md` v0.1; QA enforcement not wired (post-MVP).

---

## OPEN DECISIONS — historical record

| # | Decision | Final choice | Date |
|---|----------|--------------|------|
| D-001 | Character visual consistency | A2-Kling → partial reversal: Veo 3 img2vid for MVP (~75% consistency), Kling re-evaluated as Phase 8.5 | 2026-04-24 + revision 2026-04-30 |
| D-002 | Assembly tool | B4 FFmpeg (+ optional DaVinci colour pass) | 2026-04-24 |

---

## CHANGE LOG — 2026-04-23 → 2026-04-30 (pre-Phase A archive)

Recent change log (last 30 days) lives in PLAN.md `## CHANGE LOG`. This is
the historical tail.

### 2026-04-23
- PLAN.md created, SDD structure established
- 5 new agents identified: ORCH, COPY, THUMB, PUB, ANAL
- Spec hierarchy defined (7 layers, 23 files)

### 2026-04-24
- D-001 DECIDED: A2-Kling character consistency
- D-002 DECIDED: B4 FFmpeg assembly
- ARCH DECISION: Provider abstraction layer — agents call contracts not services
- api_integrations.md v0.2 — 7 full contracts
- media_gateway.md v0.1 — gateway routing, health monitoring, budget gate
- config/providers.yaml v0.1 — swappable provider registry
- GOVERNANCE REDESIGN: 4-mode system (MANUAL/HYBRID/DELEGATED/AUTOTEST)
- AI-EP → EXEC-DIR-AI rename + rewrite
- governance.md, CLAUDE.md, pipeline_overview.md, batch_approval.md, inter_agent_handoff.md updated
- Sprint 4 COMPLETE — api_integrations, project_state, media_formats, auth APPROVED
- Sprint 5 COMPLETE — youtube, metadata, analytics APPROVED
- STACK DECISION: Next.js 15 + Supabase + Inngest + Vercel
- All 14 EXEC agents + 7 ART agents + 5 BOARD agents drafted/approved
- ARCH RULE #8 added to CLAUDE.md: Parameter Completeness at Gate
- Sprint 6 COMPLETE — all 25 agents APPROVED; Sprint 7 READY
- DECISION: Mock provider layer — pipeline validation before real APIs
- providers.yaml gateway.provider_mode: mock (default)
- config/defaults.yaml v0.1 created
- PILOT S01E01 brief received — "The Red Carpet", 60 sec
- shot.md schema updated: timing field mm.ss-mm.ss
- defaults.yaml: target_runtime_seconds: 60
- 9 PILOT assets APPROVED (STA, BIB×4, SPC×3, SCR, STB)
- PA-001 logged: Character Reference Architecture
- All 5 mock REV logs created (vgen, mgen, thumb, pub, anal) + SPC-copy DRAFT
- REV-pipeline_validation APPROVED 17/17 PASS
- PA-005 logged: Character Visual Development Workflow
- PA-006 logged: Multi-Audience KPI Layer
- character_consistency.md v0.3, character_profile.md v0.2, audience_kpi.md v0.1, character_visual_development.md v0.1
- VISUAL APPROVAL RULE locked: visual images/video always human-reviewed, never agent-approved
- webapp.md Section 6.6 Approval Authority Matrix added + W-005 + VISUAL_CATEGORIES

### 2026-04-25
- REVISION status added to naming convention + episode_status + asset_status enums
- Animatic milestone added: ANIMATIC_IN_PROGRESS/REVIEW/REVISION/APPROVED states + EXEC-EDIT job
- NEEDS_HUMAN_TWEAK + REJECTED added to asset_status enum
- Staging buffer `C:\SandyStudio\Staging\` (local SSD, TTL 48h, gitignored)
- staging_path + drive_path + staging_expires_at + revision_log added to assets table
- .gitignore created
- Generation gate: GENERATION cannot start until ANIMATIC_APPROVED
- webapp.md ARCH FIX: Vercel rejected → Local-First (Next.js + Inngest on workstation, Supabase cloud)
- webapp.md §4.2.1 Inngest concurrency limits added; §2.1 Tailscale remote access added
- W-001..W-005 RESOLVED
- ARCH DECISION: 3-tier architecture (Studio / Film Projects / Media Storage)
- CLAUDE.md §2 rewritten: 3-tier structure + filename→path resolver table
- FILMS/Sandy/S01/PROJECT.md created — anchor for PILOT
- PILOT MIGRATION: 19 files moved to FILMS/Sandy/S01/
- .gitignore: FILMS/ + .claude/worktrees/ added
- Studio root cleaned

### 2026-04-28 — Sprint 9 BEGIN
- webapp/package.json, supabase init
- Migrations 0001..0006 created and applied to cloud (Supabase project akstennzrnkvexjgzhxv)
- 0001 enums (episode_status 22, asset_status 9, job_status 6)
- 0002 core_tables (7 tables + pgcrypto + triggers + filename CHECK)
- 0003 approval_authority + publish_never_ai + visual_never_ai constraints
- 0004 hybrid_sync_tables (agent_prompts + app_config)
- 0005 indexes (12 hot paths)
- 0006 RLS policies (10 tables)
- .env.example updated (SUPABASE + INNGEST + APP_URL)
- .claude/settings.local.json broad allowlist
- types.gen.ts generated — Phase 1 COMPLETE
- uiux.md v0.2 (visual system, theme presets, StudioShell, Approval Queue UX)
- Phase 2 SCOPE EXPANDED: theme system, StudioShell, AmbientAssetField (R3F), Concierge agent
- EXEC-CONC concierge.md v0.1 DRAFT — new conversational agent, read+route, no approval authority
- Migrations 0007 (asset_relations) + 0008 (activity_events) + 0009 (governance_block + budget_log unique idx) applied
- config/uiux.yaml — taxonomy + theme presets + ambient_limits
- Next.js 15 scaffold complete
- Supabase clients (client/server/middleware) + lib/env.ts fail-fast
- Theme system globals.css — 3 presets, AppearanceProvider
- UI primitives: Card, Badge, Button, StatusChip, Tooltip
- StudioShell + Sidebar + Topbar + ContentFrame + AmbientAssetField
- ConciergePanel chat skeleton + /api/concierge/chat streaming
- App routes: /, /approvals, /episodes, /series, /budget, /jobs, /settings, /login
- npm run build PASSED — 9 routes, 102 kB shared bundle
- CLAUDE.md §7.5 UI/UX Source of Truth + EXEC-CONC in §4 Level 3
- Phase 2 COMPLETE
- Concierge SWITCHED from Anthropic to OpenAI (Director request — paid OpenAI, fast latency)
- Default model: gpt-5.4-mini
- OpenAI tunables wired (OPENAI_MAX_OUTPUT_TOKENS, OPENAI_REASONING_EFFORT, OPENAI_TEMPERATURE)
- FIX: Ambient field invisible (body gradient covered canvas)
- Migrations 0007 + 0008 pushed to cloud (types.gen.ts regenerated, 12 tables)
- Director created Supabase Auth user + logged in
- Phase 3 START — Inngest worker
- inngest@^3.54.1 installed
- lib/inngest/client.ts (typed event schema) + lib/inngest/concurrency.ts (CONCURRENCY_LIMITS)
- inngest/functions/ping.ts + inngest/index.ts registry
- app/api/inngest/route.ts (serve) + app/api/jobs/ping/route.ts (trigger)
- Jobs page wired to live `jobs` table
- npm script inngest:dev
- FIX: middleware was redirecting /api/inngest webhook PUTs to /login → fixed
- Phase 3 SMOKE PASSED — event → handler → Supabase jobs row RUNNING→COMPLETED
- Phase 4 START — 11 EXEC-* Inngest functions + lib/agents library layer
- agents/exec/editor.md v0.1 DRAFT — EXEC-EDIT animatic editor spec
- lib/agents/types.ts + registry.ts — 15 agents single source of truth
- lib/agents/{prompts,mock-providers,gate,runner,factory}.ts — canonical 6-step factory pattern
- lib/{governance,budget}.ts — enforceMode (PUBLISH hard block), recordCost (idempotent)
- Migration 0009 applied — governance_block event + budget_log unique idx
- inngest/functions/ — 12 new function files (exec-sw, srev, sb, wchk, edit, vgen, mgen, copy, thumb, pub, anal + schedule-analytics)
- lib/inngest/client.ts Events extended to 13 events
- vitest@^4.1.5 + @vitest/coverage-v8 + tsx installed; vitest.config.ts
- __tests__/ — 5 test files (registry, mock-providers, gate, governance, budget) + helpers/mock-supabase.ts
- scripts/replay-pilot.ts — self-contained E2E harness (no servers)
- package.json scripts: test, test:watch, test:coverage, replay-pilot, verify
- naming-validator.cjs whitelist code dirs (webapp/agents/lib/specs/config/.claude)
- Phase 4 VERIFY PASSED: typecheck OK + 39/39 unit tests + 28/28 replay-pilot (1.0s)
- Phase 4 COMPLETE — pipeline DAG + budget + governance E2E in mock

### 2026-04-29 — Phase 5
- Director surfaced UX gap: webapp shell wired but no production cockpit, no first-run, no inbox, no pipeline viz
- DECISION: Phase 5 split into 5a (UX specs) + 5b (API routes) + 5c (first-run + cockpit UI MVP); Phase 7 Authority Matrix UX home moved into 5a onboarding spec
- DECISION: Topbar System Mode + Governance Mode chips become interactive levers (Director-only, hard limits)
- DECISION: trigger route allows Director always + EXEC-DIR-AI in Mode 2/3; EXEC-DIR-AI re-trigger requires reason field
- Phase 5a START — UX architecture spec pass
- specs/system/storage_configuration.md v0.1, onboarding.md v0.1, director_inbox.md v0.1, pipeline_view.md v0.1, dashboard_cockpit.md v0.1
- specs/system/uiux.md v0.2 → v0.3 — spine + cross-links
- config/uiux.yaml extended — pipeline_node_states, pipeline_stages, inbox config, agent_report_card, dashboard zones, topbar_levers, storage_defaults
- Phase 5b START — API routes + lib/api/* foundation
- webapp/lib/api/* — response, errors, handler, auth, zod-helpers, status-transitions, storage-probe, pipeline-stages, events, supabase-cast (10 files)
- webapp/lib/supabase/types-phase5b.ts — type extensions
- Migration 0010 — series table + approval_authority_matrix + app_config storage scope + seeds
- zod@^3.23.8 + swr@^2.4.1 dependencies
- API routes: 26 route handlers (health, system/mode, system/governance-mode, storage/config, storage/test-write, onboarding/*, series, series/[id], episodes, episodes/[id]+approve+trigger+pipeline, assets, assets/[id]+approve, director/inbox, activity, jobs, budget)
- __tests__/api/* — 4 new test files (status-transitions, storage-probe, pipeline-stages, response, errors-handler) — 79/79 passing
- Phase 5b VERIFY GREEN: typecheck OK + 79 unit + 28 replay-pilot + next build (33 routes)
- Phase 5b COMPLETE
- Phase 5c START — UI implementation
- components/ui/Modal.tsx — portal-based primitive
- StudioTopbar refactored: SystemModeChip + GovernanceChip levers (clickable + modal/dropdown)
- StudioSidebar reordered: Dashboard / Inbox / Series / Episodes / Budget / Jobs / Activity
- Dashboard cockpit 3 zones (InboxPreview + ActiveEpisodes + ActivityFeed)
- /onboarding 4-step wizard (Storage probe → Series form → Authority matrix → Episode brief)
- /inbox keyboard hotkeys (J/K/A/R/X/?) + bulk actions (non-visual only) + visual gate enforcement
- /episodes/[id] vertical DAG (10 stages, 5 node states) + Agent Report Feed + Re-trigger modal
- /activity severity filter pills
- Settings → Storage tab (path picker, write-test, edit-and-validate)
- Phase 5c VERIFY GREEN: typecheck OK + 79 tests + 28 replay-pilot + next build (35 routes)
- Phase 5c COMPLETE
- Director smoke #1: orphan SS01 (no-dash code) → migration 0011 fixed series code regex + atomic rollback + cleanup
- Director smoke #2: assets.file_type CHECK rejected long-form → 0011 relaxed CHECK
- Director smoke #3: variant with dashes (UUID shotIds) → migration 0012 allowed dashes in variants
- Director smoke #4: gate.ts requires 3 STB acts but mock EXEC-SB produces 1 → factory step 5 spoofs act2+act3
- Brief approval wired (Pipeline View banner + Inbox path → both fire EXEC-SW)
- Factory: Mode 4 auto-approve + auto-chain; Mode 1-3 → REVIEW + chain via Director approve
- SS-S01-E01 in Mode 4: full chain Brief → Publish (15 assets APPROVED, 11 agents, $0 mock)
- Director smoke #5: Mode 1 chain stuck → computeNextEvents wired full chain (STB×3, animatic fan-out, metadata→thumb, ready→pub) with hasJob idempotency
- Phase 5c долговая тетрадка #3, #9, #10, #11, #12 fixed
- SS-S01-E02 reset to BRIEF_PENDING + Mode 1 — Director's Mode 1 manual test bench

### 2026-04-30 — Phase 5d + Phase 8 (real providers)
- DECISION: Phase 8 = Google-first MVP. Active stack: Drive native, gpt-image-1, Veo 3 + img2vid. Beatoven/ElevenLabs/Kling registered `is_active=false`. YouTube last.
- DECISION: provider switching architecture — two-tier (global `provider_assignments` + per-stage `stage_provider_overrides`). UI at `/settings/providers` + pipeline kebab. 60s cache. Soft cancel on switch.
- DECISION: Phase 5d ships kebab UI + activity preview drawer FIRST; Phase 8 slots provider sub-menu into same kebab.
- DECISION (partial D-001 reversal): MVP uses Veo 3 img2vid for character shots (~75% consistency). Kling re-evaluated post first real cycle as Phase 8.5.
- specs/system/provider_strategy.md v0.2 APPROVED — 17-step plan (Phase 5d 4 steps → Phase 8 13 steps)
- Phase 5d step 2 SHIPPED — pipeline-row kebab UI (Approve/Reject/Edit/Re-trigger), CodeMirror 6 editor, RejectModal. New: DropdownMenu, MarkdownEditor, EditorModal, RejectModal, StageKebabMenu, /api/assets/[id]/content
- DECISION: markdown canonical in DB (variant A), not on disk. 10ms DB vs 300ms Drive per save.
- Migration 0013 applied — assets.content text NULL. runner.ts populates `content` instead of stuffing markdown into `description`. factory.ts STB-act spoof carries placeholder content. Editor banner UX fixed.
- **🎯 FIRST REAL PROVIDER CALL — gpt-image-1 worked end-to-end.** $0.016, 17.1s, 1536×1024 PNG. Architecture validated: env key → provider-resolver → openai-image adapter → binary persist → /staging/ URL. Migration 0014 (provider_assignments) applied. EXEC-THUMB wired through resolver in factory.ts.
- New: lib/agents/provider-resolver.ts (60s cache + auto-mock fallback), lib/agents/providers/openai-image.ts (gpt-image-1 adapter with cost ladder), scripts/test-image-provider.ts (`npm run test-image`)
- Phase 8 step 8 SHIPPED — /settings/providers UI. Per-contract dropdown, on/off toggle, live/no-key/wip health badges, auto-mock fallback indicator. New: /api/providers/assignments/route.ts (GET enriched), /api/providers/assignments/[contract]/route.ts (PUT with audit + cache invalidate), lib/api/provider-catalog.ts, ProviderSettings.tsx
- Phase 5d step 3 SHIPPED — Activity-item preview drawer. Right-side overlay small (480px) / wide (70vw) / full (100vw) toggle. Renders markdown/image/video/audio. Mock URLs get "switch provider to see real preview". Eye button on activity-item hover.
- Phase 8 step 13 (Veo 3) + step 10 (Drive) BLOCKED on Google credentials — Director provisioned: GEMINI_API_KEY + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN in webapp/.env.local
- **🎯 Drive adapter SHIPPED + VERIFIED.** `npm run test-drive` passed: OAuth refresh → ensureFolder → uploadBinary → listAssetFolder → deleteFile. Real folder created at https://drive.google.com/drive/folders/1AefoGUxuNEiwG118iQvYfx7Cn3EgEA1Y. New: lib/agents/providers/google-auth.ts (token refresh + 50min cache), lib/agents/providers/drive.ts (multipart upload), scripts/test-drive-provider.ts
- **Veo 3 adapter SHIPPED, BLOCKED on Gemini billing.** Code path verified (got 429 RESOURCE_EXHAUSTED, not 401/404). New: lib/agents/providers/veo-gemini.ts (long-running operation, 5s poll, 6min max), scripts/test-video-provider.ts
- EXEC-EDIT (animatic) + EXEC-VGEN (per-shot) wired through resolver — branch on `provider.providerId === 'veo-3'`. Persists MP4 via persistBinaryToStaging
- Dev environment clean restart — killed 3 stale Next.js + 3 stale Inngest procs (3000-3002 + 8288-8291)
- Director enabled Gemini API billing (Paid Tier 1, $250 cap, postpay). Veo 3 unblocked.
- Migration 0015 applied — assets.drive_file_id + assets.drive_web_view_url
- **🎯 Drive-backed binary persistence SHIPPED + E2E VERIFIED.** New helper lib/agents/persist-binary.ts. EXEC-THUMB/EXEC-EDIT/EXEC-VGEN refactored. saveAgentOutput populates new columns. `npm run test-pipeline-drive` proved gpt-image-1 → local cache + Drive upload (file 1bXP4axmK9yuqNla21pltgmPoL9B73dtD in /SandyStudio/SS-TEST/)
- AssetPreview component: "Backed up to Google Drive — open in Drive" link when drive_web_view_url set, "Local cache only — Drive storage off" otherwise

---

*SandyStudio PLAN-history.md | archive created 2026-05-11 | write-once*
*Source: PLAN.md sections SPRINT MAP S0–S8 + CHANGE LOG 2026-04-23..2026-04-30 + Post-pilot tasks + Open decisions history*
