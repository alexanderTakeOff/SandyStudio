# Session 2026-05-13 — Composer music upload regression fix

## What landed in master (commit 2d72849)

**Closes Director's report 2026-05-12 «зашёл в композер, вижу мок, нет кнопок».**

### Root cause

Phase A.2 PR γ audio reorg (LT-04, 2026-05-08) moved MGEN BEFORE animatic.
Legacy Upload-music UI lives only inside `AnimaticPlayer.tsx`
(lines 612–683) — for a fresh episode no animatic exists yet → no player
→ no upload button reachable. Director saw mock track in composer
preview with no affordance to replace it.

### Fix shipped

| File | Change |
|---|---|
| `webapp/app/api/assets/[id]/upload-music-direct/route.ts` | NEW, ~190 LOC — sibling to `upload-music`, writes binary to AUD-music asset's `drive_path` + `staging_path` columns. 20MB cap, same SUPPORTED_AUDIO MIME map. Status stays REVIEW after upload. |
| `webapp/components/preview/AssetPreview.tsx` | NEW `MGENActionsBlock` rendered for AUD-music (non-LOCKED). Two buttons: 🎵 Upload track + ✨ Run generation (with «mock» chip — Suno not wired). |
| `PLAN.md` | `## CURRENT STATE` updated this session (Ritual 1). |

## Verify (Ritual 3)

```
tsc --noEmit   → clean
npm test       → 166/166 pass
replay-pilot   → 29/29 pass
```

## Commits

```
2d72849 fix(composer): Upload + Generate buttons for AUD-music asset preview  ← THIS
8fa5c00 Merge PR #23 (Mode 2.5 PA + Mode 3 readiness drill) — landed 2026-05-11
```

## What this session also did

- Pulled master into agitated-lederberg-a292d3 worktree (was 231 commits behind)
- Verified Task 1 (CLAUDE.md slim 604→347) and Task 2 (5 hooks) already shipped in PR #23
- Pruned plan file from 3 tasks down to just Task 0 (this fix)

## Operational rituals — observed

- **Ritual 1** ✅ PLAN.md `## CURRENT STATE` updated in same session as code
- **Ritual 2** ✅ Session start sanity check passed (PLAN.md Date: 2026-05-12, fresh)
- **Ritual 3** ✅ Verify trio with numbers reported to Director
- **Ritual 4** ✅ This memo
- **Hook B** (commit-guard) didn't trigger — PLAN.md was in the staged diff alongside code
- **Hook C** (verify-on-push) — assumed silent pass; counts reported manually

## What's open / next step / blockers

### Open backlog (not started)

- **Director smoke #2** — Audio reorg on new episode. NOW UNBLOCKED. Plan: `webapp/docs/smoke-tests/audio-reorg-smoke.md`. Director needs to spin a new episode and ride it through brief → script → STB → world_check → music REVIEW (test Upload + Generate buttons) → EREF + music both APPROVED → animatic with music → VGEN → final-cut.
- **Phase 1.5 backlog** — variants_per_generation (LT-07), regenerate auto-demote, vgen_defaults UI, buildShotPromptV2 enrichments (LT-14).
- **Mode 2.5 Phase B** — Skill Editor / Learning Loop (design ready in valiant-soaring-karp.md). Deferred until Director green-lights.
- **UI cleanup** LT-10..13 — scalable timeline 60+, episode page noise, foldable Activity Feed, time filters.
- **Bug 17** — Videomatic FFmpeg aspect 16:9 → 1:1 observed on SS-S14-E01. Inspect ffmpeg-stitch.ts canvas/crop logic.
- **Bug 18** — Prod Assistant TTS «как больной робот». Upgrade ElevenLabs / OpenAI TTS.

## Director quote 2026-05-12 ~16:00 (verbatim, paraphrased earlier)

> «у нас есть отдельная layer музыкальная композиция то наверное logically
> иметь кнопку там. зашёл в композер, зашёл в превью, вижу там ничего нет.
> я ожидаю увидеть кнопку Загрузить или Запустить генерацию. для запуска
> генерации API SUNO ещё не подключён, поэтому я бы мог просто загрузить
> то что уже я сгенерил.»

Mental model preserved: music IS a separate layer (own asset type, own
pipeline stage) → composer surface owns its own affordances, not borrowed
from animatic.
