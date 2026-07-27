# Backlog — TD-32 + TD-33 (continuity + variant visibility)

> Recorded 2026-05-22 during SS-S15-E01 smoke per Director directive
> «запиши в память». Both items emerged from Director's product
> observations during the smoke session and are systemic — they
> generalize across all future episodes, not just S15-E01.

## TD-32 — Surface AI-rejected IMG attempts as sibling asset rows

**Trigger:** Director 2026-05-22 — «отклонённые картинки которые отклонил
автомат я не вижу. Можно их тоже выставлять сюда чтобы я по крайней
мере видел черновую работу. Мы же не знаем, вдруг они ошибаются».

**Goal:** every attempt produced by the AI-retry loop in EXEC-EREF v2
becomes a first-class `IMG-episode_ref` asset row sitting next to the
final one in the existing grid. Click → existing AssetDetailDrawer →
existing review pane → Director can override AI's rejection via the
existing approve flow. **Zero new UI components, zero new endpoints.**

**Status:** backlog, ~3-4h, 1 atomic commit. Trigger after S15-E01
smoke completes (Director: «можно запускать генерацию всех оставшихся
… поправить выборочно если что-то будет не то»).

### Why infrastructure is already ~80% done

- `metadata.shot_reference.generation_history[]` in `lib/api/shot-reference.ts`
  already stores every attempt with image_url, drive_file_id, cost,
  prompt, references_used, AI reviewer verdict.
- `app/api/assets/[id]/regenerate-image/route.ts` already has a
  `{restore_version}` action that swaps staging_path / drive_* to a
  prior history entry — no paid call, just pointer swap. That's the
  override mechanism, already wired.
- AssetDetailDrawer is the Phase-F-QC-console Sprint Designer
  designed for; it renders `shot_reference` + reviewer notes already.

### What changes

| Layer | Change | Effort |
|---|---|---|
| backend | `episode-references.ts` loop: persist each attempt as its own row instead of one row at end. AI verdict APPROVE → status REVIEW; REGENERATE → AUTO_REJECTED; HUMAN_REVIEW → REVIEW | 1-2h |
| DB | migration: extend `assets.status` CHECK to allow `AUTO_REJECTED` | 10 min |
| frontend | `AssetCard` for AUTO_REJECTED: opacity 0.55 + badge «🤖 AI: regenerate». Click still opens drawer | 30 min |
| tests | per-attempt persist invariant; AssetCard render; approve-route override demotes previous APPROVED of same shot | 1h |

### Edge cases to verify

- Two APPROVED for same shot when Director overrides — approve-route
  must demote the previous APPROVED (already exists; verify scope is
  per-shot-id, not just episode-wide).
- Downstream consumers (Animatic, VGEN, STITCH) — must read only
  status=APPROVED rows; AUTO_REJECTED siblings must not feed downstream.
- `listPendingApprovals` / `listShots` — should show AUTO_REJECTED in
  UI (Director's whole point), but exclude from downstream queries.
- Cost ledger — already per-attempt in `shot_reference.generation_history`.
  Don't double-count.
- Drive files — each attempt already gets a unique upload via
  `persistBinary({localHint: 'eref-<slug>'})`. No collision.

### Bonus signal value

Tracking how often Director overrides AI verdict gives a calibration
signal for the reviewer's prompt: which `EREFReviewIssueArea` does
Director disagree with most? `emotion`? `composition`? Feed into
Skill Editor when adjusting `lib/agents/runners/eref-check.ts` prompt.

---

## TD-33 — Inter-shot continuity anchors (video AND references)

**Trigger:** Director 2026-05-22 — «каждый кадр рисуется без привязки
к следующему к предыдущему кадру, иногда возникают истории с тем что
что-то стоит не там или трюмо или герои. Хорошо чтобы предыдущий
кадр тоже учитывался. Не 100%, а выборочно — иногда переход first→last
frame, иногда нет. И когда генерируется референсы наверное тоже это
было бы полезным».

**Architectural distinction Director surfaced:**

TD-30 (landed `d376ce3`, 2026-05-21) gave us **spatial** continuity for
references: Designer finds the latest APPROVED IMG-episode_ref in the
**same location** for this episode and embeds it as a 4th
multi-image anchor. This stabilises trumeau / furniture / set
dressing across shots in the same room.

What TD-33 adds is **temporal** continuity, on two parallel axes:

### Axis A — Video (Vanim → VGEN end-frame)

Provider infrastructure is already there:

```ts
// lib/agents/providers/video-gen-multi.ts
MultiVideoGenInput.endImageBase64?: string;

// Seedance:
SEEDANCE_CAPABILITIES.supports_end_image = true;  ✅

// Veo:
VEO_CAPABILITIES.supports_end_image = false;  ❌ (Veo ignores)
```

Seedance provider proxies endImage → fal API's `end_image_url`. So a
single shot can morph from start frame to end frame across its
duration. **But the runner side never sets it** — Vanim's Plan doesn't
have an end_frame_strategy field, and exec-vgen never passes
endImageBase64. Capability declared, not consumed.

**Selective per-shot strategy** lives in Vanim's Plan JSON:

```json
"end_frame_strategy": {
  "mode": "none" | "next_shot_first_frame" | "explicit_asset",
  "asset_id": null | "uuid",
  "rationale": "smooth pan into SH09 — same room, no narrative cut",
  "applicable_provider": "seedance-fal-img2vid"
}
```

Vanim decides per shot based on:
- same location as next shot? → consider `next_shot_first_frame`
- hard narrative cut to new location? → `none` (rapid scene transition,
  no continuity needed)
- character outfit / pose held across cuts but location changes? →
  `explicit_asset` pointing at the relevant prior IMG

If `mode != 'none'` AND chosen provider is Veo (doesn't support
end_image), Vanim's Plan should add a policy_note suggesting
provider switch to Seedance for this shot — runner-side warning, not
auto-switch.

### Axis B — References (Designer extends scene_continuity)

Director's afterthought — **same idea applied to IMG-episode_ref
generation**. Currently TD-30 anchor is spatial (same location). The
temporal axis is a different anchor type: **immediately preceding shot's
IMG**, regardless of location, when narrative continuity holds.

These two axes often coincide (prev shot is usually in the same
location), but not always. Example:

| Shot | Location | Spatial anchor (TD-30) | Temporal anchor (TD-33) | Overlap? |
|---|---|---|---|---|
| SH08 | bedroom | SH07 (last bedroom APPROVED) | SH07 (prev shot) | yes |
| SH09 | bedroom | SH08 | SH08 | yes |
| SH10 | exterior | (none, first exterior) | SH09 | NO |
| SH11 | bedroom (cut back) | SH09 | SH10 (exterior!) | NO — bad anchor |

For SH11, the temporal anchor is counter-productive — Anvil exterior
shouldn't influence Sandy bedroom. So temporal continuity must be
**Designer-decided per shot**, not pipeline-auto.

### Unified schema for Designer's Plan

Today's Plan has:
```json
"scene_continuity_anchor_asset_id": "uuid-or-null"  // TD-30
```

Extend to a list of typed anchors so Designer can declare 0..N:

```json
"continuity_anchors": [
  {
    "kind": "spatial_same_location",
    "asset_id": "...",
    "rationale": "trumeau placement carried over from SH07"
  },
  {
    "kind": "temporal_previous_shot",
    "asset_id": "...",
    "rationale": "Sandy's pose continues from prev shot, no cut"
  }
]
```

`MAX_REFS=16` in openai-edits-multi.ts; we use identity + location +
style + 2 continuity = 5 refs. Well under cap. Designer chooses 0, 1,
or both anchor kinds per shot.

### Why TD-33 is one combined item, not two

The Vanim end-frame strategy (axis A) and Designer multi-anchor schema
(axis B) share:
- Same architectural shape (Plan body field declaring an optional anchor
  with rationale)
- Same selective per-shot decision (Vanim / Designer rationalise in Plan)
- Same loader pattern (read APPROVED IMG asset bytes via
  `readBibleImageAsBase64` or existing helpers)
- Same null-fallback safety (graceful degradation when anchor missing)

Implementing them as one feature keeps the Designer / Vanim Plan
schemas symmetric. Splitting later if scope grows is fine, but
landing together is cheaper.

**Status:** backlog, ~5-6h combined, likely 2 commits (one Designer +
EREF, one Vanim + VGEN). Trigger after current S15-E01 smoke +
Final Cut review — Director wants to first see how jarring or smooth
the current cuts feel with only spatial-anchor continuity.

### What changes (combined)

| Layer | Change |
|---|---|
| `lib/api/shot-reference.ts` | Extend `ReferenceUsed.kind` union (already has 'scene_continuity'; add 'scene_continuity_temporal' or rename existing to 'scene_continuity_spatial' for clarity) |
| `lib/agents/runners/episode-reference-designer.ts` | Plan JSON schema: replace single `scene_continuity_anchor_asset_id` with `continuity_anchors[]` typed list. Backward-compat: still parse old single-field shape into list of one |
| `lib/agents/runners/episode-references.ts` | Loader extracts both anchor types; `buildMultiImageRefs` appends each separately |
| `lib/agents/runners/animator.ts` | Plan schema: `end_frame_strategy` block |
| `inngest/functions/exec-vgen.ts` single-shot path | Read Plan's end_frame_strategy, load asset bytes, pass to MultiVideoGenInput.endImageBase64 if provider supports it |
| `lib/agents/providers/video-gen-multi.ts` | No change — capability already exposed |
| migrations | none — all Plan-body JSON changes |

### Tests

- `findLatestApprovedImgByLocation` already covered (TD-30)
- New: `findApprovedImgForPreviousShot(episodeId, shotIdSequence)` —
  read storyboard production order, find prev shot, return its IMG
- Designer-runner test: Plan JSON emits multi-anchor list with both
  kinds when applicable
- Executor test: 5 refs in multi-image array when both anchors set
- Vanim test: end_frame_strategy parsed; exec-vgen test mocks
  Seedance and asserts end_image_url makes it through

---

## Cross-reference

- TD-30 (2026-05-21): spatial-anchor for EREF — landed in `d376ce3`
- TD-31 (2026-05-21): context-usage reminder rule — landed in global rules
- TD-32 (2026-05-22 today): rejected attempts as siblings — this file
- TD-33 (2026-05-22 today): temporal continuity (video + ref) — this file

Both await S15-E01 smoke completion before pickup.
