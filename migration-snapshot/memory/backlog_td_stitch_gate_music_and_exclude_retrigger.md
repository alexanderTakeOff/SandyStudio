---
name: backlog_td_stitch_gate_music_and_exclude_retrigger
description: "Stitch-gate must also require music loaded + re-evaluate on shot exclusion, not only on approval"
metadata: 
  node_type: memory
  type: project
  originSessionId: eef01911-d8a4-42a2-ba90-6c1ce98f5d8a
---

Stitch auto-fire gate hardening (Director, 2026-07-03, during E14 «Мадам Парфюм» live run).

**Current behaviour** (`lib/agents/next-events.ts` ~1288–1340): on any `VID-shot`
approval event, `computeNextEvents` checks «all LIVE shots APPROVED?» (already
excludes `excluded_shot_ids`/≤0.5s via `getExcludedShotIds`/`isDeletedShot`) → fires
`sandystudio/exec-stitch/assemble-episode`. So «approval of any shot re-checks,
accounting for excluded» ALREADY EXISTS.

**Two gaps Director wants closed:**
1. **Exclusion doesn't re-trigger the gate.** E14: all 19 videos were APPROVED
   *before* SH16 was excluded (fal/seedance repeated 720s timeouts). Setting
   `excluded_shot_ids` does NOT emit a VID-shot event → gate never re-evaluated →
   stitch didn't auto-fire (had to trigger EXEC-STITCH manually via Polina's
   `triggerAgent`). Fix: after the kebab-toggle / 0.5s / `excluded_shot_ids` write,
   re-run the same stitch-gate check.
2. **Gate ignores music.** Condition today = only «all live shots APPROVED». If
   `AUD-music` were missing it would still stitch — silently, no music. Director:
   add «music loaded (min) / APPROVED» to the gate; if absent → don't stitch, signal.

**Target invariant:**
`stitch ⟺ (all live shots, excluded honoured, APPROVED) AND (music loaded)` —
re-evaluated on ANY shot approval AND on shot exclusion.

Director's framing: «утверждение любого кадра должно запускать проверку — все ли
утверждены, учитывая исключённое, и тогда запускать. А ещё проверить, что музыка
загружена». Wants it as a clean separate PR (run was closed by result first).

Related: [[backlog_td_05s_delete_flag]] (excluded_shot_ids SSOT + kebab toggle, aa52384),
[[session_2026-07-03_e14-parallel-run]] (the run that surfaced this).
