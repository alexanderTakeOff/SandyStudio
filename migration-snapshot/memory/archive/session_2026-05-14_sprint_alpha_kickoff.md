---
name: Sprint α→ε kickoff checkpoint (2026-05-14)
description: Pre-clear checkpoint. Sprint plan locked at `~/.claude/plans/cached-tickling-willow.md`. P0 + α (Realtime + team-chat) → β (seedance skill) → γ (E21 production via chat, no webapp) → δ (Character Identity Model) → ε (Skill Editor). Resume from this file on first message of next session.
type: project
originSessionId: 742e4ba9-249a-49c1-8cfb-6cbe58836bcc
---
# Sprint α→ε kickoff — checkpoint before `/clear`

## Why this memo exists

Director and I closed a long session today (Phase 2 Seedance integration shipped, sprint α→ε approved). Per CLAUDE.md §12 Ritual 4 + Plan pre-sprint step, capture state here so the fresh session resumes cleanly without re-deriving context.

## The locked plan

Single source: `C:\Users\NAVIA VISION ONE\.claude\plans\cached-tickling-willow.md`. One-page tezisniy plan, Director-approved 2026-05-14.

**Phase sequence:**
- **P0** (~30 min) — Flux Pro Ultra `image_size` 422 fix; E20 → ARCHIVED-PARTIAL.
- **α** (~2-3 days) — Postgres trigger Realtime + team-chat unified thread (Claude / Director / PA).
- **β** (~1 day) — Seedance prompting skill `.claude/skills/seedance-prompting/` (7-slot template).
- **γ** (~1-2 days) — E21 production through chat only, **zero webapp clicks**, maintain `docs/pa-gap-audit-e21.md` live.
- **δ** (~3-7 days) — Character Identity Model (migration 0030 + EREF builder + drawer UI).
- **ε** (~1-2 weeks) — Skill Editor / Learning Loop (`valiant-soaring-karp.md` design).

**Deferred:** StageKebabMenu provider section, Sprint 10A reviewer unification, Seedance 1080p/10-15s/webhook, "Claude-as-primary" architectural pivot.

## What just landed today (Phase 2 Seedance — context for next session)

End-to-end multi-provider video generation:

- NEW [webapp/lib/agents/providers/fal-seedance.ts](webapp/lib/agents/providers/fal-seedance.ts) — REST queue adapter.
- Router [video-gen-multi.ts](webapp/lib/agents/providers/video-gen-multi.ts) — `seedanceFalProvider` registered.
- Default flip: `FALLBACK_DEFAULTS.provider_id = 'seedance-fal-img2vid'`.
- Runner [runner.ts](webapp/lib/agents/runner.ts) EXEC-VGEN dispatches through `getMultiVideoProvider()`.
- Inngest [exec-vgen.ts](webapp/inngest/functions/exec-vgen.ts) — per-event provider override via `syntheticResolvedProvider()`.
- UI: VGENShotPanel + VGENShotSection + EpisodeTimelineSection all have Provider `<select>`.
- Migration 0028 applied: `provider_assignments.character_video.active_provider_id = 'seedance-fal-img2vid'`.
- Tests: vitest 198/198 (+11 new fal-seedance) · tsc clean · replay-pilot 29/29.
- Real probe verified: Seedance Fast 5s img2vid via `scripts/test-orbit-fal.ts` — $1.21, 103s wall clock.

Full details: [session_2026-05-13_seedance_provider_integration.md](session_2026-05-13_seedance_provider_integration.md).

## Resume protocol for next session

1. Read this memo + the plan file.
2. Read [PLAN.md](PLAN.md) `## CURRENT STATE` (Ritual 2).
3. Confirm working directory: `C:\SandyStudio\.claude\worktrees\quizzical-brown-462555`.
4. Confirm branch: `claude/quizzical-brown-462555` (or fresh worktree per Ritual 5 parallel-session discipline).
5. Start P0 first (Flux fix + E20 archive) — small warm-up before α.

## Operational reminders (carry across clear)

- Mode `===1===` default; `===5===` only after Director explicit request.
- E21 lane separation: Director instructs in chat, Claude executes CLI/DB. Zero webapp clicks throughout γ.
- For γ: `docs/pa-gap-audit-e21.md` is append-only, machine-readable, tagged `pa_feasibility=OK/GAP/N/A`.
- Real generation budget for γ capped ~$80.
- Phase exit gate: tsc + vitest + replay-pilot, all green, before declaring phase done.
- Each phase ends with its own memo + PLAN.md `## CURRENT STATE` rotation.

## Known small bugs to remember (not in plan)

- Flux Pro 1.1 Ultra returns 422 on `image_size: "1024×1024"` — endpoint switched to enum `'square_hd'/'square'/'portrait_4_3'/'portrait_16_9'/'landscape_*'`. **This is P0 (a).** Fix probably in `webapp/lib/agents/providers/` (the image regenerate path that uses Flux as image-side provider). Verify with EREF regenerate-image flow.

## What NOT to retry (lessons from session today)

- Don't construct fal.ai status/result URLs from full slug — use fal-returned URLs verbatim (parent-truncated quirk).
- Don't merge VGENShotPanel quality + provider into single dropdown — keep two `<select>`s (cleaner UX, matches Director's "like the existing select" reference).
- Don't enable Seedance embedded audio — always `generate_audio: false`; EXEC-MGEN/SUNO + EXEC-STITCH mux own that layer.
- Don't refactor EXEC-EDIT (legacy animatic Veo path) — kept as-is for replay-pilot back-compat.
- Don't re-architect for "Claude-as-primary" — Director and I closed that worldview discussion 2026-05-14 evening, parked. Hybrid surfaces stay.

## Out-of-band

Director in Dubai (UTC+4). Today is 2026-05-14. Auto-sync hook commits use local Dubai time; DB/Inngest use UTC. Always `date -u` before declaring a job "stale".
