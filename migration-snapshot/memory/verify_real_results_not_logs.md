---
name: Verify real results, not just logs
description: When checking pipeline / job / agent output, always inspect the actual artifact (markdown content, MP4 in Drive, image rendered in browser) — never trust "job COMPLETED" status as proof of correctness.
type: feedback
originSessionId: 063ac62d-3128-457d-96d1-b2c9907a7ad1
---
When verifying anything Director ran or asked to run, do not stop at logs / job status / API success codes. Open the real artifact and look at it.

**Why:** 2026-04-30 incident on SS-S03-E01 — Director ran what looked like a real Veo 3 pipeline, but I only checked job status (COMPLETED) and provider_assignments (veo-3 set correctly). Actually animatic asset was an old mock from before the provider switch, all upstream text agents were still mockLLM, and Veo prompt was 3 hardcoded lines. Director caught this only when he physically opened Drive folder and saw it empty. He explicitly said: "ВСЕГДА ПРОВЕРЯЙ РЕАЛЬНЫЕ РЕЗУЛЬТАТЫ А НЕ ТОЛЬКО ЛОГИ".

**How to apply:**
- For text agents: read assets.content, verify it actually addresses upstream brief content (named characters, beats, premise) — not template stubs.
- For media: open the file in Drive (or fetch a frame), confirm content is cohesive with brief — not generic 2D animation.
- For provider switches: verify the next produced asset has real provider_id metadata (drive_file_id, web_view_url present), not just that the assignment row was updated.
- For "real Veo / real Drive / real Anthropic" claims: spot-check the actual prompt that was sent (for Veo: read buildXxxPrompt source + inputs.upstream_assets to know what was assembled).
- When reporting a result to Director, include the artifact reference (Drive link, content excerpt, frame screenshot) — not just "job COMPLETED, $X spent".
