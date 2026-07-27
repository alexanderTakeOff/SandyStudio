---
name: session-2026-07-18-19-pipeline-caps-viewer-rule
description: "Two-day session — timing autosave, one ordering rule, media/metadata truth, plan-authoring cap + visible HALT, viewer rule. All merged to master."
metadata: 
  node_type: memory
  type: project
  originSessionId: db82fb2e-10e2-40ba-abd3-828b2871c745
  modified: 2026-07-19T13:02:21.701Z
---

Session 2026-07-18 → 2026-07-19 (E30, mode 3, Director present). Everything below is
merged and pushed to `master` (`origin/master` = `9a5724ee`).

## What landed

**Timing autosave.** "Save timing" button removed → autosave 3s after the last edit,
status chip, Retry only on failure. Forced flush on tab hide / unload / unmount.
Root causes fixed: (a) the player re-seeded local overrides from the server on every
`contract` identity change and reset dirty — after `c4d35d4b` made Realtime primary
this wiped fresh edits ~1s later; (b) the client always sent `audio_tracks`, so the
route re-encoded the whole music track through ffmpeg on every save.

**Music was shaped twice.** The route baked fade/trim into a file AND repointed `url`
at it; EXEC-STITCH then loaded that file and applied the same filter again. Split:
`url` = raw source (STITCH owns shaping), new `preview_url` = derivative for the
player only. Confirmed live on E30's track.

**One ordering rule** — `lib/api/asset-ordering.ts`, "never reposition, mark". Nine
hand-rolled comparators across five schemes collapsed into one that ignores status and
selection. Also fixed a badge that read `versions[0]` while the cell resolver picks by
status first (announced "v03 DRAFT" over a playing APPROVED v01).

**Excluded shots were uneditable** — `computeIndex` skips excluded entries and an
excluded cell shares its `playStart` with the next shot, so clicking cell 28 edited 29.
The editor now follows the SELECTED cell; selection and playback are separate.

**Plan-authoring cap + visible HALT.** E30 had 17 `SPC-shot_plan` versions on SH27 with
108 PASS / 9 REVISE. Root cause was NOT a missing counter: the critic leaves a PASSed
plan in REVIEW, while the VGEN fan-out asked "is there an APPROVED plan?" — so a plan
awaiting the Director read as "no plan" and was re-authored forever. `decideFanoutEmit`
now takes two separate signals (author vs generate) with a third "wait" outcome. Added
`PLAN_VERSION_CAP` (5, counts asset versions). Both caps now call `raiseBlockerOnce` —
`regen_cap_halt` previously wrote an audit row and returned, so a capped shot went
silent. UNKNOWN verdicts are cap-coerced like REVISE. Verified live: depth held flat
(SH27=17, total 122) across ~30 min of reconciler ticks.

**Viewer rule (Director's canon).** Click = select a frame to view (ring follows);
approving = a button + status label; a click never writes to the server.

## Commits

- `534ddbf4` fix(pipeline): bound plan authoring, make every cap visible to the Director
- `68e27571` fix(ui): timing autosave, one ordering rule, media that matches its metadata
- `9a5724ee` fix(ui): a click selects a frame to view; approving is a button

## Verify

tsc clean · 1415/1415 tests · replay-pilot 30/30 · stack rebuilt (app :3000, inngest
:8288 both 200, functions synced).

## Open / next

1. **Factory → Adaptation Overview** trends render flat/zero. Director said do not fix
   yet. Lead: the same screen shows red "Failed to load factory data." while the legend
   carries non-zero maxima — investigate the REQUEST first, not the chart.
2. **Viewer rule + prefetch not verified in a browser** — needs the Director's click-through.
3. **ECC is not installed on this laptop** — see [[ecc-global-layer-missing-on-laptop]].
4. E30 budget: $122.42 of $150 spent.

## Lesson worth carrying

I was wrong three times in a row by reasoning from plausible mechanisms instead of
measuring: the "opacity never returns" bug was an off-by-one the Director found, not my
Realtime-clobber theory; the SH44 anchor failure was a byte-level cache overwrite, not
the `drive_web_view_url` null I blamed first. Hash the bytes, read the row, then explain.
