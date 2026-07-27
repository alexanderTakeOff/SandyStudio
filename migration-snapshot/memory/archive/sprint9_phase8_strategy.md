---
name: Sprint 9 Phase 8 — Google-first provider strategy
description: Phase 8 active provider stack + two-tier UI switching architecture; Phase 5d ships kebab+drawer first. APPROVED 2026-04-30.
type: project
originSessionId: 1b00e7b6-0f98-4ba8-b76a-06edb0381a70
---
Provider Strategy v0.2 APPROVED 2026-04-30. Spec at `specs/system/provider_strategy.md`.

**Active Phase 8 stack (Google-first MVP):**
- Storage: `drive_native` (Drive API v3, server-side OAuth only, browser never sees token)
- Image: `gpt-image-1` (reuses `OPENAI_API_KEY` — same key as Concierge — no new secret)
- Video: `veo-3` (text-to-video) + `veo-3-img2vid` (character, ~75% consistency, MVP-only override of D-001)
- Music + SFX: Beatoven + ElevenLabs **registered, `is_active = false`** (silent pilot for MVP)
- Publish: `youtube_data_api` last, after E03 dry-run proves the cycle
- Studio agents stay on Anthropic. Concierge stays on `gpt-5.4-mini`.

**Switching architecture — two tiers:**
- Global: Supabase `provider_assignments` (per contract, source of truth for resolver default). UI: `/settings/providers`.
- Per-stage: Supabase `stage_provider_overrides` (per episode + stage + contract, narrowest). UI: kebab menu on each pipeline row.
- Resolver order: stage override → global → fail.
- 60s cache, invalidated on UI write.
- Switch behaviour: **soft cancel** — mark `RUNNING`/`QUEUED` jobs `CANCELLED_BY_PROVIDER_SWITCH`; do NOT interrupt Inngest mid-step. Director re-triggers manually.

**Why:**
Director needs to swap providers without engineer intervention. Global covers "Veo replaces Flux for everything"; per-stage covers "Sandy drifted in Storyboard act 3, run that one stage on Flux+Kling instead". Per-episode tier was rejected as over-engineering.

**Storage split (variant A, 2026-04-30):** markdown is canonical in DB (`assets.content` column, migration 0013 applied). Binaries (image/video/audio) go to Drive in Phase 8 step 10. Reason: 10ms DB vs 300ms Drive API per save × frequent edits = seconds saved. runner.ts saveAgentOutput now writes to `content`, not into `description` (which is back to short-summary role).

**How to apply:**
- Phase 5d ships **first**: pipeline kebab UI (Approve/Reject/Tweak/Re-trigger/Edit) + activity-item preview drawer (md/img/video/audio renderers) + friendly agent names. No provider features yet.
- Phase 8 slots Provider sub-menu into the same kebab — sequencing q1b. Kebab and drawer must exist before Phase 8 step 9.
- D-001 partial reversal documented: Veo img2vid MVP, Kling Phase 8.5 candidate if E03 character drift is unacceptable.
- New Google secrets to provision before Step 16: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CLOUD_PROJECT_ID`. OpenAI key already there. Total Phase 8 secret surface = 5 vars.

**17-step plan** (in spec §6):
- 1: spec ✅ (this entry)
- 2–4: Phase 5d (kebab UI, preview drawer, friendly names)
- 5–17: Phase 8 (migrations, resolver, /settings UI, kebab provider menu, Drive adapter, OAuth, gpt-image-1, Veo, character_consistency v0.4, PA-005 Drive workflow, E03 first real run, YouTube last)

Gate between steps 16 and 17: if E03 dry-run shows unacceptable character drift → Phase 8.5 = wire Kling adapter, flip switch through UI, re-run.
