---
name: Session 2026-05-13 — Seedance 2.0 provider integration (Phase 2)
description: fal.ai Seedance 2.0 wired as production VGEN provider end-to-end. Multi-provider router used as designed. Provider dropdown in VGENShotPanel + EpisodeTimelineSection + ProviderSettings. New default for character_video contract. tsc clean, vitest 198/198 (+11), replay-pilot 29/29, real probe $1.21 confirmed.
type: project
originSessionId: 742e4ba9-249a-49c1-8cfb-6cbe58836bcc
---
# Session 2026-05-13 — Seedance 2.0 provider integration

## What landed

- **NEW provider impl** [webapp/lib/agents/providers/fal-seedance.ts](webapp/lib/agents/providers/fal-seedance.ts) — REST queue adapter, mirrors `veo-gemini.ts` shape. Env: `FAL_KEY`, optional `FAL_SEEDANCE_MODEL_STANDARD` / `FAL_SEEDANCE_MODEL_FAST`. Inline data-URL for reference image. Polls fal-returned `status_url` (parent-truncated quirk).
- **Multi-provider router** [video-gen-multi.ts](webapp/lib/agents/providers/video-gen-multi.ts) — registered `seedanceFalProvider` with id `'seedance-fal-img2vid'`. Capabilities cap duration at 4-8s (matches Veo for animatic parity).
- **Type widening** [vgen-defaults.ts](webapp/lib/api/vgen-defaults.ts) — `VgenProviderId = 'veo-3-img2vid' | 'seedance-fal-img2vid'`, `FALLBACK_DEFAULTS.provider_id` flipped to Seedance.
- **Runner refactor** [runner.ts](webapp/lib/agents/runner.ts) EXEC-VGEN — direct `generateVideoVeoGemini` call replaced by `getMultiVideoProvider(provider!.providerId).generate(...)`. Veo Standard img2vid force-8 quirk preserved as Veo-only branch via `isVeoProvider` check.
- **Regenerate-video API** [regenerate-video/route.ts](webapp/app/api/assets/[id]/regenerate-video/route.ts) — body `provider` field; chain body → asset meta → series default → fallback. Capability-based duration clamp.
- **Single-shot API** [generate-single-shot/route.ts](webapp/app/api/episodes/[id]/vgen/generate-single-shot/route.ts) — body `provider` field forwarded into Inngest event.
- **Inngest function** [exec-vgen.ts](webapp/inngest/functions/exec-vgen.ts) — `VgenEventData.provider`, `syntheticResolvedProvider()` helper bypasses global `provider_assignments` lookup when event has explicit `provider`. Both pilot + single-shot handlers updated.
- **UI: VGENShotPanel** [VGENShotPanel.tsx](webapp/components/vgen/VGENShotPanel.tsx) — new Provider `<select>` (Seedance / Veo). Cost preview is provider-aware (Seedance Fast $0.2419/s vs Veo Fast $0.075/s).
- **UI: VGENShotSection** [VGENShotSection.tsx](webapp/components/vgen/VGENShotSection.tsx) — `pickProvider()` normalizes legacy provider id variants when seeding panel state.
- **UI: EpisodeTimelineSection** [EpisodeTimelineSection.tsx](webapp/components/timeline/EpisodeTimelineSection.tsx) — provider `<select>` left of Generate buttons. Defaults to Seedance per Director directive.
- **Provider catalog** [provider-catalog.ts](webapp/lib/api/provider-catalog.ts) — Seedance entries added to `video` + `character_video` candidates. Existing `/settings/providers` ProviderSettings UI auto-picks up.
- **Migration 0028 APPLIED** [0028_widen_vgen_provider.sql](webapp/supabase/migrations/0028_widen_vgen_provider.sql) — `provider_assignments.character_video.active_provider_id = 'seedance-fal-img2vid'` confirmed in DB.
- **Unit tests** [fal-seedance.test.ts](webapp/__tests__/lib/agents/providers/fal-seedance.test.ts) — 11 tests, mocked global fetch, slug + env + cost + URL quirks + 429/FAILED handling + data-URL composition + duration clamp.

## Last meaningful commits

This session's work is still uncommitted on `claude/quizzical-brown-462555` branch (auto-sync hook should pick up).

Prior: `6099464` 2026-05-13 17:36 (q1 STITCH per-shot trim + E20 close).

## PLAN.md updates

[PLAN.md `## CURRENT STATE` block](PLAN.md) replaced with Phase 2 Seedance entry at top, previous Phase A.2 / Mode 2.5 / etc entries preserved below. Date stamp 2026-05-13.

## Verify result

```
npx tsc --noEmit           # clean (0 errors)
npx vitest run             # 19 files, 198/198 tests passing (was 187 → +11 fal-seedance)
npm run replay-pilot       # 29/29 assertions passing
npx tsx scripts/test-orbit-fal.ts 'bytedance/seedance-2.0/fast/image-to-video' 5
                           # real probe: 103.3s wall clock, 2.5 MB mp4, $1.21
                           # → public/staging/test-orbit-fal-...-1778686002329.mp4
                           # confirms slug + FAL_KEY + URL quirks unchanged after refactor
```

## What's open / next step / blockers

**Open:**
- Director smoke via UI — three scenarios documented in PLAN.md CURRENT STATE next-step block.
- Seedance-specific prompt builder + skill `seedance-prompting` — Director directive "пока не подключай — обсудим" (separate next PR). Structure researched in session `nervous-bose-8196fc` — 7-slot template (Style/Duration/Scene/Character/ShotDetails-timeline/Sound/Anti-drift/Negative-tail). Audio conflict pre-resolved here by `generate_audio: false`.

**Blockers:** none.

**Next session likely:**
- Either Director smoke result feedback + tweaks, OR Seedance skill PR, OR continue with Phase D Character Identity Model that's been pending since 2026-05-12.

## Key learnings

- fal.ai REST queue has a parent-truncation quirk: submit POST goes to full slug `bytedance/seedance-2.0/image-to-video`, but `status_url` / `response_url` in the response strip the trailing `/image-to-video` to `bytedance/seedance-2.0/requests/<id>[/status]`. Python `fal_client` SDK hides this internally; raw fetch must use fal-returned URLs verbatim — don't construct from the full slug.
- The `MultiVideoGenProvider` abstraction (built in Phase A.1 but unused in runner) was correctly anticipating this exact integration. Wiring runner.ts EXEC-VGEN through `getMultiVideoProvider()` finally retires the direct Veo-only import path. Future provider additions (Kling 3, Hailuo, Sora) are now ~30-line wrappers around their REST client + one branch in `getMultiVideoProvider`.
- Per-event provider override (Inngest `event.data.provider`) needs to take precedence over global `provider_assignments` row — UI dropdown choice is authoritative for that one shot. Implemented via `syntheticResolvedProvider()` that builds a fake `ResolvedProvider` with env-key auto-downgrade preserved.
- Seedance 2.0 Standard ($0.30/s) cost is ~2× Veo Standard ($0.15/s). Quality jump justifies it for character-motion-heavy shots; Veo Fast ($0.075/s) stays a viable iteration tier when Seedance bucket exhausted.

## Related: out-of-scope follow-up

Skill `seedance-prompting` researched 2026-05-13 in session `nervous-bose-8196fc` (different worktree). Director directive: "пока не подключай — сначала обсудим". Skip in this PR. Audio conflict (Seedance embedded audio vs EXEC-MGEN SUNO pipeline) already mitigated by `generate_audio: false` in our adapter, so the skill follow-up doesn't block production usage.
