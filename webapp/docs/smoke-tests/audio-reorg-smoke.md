# Smoke #2 — Audio reorg end-to-end (Phase A.2 PR γ verification)

**Date prepared:** 2026-05-08
**Scope:** verify `LT-04` audio block reorganization shipped in Phase A.2 PR γ.
**Status:** READY FOR DIRECTOR — propose-don't-auto-fire (CLAUDE.md §10).

---

## What we're checking

Before Phase A.2, music generation fired AFTER animatic approval. Now it fires
BEFORE animatic creation, so the animatic preview plays WITH the soundtrack —
Director can judge pacing against music BEFORE spending Veo dollars.

The new event chain (ASCII):

```
REV-world_check APPROVE
        │
        ├──► sandystudio/exec-eref/generate-references     (episode refs)
        │
        └──► sandystudio/exec-mgen/generate-music          (NEW — was after animatic)

IMG-episode_ref* APPROVE         AUD-music APPROVE
        │                              │
        └──────────┬───────────────────┘
                   │  (gate: BOTH must be APPROVED)
                   ▼
           sandystudio/exec-edit/create-animatic
                   │  carries musicAssetId in payload
                   ▼
            VID-animatic generated WITH music_url baked into v1 contract
```

## Code anchors (for reference)

- Gate logic: `webapp/app/api/assets/[id]/approve/route.ts` lines 189–258
- MGEN before animatic: `if (ft === 'REV-world_check')` branch (line 195)
- EDIT gate on EREF + music: `if ((ft.startsWith('IMG-episode_ref') || ft === 'AUD-music') ...)` (line 223)
- Animatic baking music: `webapp/lib/agents/runners/animatic-slideshow.ts` (audio_tracks[] + music_url)
- Director escape hatch: `POST /api/episodes/[id]/skip-music` writes synthetic `AUD-music` with `metadata.skipped: true` to unblock if music fails or Director wants silent animatic.

---

## Pre-flight

1. Dev servers up: `next-dev` :3000 + `inngest-dev` :8288 (managed by Claude Preview).
2. Mode 1 (MANUAL) — Director approves every gate.
3. Pick or seed a candidate episode (see below).

### Picking the test episode

We need an episode whose progress is **before REV-world_check APPROVED**. The
new audio reorg only kicks in fresh; episodes that already have an APPROVED
animatic without music will not retro-fire MGEN (idempotent — `hasJob` guard).

Two options:

| Option | What | When to pick |
|---|---|---|
| A | New episode via `/onboarding` or `/series/[id]` "New Episode" wizard | Cleanest — full audit trail from brief |
| B | Existing episode rolled back via SQL: delete its `REV-world_check` APPROVED row + downstream | Faster but messy; only if Director wants to skip script→storyboard |

**Recommended:** Option A. Use a 30s episode brief (small to keep cost low —
Veo runs sequentially at concurrency 1, so a 12-shot episode is ~6 minutes
of generation time post-animatic).

---

## Step-by-step verification

For each step:
1. Director approves the asset in UI (`/inbox` or pipeline view).
2. Operator (you/me) verifies expected jobs landed using the inspection
   commands below.
3. Move on only if green.

### Gate 1 — Brief APPROVED → script

**Expected event:** `sandystudio/exec-sw/generate-script`
**Verify:** `/inbox` should show new SCR-script REVIEW row within ~10s.

### Gate 2 — Script APPROVED → storyboard fan-out

**Expected events:** 3× `sandystudio/exec-sb/generate-act` (act1/2/3).
**Verify:** 3 STB rows REVIEW.

### Gate 3 — All 3 STB acts APPROVED → world check

**Expected event:** `sandystudio/exec-wchk/check-world`
**Verify:** REV-world_check REVIEW row appears.

### 🎯 Gate 4 — REV-world_check APPROVED — THIS IS THE KEY MILESTONE

**Expected events (parallel):**
- `sandystudio/exec-eref/generate-references`
- `sandystudio/exec-mgen/generate-music` ← **NEW, this is what we're testing**

**Verification (run AFTER you click APPROVE in UI):**

```bash
# Check that BOTH EREF and MGEN jobs fired since approval
curl -s "http://localhost:3000/api/jobs?episode_id=${EPISODE_ID}&limit=20" \
  | jq '.data[] | {agent_id, status, created_at}' \
  | head -40
```

**Expected:** see both `EXEC-EREF` and `EXEC-MGEN` rows with `created_at` after
the world_check approval timestamp. Both should be `RUNNING` then `COMPLETED`.

**Failure mode to watch for:** if EXEC-EDIT fires here (animatic prematurely),
the audio reorg is broken — that means the gate at line 223–258 of approve/route
let through without checking `musicOk`.

### Gate 5 — Approve EREF first, leave music REVIEW

**Action:** Approve the EREF asset(s). Do NOT approve the music yet.
**Expected:** `EXEC-EDIT` does **NOT** fire.

```bash
# Confirm no EDIT job created since EREF approval
curl -s "http://localhost:3000/api/jobs?episode_id=${EPISODE_ID}&agent_id=EXEC-EDIT" \
  | jq '.data[]'
```

**Expected:** empty `data: []` (or only stale jobs older than EREF approval).

### Gate 6 — Approve music

**Expected event:** `sandystudio/exec-edit/create-animatic` fires NOW.
**Payload:** must contain `musicAssetId` (the AUD-music asset id).
**Verify:**

```bash
# Find the EDIT job and inspect input_snapshot for musicAssetId
curl -s "http://localhost:3000/api/jobs?episode_id=${EPISODE_ID}&agent_id=EXEC-EDIT&limit=1" \
  | jq '.data[0].input_snapshot'
```

**Expected output snippet:**
```json
{
  "episodeId": "…",
  "storyboardAssetIds": [],
  "musicAssetId": "<uuid of AUD-music>"
}
```

### Gate 7 — Animatic generated → music baked in

**Verify:** open the new VID-animatic asset and check its metadata:

```bash
curl -s "http://localhost:3000/api/assets/${ANIMATIC_ID}" \
  | jq '.data.metadata.animatic_v1 | {music_url, audio_tracks}'
```

**Expected:**
- `music_url` is non-null and points to the AUD-music staging path or Drive URL.
- `audio_tracks` array contains at least one entry with `kind: "music"` and the same URL.

### Gate 8 — Animatic plays with music in Videomatic

**Action:** open the episode page, expand Episode Timeline, hit Play in
AnimaticPlayer.
**Expected:** soundtrack audible during playback.
**Failure mode:** if AnimaticPlayer is silent, check browser DevTools → Network
for the audio fetch + check `<audio>` element src attribute matches `music_url`.

---

## If music fails / Director wants silent animatic

Director escape hatch:

```bash
curl -X POST "http://localhost:3000/api/episodes/${EPISODE_ID}/skip-music" \
  -H "Cookie: <director-session>"
```

**What it does:** writes a synthetic APPROVED `AUD-music` row with
`metadata.skipped: true`. The downstream EDIT gate treats it as approved music
(satisfies `musicOk`), so create-animatic fires immediately. AnimaticPlayer
detects `skipped: true` and renders without audio.

---

## Regression guard — replay-pilot

After the audio reorg branch landed, `replay-pilot.ts` continued to pass 29/29
because it uses legacy mock paths that don't exercise the gate. To future-proof,
add an assertion that REV-world_check approval enqueues both EREF and MGEN
events. Tracked separately — out of scope for this smoke.

---

## Sign-off checklist

- [ ] Gate 4: world_check APPROVED → both EREF + MGEN fire in parallel.
- [ ] Gate 5: EREF-only APPROVED → EDIT does **not** fire.
- [ ] Gate 6: music APPROVED → EDIT fires with `musicAssetId` in payload.
- [ ] Gate 7: animatic metadata has `music_url` + `audio_tracks[]`.
- [ ] Gate 8: AnimaticPlayer audibly plays the music track.
- [ ] Skip path verified separately (POST /skip-music).

When all 6 boxes ticked → Audio reorg is GREEN. Move on to Phase 1.5 backlog.
