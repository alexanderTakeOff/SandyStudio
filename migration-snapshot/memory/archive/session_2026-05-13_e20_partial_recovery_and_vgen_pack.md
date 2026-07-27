---
name: Session 2026-05-13 — E20 partial recovery + VGEN/STITCH fix pack
description: Day-long Mode 2.5 PA session. Closed E20 partial (17/19 shots) on Veo quota exhaustion. 10+ patches across VGEN, STITCH, Realtime push, ffmpeg, UI bugs, EREF prompt. Migrations 0026 + 0027 applied. Pending q1 (per-shot trim), q2 (Postgres trigger Realtime), q3 (team-chat unified channel).
type: project
originSessionId: cb9449a-followup
---

# Session 2026-05-13 — E20 Partial Recovery + VGEN/STITCH Pack

Worktree: `claude/quizzical-brown-462555` (continuing).

## 1. What landed

### Morning
- Composer fix merged from sibling worktree (commit `2d72849` — `/api/assets/[id]/upload-music-direct` + `MGENActionsBlock` in AssetPreview). Conflict в PLAN.md resolved.
- Memory entry: [Director in Dubai — UTC+4 timezone](director_timezone_dubai_utc_plus_4.md).

### Realtime push pipeline (planned, partially shipped)
- Migration **0026** `realtime_publish_activity_events` — `ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events` + `REPLICA IDENTITY FULL`. Applied via `npx supabase db push`.
- NEW `lib/concierge/ambient-events.ts` (decideAmbientEvent + extractAmbientMetadata, pure functions).
- NEW `app/api/concierge/ambient/route.ts` (POST endpoint, RLS guard, dedup by `activity_event_id`).
- NEW `hooks/useActivityRealtime.ts` (Supabase Realtime channel subscription per thread).
- `ConciergePanel.tsx` invokes hook with current threadId.
- NEW `system-prompt-builder.ts` Block 11 — `PIPELINE_EVENTS_SINCE_LAST_REPLY` lifts system pipeline_event turns to LLM context.
- Tests: 9 unit tests on `ambient-events.ts` (filter, metadata, severity, Director-own skip).

### Memory leak fix (critical)
- `lib/supabase/client.ts` — module-level singleton (cached `createBrowserClient`). Without this, each HMR reload + StrictMode double-mount opened new WebSocket → 2-5GB heap → next-dev зомби twice this session, killed by Director through Task Manager.
- `hooks/useActivityRealtime.ts` — defensive `getChannels()` dedup before subscribe.

### EREF spatial coverage layer
- Director surfaced (via PA): EREF prompts ignored camera_angle/movement/motivation/sub_area → all 19 shots collapsed on one flat plate. Cancelled fanout via Inngest GraphQL.
- `lib/api/eref-spatial-coverage.ts` NEW — pure derivation `deriveSpatialCoverage(shots) → SpatialShotEntry[]` with per-shot anchor + camera_direction (17 vocabulary mappings) + variation_note (per-location anchor reuse tracking).
- `episode-references.ts` parser now lifts camera_* + location.sub_area; prompt builder uses `formatSpatialBlockForPrompt`; closing instruction "Two shots in same location must show visibly different viewpoints, do NOT replicate flat plate".
- 7 unit tests `eref-spatial-coverage.test.ts`.
- Also: EREF `runner.ts` skip-if-already-approved (idempotent re-run).

### E20 evening pipeline push (deep work)
Veo quota burned across many retries. Coverage hit 17/19 then plateaued (SC11-SH01 + SC11-SH02 unreachable). Director: "ждать бесполезно".

10+ patches:
1. **`regenerate-video/route.ts`** forwards `vgen_pilot: true` metadata — Approve count "1/2" bug closed (3rd layer of layered issue same day).
2. **`AssetPreview.tsx`**: `<audio key={drive_path}>` + `<video key={drive_path}>` — browser cache no longer holds stale stream after Replace upload.
3. **`AnimaticPlayer.tsx`** pills bright (solid `var(--accent-success)` + glow shadow + weight 700 + textShadow) — Director "тускло-зелёные" closed.
4. **`buildShotPromptV2`** (`vgen-shot-helpers.ts`): firstSentence truncate (literary metaphors out), drop role label ("Reaction shot:" rendered as on-screen text in Veo), drop quoted episode title, drop Beat:/Mood: labels (they printed as annotation), add explicit "16:9 widescreen composition from the very first frame", `endWithPeriod` helper. Tests rewritten — 23 passing.
5. **`runner.ts EXEC-VGEN`**: `Math.round` clamp on all 3 finalDuration branches; **forced durationSeconds=8 для Standard tier + img2vid** (Veo 3.1 docs: img2vid Standard model returns only 8s clips); `console.info` log per-shot for debug.
6. **`veo-gemini.ts`** error message now includes full Veo response body — bare 4xx no longer silent. Revealed actual causes: `durationSeconds out of bound` (clamp bug fixed) and `RESOURCE_EXHAUSTED` (quota).
7. **`ffmpeg-stitch.ts`** `-stream_loop -1` for music — short music loop файл больше не truncate'ит video через `-shortest`. Tests 10 passing.
8. **`EpisodeTimelineSection.tsx`** two-button **Generate · Fast / Generate · Standard** footer for missing-VID cells. Frontend now passes `quality_tier`. Standard's separate quota bucket bypasses Fast 429.
9. Migration **0027** `activity_events_authenticated_select` — RLS SELECT policy for `authenticated` role on `public.activity_events`. Realtime push was silent because anon channel got 0 rows. Applied via `npx supabase db push`.
10. **`scripts/backfill-pa-ambient.ts`** — retroactively persist ambient system turns into PA thread for events that arrived while Realtime was broken. 21+2 turns backfilled.

### E20 closing actions
- `scripts/trim-e20-animatic-sc11.ts` — animatic shot_list 19→17, total_duration_s 60→54.
- STITCH fired manually after trim. final-cut v01 = 32s (music `-shortest` cut). After ffmpeg patch — final-cut v02 = **96s** (concat actual VID-shot mp4 durations: 10 Fast×4s + 7 Standard×8s).

## 2. Key insights (carry forward)

1. **Veo 3.1 img2vid Standard ALWAYS returns 8s clips** even with `durationSeconds: 5`. Google's error message "between 4 and 8 inclusive" misleads — for img2vid Standard the real allowed set is `{8}`. Forced 8s in runner.ts when reference image attached + quality=standard.
2. **Supabase Realtime applies RLS to channel subscriptions** — adding table to `supabase_realtime` publication is NOT enough. Browser channel получает 0 events если нет SELECT policy для `authenticated` role. Critical: every Realtime-published table needs explicit SELECT policy.
3. **Browser `createSupabaseBrowserClient()` should be singleton** — each call opens new WebSocket. HMR + StrictMode amplify this into multi-GB heap leak. Already singleton via module-level cache.
4. **ffmpeg `-shortest` + short music = video truncated** — solution: `-stream_loop -1` before music input so audio is effectively infinite, then `-shortest` correctly anchors на video length.
5. **STITCH concat does NOT respect animatic shot_list timing** — ffmpeg concat demuxer plays each input file at its native duration. To get final cut matching storyboard timing, need per-file `outpoint <seconds>` directive in concat-list.txt. This is q1 pending.
6. **`regenerate-video` must forward all metadata flags** that downstream logic depends on. `vgen_pilot` example: counter resolved latest row per shot_id, regen lost pilot flag, count fell to 1/2. Layered bug pattern (gate → runner → loader) needs systematic audit.
7. **`<audio/video src={url}>` без `key` keeps browser stream cache** even when SWR returns new URL. React doesn't remount same DOM node; HTML5 media element holds buffer.
8. **Director timezone is Dubai UTC+4** — auto-sync commits use local time, DB/Inngest use UTC. Cross-check `date -u` before declaring stale.

## 3. Pending (for /clear next session)

### q1 — STITCH per-shot trim ✂️ (~30-45 min)
File: `webapp/lib/agents/providers/ffmpeg-stitch.ts` + tests.
Change concat-list builder to write per-file `outpoint <duration>` directive based on `animatic_v1.shot_list[i].duration_seconds`. Veo Standard 8s clip → cut to 3-5s storyboard intent. Final cut → 54s.
Re-fire STITCH after patch.

### q2 — Postgres trigger Realtime reliable 🔔 (~30 min)
Browser hook still silent (0 POSTs after refresh + migration 0027). Replace fragile client-side Realtime с server-side trigger:
```sql
CREATE FUNCTION trg_inject_ambient_turn() RETURNS trigger ... INSERT INTO concierge_turns ...
CREATE TRIGGER on_activity_event_insert AFTER INSERT ON activity_events EXECUTE FUNCTION trg_inject_ambient_turn();
```
Need to resolve active `thread_id` for the actor — perhaps latest non-ended thread for `director_id`.
Migration 0028. After — `useActivityRealtime.ts` обленить или удалить.

### q3 — Team-chat unified channel 💬 (~50 min) [Director directive]
Director's minimal vision: shared PA chat thread, all three participants.
- `POST /api/team-chat/post` — endpoint Claude posts via curl. Persists `role=system content="**Клод:** ..." metadata.kind='claude_message'`.
- `ConciergePanel.tsx` renders `kind='claude_message'` system turns as distinct bubble.
- PA system prompt block — lifts my messages to her LLM context (рядом с PIPELINE_EVENTS).
- I post via Bash curl after every significant action.

### q4 — E20 publish decision
Current final-cut.mp4: 96s (concat actual). Options:
- (a) Approve as-is, publish 96s
- (b) Wait q1 fix → re-stitch 54s → approve → publish

### q5 — Sprint 10 (Director-approved earlier)
- 10A Reviewer Unification (EXEC-REVIEWER + skill registry) — 5-7 days
- 10B Phase D Character Identity Model — 3-7 days
- 10C Skill Editor / Learning Loop — 5-7 days

## 4. Verify final (Ritual 3)

- tsc clean
- vitest **185/185** (was 173 — +9 ambient-events, +3 vgen-prompt-builder updates carried over)
- replay-pilot **29/29**
- Last auto-sync commit before /clear: ~17:28 UTC

## 5. Blockers / observations

- Veo Standard 8s-only for img2vid causes downstream timing mismatch in animatic.
- Realtime push browser-side fragile; q2 server trigger more reliable.
- Director's Tier-1 Google quota daily limit hit after ~25-30 API requests.
- E20 17/19 shots — SC11-SH01 + SC11-SH02 will need next-day quota window OR alternative provider (Seedance via fal.ai per earlier research).

## 6. Memory updates planned

- Add to MEMORY.md: this memo as `session_2026-05-13_e20_partial_recovery_and_vgen_pack.md`.
- New rules:
  - "Veo 3.1 img2vid Standard returns 8s only" → memory file for future agents.
  - "Realtime publication needs RLS SELECT policy for authenticated" → memory for backend work.
  - "Supabase browser client must be singleton" → already implemented, document.

## 7. Director directives captured today

- **"E20 заканчиваем на Veo3, Seedance/Kling — следующий эпизод"** — Sprint 10 will introduce fal.ai universal video adapter for Seedance/Kling/Veo.
- **"PA + Claude в одном чате с подписями"** — q3 team-chat работа.
- **"Ждать бесполезно"** на quota recovery — Director ok with partial closes when external blocker stalls > minutes.
