---
name: session_2026-06-08_e02-finalcut-wysiwyg-fix
description: E02 re-stitch gave byte-identical renders — root cause was stitch reading a stale 2nd APPROVED animatic; full WYSIWYG fix shipped to master.
metadata: 
  node_type: memory
  type: project
  originSessionId: 66fd855e-7403-409d-b5fa-2e826df0c372
---

# Session 2026-06-08 — E02 final-cut WYSIWYG fix (shipped + pushed)

**Master:** `9d29309 → e7c76d7` (pushed to origin). Two commits: `a7dcb0c` (AnimaticPlayer controls), `e7c76d7` (stitch/media/duration). Verify: tsc·0 / **715** vitest (+3) / **30** replay-pilot.

## The real bug (Director's "пересобираю — длина не меняется")
Director found 4 final_cut files (v01–v04) **byte-identical** (same SHA256). Every re-stitch produced the same render → his timeline edits never reached the cut.

**ROOT (C):** E02 had **two APPROVED `VID-animatic`** at once — his edited **v07** (30 shots, 22 overrides, 8 head-trims) AND stale **v06** (29 shots, total 72). `loadAgentInputs` loads all APPROVED unordered; EXEC-STITCH did `upstream.find(status==='APPROVED')` → grabbed **v06**. Proven: Save goes to v07 (Polina saw total 76.5), render was always 72s = v06. v06 never invalidated because `resolveSlotDescriptor` (approve/route.ts) had **no slot for VID-animatic**.

## What shipped (8 edits, 6 files)
- **C.1** `runner.ts` EXEC-STITCH: pick **newest** approved animatic (filter+sort version desc), not `.find()`.
- **C.2** `approve/route.ts`: added `VID-animatic` slot → approving new animatic invalidates prior APPROVED (one per episode).
- **A.1** `runner.ts saveAgentOutput`: for `ext==='mp4'`, rename cache file to canonical `vNN` name + repoint drive_path/staging_path → media filename == row filename, each version its own file. (Was hardcoded `…final_cut-v01…` for ALL versions.)
- **A.2** `/api/media/[id]/route.ts`: `-DRAFT` files → `REVALIDATE` (were `immutable, max-age=1yr` → browser served first render forever).
- **B.1** `animatic-shotlist.ts`: shared `clipLengthsFromVidShotRows` (+3 tests). UI kept its own map-keyed build (different shape — left as-is).
- **B.2** `animatic-timing/route.ts`: query VID-shots → `clipLengths` into `computeTotalDuration` (persisted total now ≈ timeline, not unclamped 76.5).
- **B.3** `runner.ts` stitch: inline duration loop → `computeEffectivePlayback(shot, overrides, clipLengths)` (one source of truth; outpoint=inpoint+playable verified).
- **B.4** `ffmpeg-stitch.ts probeMp4Duration`: derive ffprobe from `resolveFfmpegPath()` (was pinned winget `7.1`, ffmpeg resolves `8.1.1` → ffprobe never found → `duration_seconds=null`).
- **B.5** `runner.ts`: `duration_seconds` fallback to summed length; added stitch keys (`shot_ids`, `duration_seconds`, `excluded_shot_ids`, `music_asset_id`, `ffmpeg_command`, …) to `saveAgentOutput` PERSIST_METADATA_KEYS (were dropped → final_cut metadata was empty).

Also in `a7dcb0c` (earlier in session, AnimaticPlayer.tsx): `cut start`/`cut end` button labels (±0.5s), single `duration` readout reads true override not inflated visual (fixed 1→1.5 jump), Save "Request body failed validation" fix (`setTrimStart` no longer writes `duration_seconds:0` which route's `.positive()` rejected), duration INFO moved into Timeline panel.

## NOT done / NEXT
- **Decisive smoke NOT run** (smoke-propose rule): Director re-stitch E02 → expect new final_cut **v05** reading **v07** (30 shots), **SHA256 differs** from the 4 identical files, drive_path/staging_path=`…v05…`, `duration_seconds` populated ≈ timeline. Then **hard-reload (Ctrl+Shift+R)** browser.
- 4 existing identical final_cut rows are historical; the A.2 revalidate + a fresh re-stitch heal them (no backfill written).
- v06 stays APPROVED in DB until next animatic approval (C.1 ignores it; C.2 cleans on next approve). Could invalidate v06 manually if desired.
- UI clipLengths consolidation deferred (different data shape, regression risk).

Related: [[plan_md_living_anchor]], [[verify_real_results_not_logs]], [[anti_additivity_principle]], [[backlog_observability_failures_not_surfaced]].
