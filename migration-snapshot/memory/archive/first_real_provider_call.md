---
name: First real provider call — gpt-image-1 succeeded 2026-04-30
description: Phase 8 architecture validated end-to-end with gpt-image-1; reusable proof-of-life pattern for future adapters.
type: project
originSessionId: 1b00e7b6-0f98-4ba8-b76a-06edb0381a70
---
**2026-04-30**: First real provider call worked end-to-end via `npm run test-image`. gpt-image-1 generated a 1536×1024 PNG in 17.1s, cost $0.016 (low quality). Architecture validated: env key → `lib/agents/provider-resolver.ts` (DB lookup + auto-mock fallback) → `lib/agents/providers/openai-image.ts` adapter → binary saved to `webapp/public/staging/<file>.png` → served at `/staging/<file>.png` by Next.js.

**Components shipped:**
- Migration 0014_provider_assignments — global tier table, seeded with image=gpt-image-1 (real), others=mock.
- `provider-resolver.ts` — reads DB, 60s cache, auto-downgrades to 'mock' provider id when env key is missing (safe in tests).
- `providers/openai-image.ts` — gpt-image-1 adapter, returns base64 + cost estimate.
- `runner.ts` EXEC-THUMB case — branches on `provider.providerId`; persists b64 via `persistBinaryToStaging`.
- `factory.ts` — resolves provider before runAgent for agents with a contract (THUMB→image, VGEN→character_video, EDIT→video, MGEN→music, PUB→publish). Cost record now uses `metadata.provider_used`.
- `scripts/test-image-provider.ts` (`npm run test-image`) — direct adapter test, bypass Inngest, ~$0.016 per call.

**Pattern to reuse for next adapters (Veo 3, Drive, YouTube):**
1. Add provider to `ENV_KEY_BY_PROVIDER` map in resolver.
2. Create adapter under `lib/agents/providers/<vendor>-<contract>.ts`.
3. Branch in the relevant runner.ts case on `provider?.providerId === '<id>'`.
4. Persist binary via the same `persistBinaryToStaging` helper (until Drive lands).
5. Add a `npm run test-<thing>` script for direct proof.

**2026-04-30 follow-on**: Drive adapter shipped + verified. `npm run test-drive` runs OAuth refresh → ensureFolder → uploadBinary → list → deleteFile. Folder "SandyStudio" lives at https://drive.google.com/drive/folders/1AefoGUxuNEiwG118iQvYfx7Cn3EgEA1Y. New helper `lib/agents/providers/google-auth.ts` does refresh-token → access-token with 50-min cache; reused later for YouTube and Vertex paths.

**2026-04-30 also**: Veo 3 via Gemini API — adapter shipped, but **Gemini free tier blocks Veo with 429 RESOURCE_EXHAUSTED**. Code path is correct (got past auth, model, endpoint). To unlock: enable billing at aistudio.google.com/app/billing. EXEC-EDIT + EXEC-VGEN already wired — just flip video=veo-3 in /settings/providers UI when billing live.

**Why:**
Director's brief was "Just make first work to connect to and check real work with providers." Goal was end-to-end proof that the architecture connects to a real vendor and produces a real artefact. Achieved at lowest possible cost ($0.016) with full reusable pattern in place. Not yet integrated into UI (preview drawer pending Phase 5d step 3).

**How to apply:**
- For any new vendor adapter, follow the 5-step pattern above.
- Mock fallback is automatic — no env key = mock, no manual flag flipping.
- `webapp/public/staging/` is the temporary local binary store; gitignored. Phase 8 step 10 replaces it with Drive.
- Director can flip per-contract provider via `provider_assignments` row update in Supabase (until /settings/providers UI ships in step 8).
