# Handoff — Distribution DONE · Reconciler decision is next (2026-07-10, updated EVE)

## ⭐ NEXT SESSION HEADLINE — decide the reconciler
Директор (свежая голова after /clear): **нужен ли реконсайлер вообще и в каком виде?**
Full audit → [[reconciler_audit_2026-07-10]]. TL;DR: as-built it's a **mode-blind fire hose** that
blindly auto-approves creative video/image gates (`reconcile.ts:165-173`), no governance-mode awareness
(`factory.ts:989` + `reconcile-execute.ts:78` gate only on global env `MECHANICS_AUTO_ADVANCE`),
contradicts `gate-decision.ts` taxonomy (VGEN/EREF=creative, Mode 1/2/3=require_human), no "Polina-after-
retry-cap" layer. Director's target: reconciler PUSHES only; approve = critics-in-retries → Polina-after-cap
→ Director. **Do NOT touch reconciler code before agreeing the target model.** Any smoke meanwhile:
`MECHANICS_AUTO_ADVANCE=OFF`.

## ✅ Distribution — FULLY SHIPPED this session (all on master, PUSHED = origin `7d20b84`)
YouTube distribution is real end-to-end AND the back-catalog is dressed:
- **EXEC-PUB real** (`fb50d4a`): loads APPROVED VID-final_cut+SPC-metadata+IMG-thumbnail → uploads via API
  with EXEC-COPY title/desc/tags + EXEC-THUMB custom thumbnail → writes youtube_video_id; idempotent
  (live id→skip, deleted→re-upload). Proven live: Director's new final cut auto-published unlisted.
- **Robust shared metadata parser** (`359adef`, `publish-metadata.ts`) — tolerant of EXEC-COPY's non-uniform
  output (Title (Primary), Option/Variant labels, quotes, char-count annotations). Used by runner + polish.
- **Auto-playlist** (`7d20b84`): EXEC-PUB adds each published video to the series playlist
  (`series.metadata.youtube_playlist_id` = `PLVJB9rPJ6q2g` for Sandy; ep-override→series→env fallback).
- **Back-catalog dressed:** all 10 videos → `unlisted`, metadata + custom thumbnails, in the playlist,
  `madeForKids=false` (family/general — factory default too). E09 (no assets) hand-authored: metadata
  written+registered, thumbnail AI-generated (gemini-flash-image, free, on Sandy canon) + uploaded.
- **Two tokens** in `.env.local`: `GOOGLE_REFRESH_TOKEN` (Drive ao@), `YOUTUBE_REFRESH_TOKEN` (Sandy Brand
  Account — now scoped upload+readonly+**force-ssl** for edit/thumbnail/playlist). Sandy channel = Brand
  Account `UCc2YJlHFclO9BWLEgPlglIg` under `ao@mystaydubai.com`.
- Ledger `docs/distribution/video-episode-map.md`; strategy playbook `docs/distribution/strategy.md`.
- Verified: tsc·0 / vitest·1189 / replay-pilot·30.

## ⚠️ DEPLOY PENDING
Prod :3000 runs `ef57b79` (EXEC-PUB real + start-video + Key Art). Newer PUSHED commits **NOT deployed**:
`359adef` (robust parser), `98f2323` (strategy+force-ssl scope), `7d20b84` (auto-playlist). Factory won't
use robust-parser / auto-playlist until rebuild+restart. **Deferred on purpose** — fold into the next
redeploy after the reconciler work (which will touch EXEC-PUB/reconciler anyway). Redeploy: `npm run build`
in webapp then restart `next start` (only in a clean window — 0 in-flight render jobs).

## 🔓 Distribution loose ends (not blocking)
1. **E07 "Tidy Tornado"** title/desc still raw — an active **A/B "Test & Compare"** in Studio blocks
   `videos.update` title (`UPDATE_TITLE_NOT_ALLOWED_DURING_TEST_AND_COMPARE`). Thumbnail+privacy are set.
   → Director ends the test in Studio, then re-run the polish path for E07.
2. **Rewrite EXEC-COPY texts** — Director: titles/descriptions are too WORDY & unclear for a **FAMILY
   series** (little kids read syllable-by-syllable). Rework the 10 videos' copy to short/clear/obvious +
   calibrate EXEC-COPY brand voice (this is a real EXEC-COPY prompt/brand-voice fix, not just a one-off).
3. **"Draft" in Studio** — 8 hand-uploads showed "Draft"/private; API says all now `unlisted/processed/
   0 issues`. Untested: open a link (e.g. youtu.be/mCGE4FBcSrQ) — plays → stale Studio UI; unavailable →
   true Studio draft (finish in Studio; API can't publish a Studio draft — but the FACTORY never makes
   drafts, it API-inserts born-published).
4. Orphan `mIew_0BCc5Y` (my early Airport test) — Director may delete; canonical E25 = `PHRbzx1qAHg`.

## 🧹 Housekeeping
- **MEMORY.md ~21KB** (read limit 24.4KB) — compact to <17KB early next session.
- Global rule added (`~/.claude/rules/common/git-workflow.md`): **always commit before /save-session; then
  ask Director about push/merge.** Applied this session (pushed).

## Locked
q11a full-trio-real SHIPPED · reconciler OFF until decided · git pushed (origin=7d20b84) · deploy deferred.
