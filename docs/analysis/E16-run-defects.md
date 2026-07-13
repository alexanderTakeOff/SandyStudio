# E16 «Sandy in The Gym» — Run Defect Log

> Data sheet for the live E16 run (Тео = Director-proxy driving Polina). All failures /
> troubles logged here for analysis, per Director's run directive.

---

## DEF-01 — Director-uploaded canon reads as "Media unreachable" to the agent gate

- **When:** 2026-07-05 ~19:13
- **Symptom:** `[agent_failed] Reference Artist failed — Media unreachable for EXEC-EREF: 0934eada-5754-4c83-97a9-3d061a13c013`
- **Stage:** EXEC-EREF (Reference Artist) media-reachability preflight, blocking E16 SH01/SH02 references.
- **Asset:** `SS-S15-SBL-object_gym_equipment-v01-LOCKED.png` (new gym-equipment canon, LOCKED), series `45351141…`.

### Root cause (verified against disk + DB)

The canon's current bytes (v4) were a **Director upload**. The upload handler
`app/api/assets/[id]/upload/route.ts` persisted them **differently from generation**:

| | Generation (`persistBinary`) | Director upload (old) |
|---|---|---|
| cache filename | canonical (`…-v01-DRAFT.png`) | hash-suffixed (`…-v01-DRAFT-d9108….png`) |
| Google Drive | uploaded → `drive_file_id` set | **not uploaded → `drive_file_id: null`** |
| `staging_path` | `/api/media/<canonical>` | `/api/media/<hash-suffixed>` |

The canonical agent reader `readAssetMediaAsBase64` (`lib/media-cache.ts`) resolves bytes in order:
**(1)** canonical filename in cache → **(2)** Drive by `drive_file_id` → **(3)** legacy `/staging/…`.
The uploaded canon matched **none** → `assertMediaResolves` reported it dead → EXEC-EREF HALT.
Generated-then-locked canons survive only because their `drive_file_id` rescues them via path (2).
The **UI showed the image fine** (the `/api/media/[id]` route resolves the hash-suffixed name directly),
so the defect was invisible until an agent tried to read the bytes.

### Fix (Director directive: «при аплоуде отправлять туда же куда при генерации и имя давать»)

Routed the upload handler through the same canonical `persistBinary` generation path
(canonical SS filename in cache + Google Drive), so uploaded bytes resolve identically to generated
bytes for every downstream agent reader. Subtractive: deleted the bespoke hash-suffix persistence,
reused the one existing path.

- `app/api/assets/[id]/upload/route.ts` — persist via `persistBinary`; row + history now carry real
  `drive_file_id` / `drive_web_view_url`.
- `lib/api/upload-cache.ts` — added `canonicalUploadFilename` (canonical stem + real ext, no hash).
- **Backfill:** `scripts/backfill-uploaded-canon.ts` re-persisted the existing `0934eada` bytes →
  `drive_file_id=1oXm1WzCTu…`, canonical `staging_path`. Verified: `assertMediaResolves` over all 33
  LOCKED SBL image canons → `ok=true, dead=0`.

### Follow-up (open)

- `upload-music/route.ts` + `upload-music-direct/route.ts` share the old hash-suffix pattern → same
  latent bug for uploaded audio consumed by a gate. Route through `persistBinary` when convenient
  (no audio-gate failure observed yet).

---

## DEF-02 — Reference Artist did not auto-start after Designer + Critic approval

- **When:** 2026-07-05, E16 reference stage (Director observation).
- **Symptom:** after the Reference **Designer** plan was approved AND the Reference **Critic** was approved,
  the automatic Reference **Artist** (image generation) did **not** fire. Director had to nudge Polina to
  trigger it manually (`fanoutShots(stage:reference,…)`).
- **Impact:** low-severity process gap — Polina has the manual trigger, so the run proceeds; but the Director's
  own UI has no per-line "Generate" control, so without Polina he is stuck.
- **Fix direction:** (a) repair the auto-chain `critic-approved → artist`, or confirm manual start is intended;
  (b) surface a per-version "Generate/Regenerate" button in the kebab dossier (see memory
  `backlog_td_kebab_plan_critic_lines`). Both → TD after E16 run.

## DEF-03 — Canons have no UNLOCK control in the Library UI

- **When:** 2026-07-05, E16 (Director observation).
- **Symptom:** LOCKED SBL canons have no Unlock button; unlock is a Director hard-gate but the UI lacks the
  control. In E16 the root fix + backfill made unlock unnecessary, but the missing control is a real gap.
- **Fix direction:** add an Unlock button (with a warning) on canon cards → TD after E16 run
  (memory `backlog_td_canon_unlock_button`).

## DEF-04 — Mode-3 auto-approved a creative gate + drove video against a "pause video" goal

- **When:** 2026-07-05 ~17:00, after E16 switched to Mode 3 (DELEGATED).
- **Symptom:** Polina auto-**approved SH07 video** (Critic PASS) without the Director, and auto-fired **SH03
  Video Artist**, moments before the Director's new goal ("fanout refs then PAUSE, no video") took effect.
- **Cause:** bold Mode 3 delegates all non-hard-limit gates to EXEC-DIR-AI → creative video-approval gates
  auto-pass; plus auto-react lag meant an older "continue other shots" instruction executed after the new
  pause-video goal was posted. Matches the known SH20 (2026-07-04) Mode-3 bold-approve cascade risk.
- **Impact:** low (SH07/SH03 are legit shots), but it removed the Director's video-approval and briefly
  worked against the active goal. Steered Polina back to "refs only, no new video."
- **Fix direction:** a "hold / show-only" that survives bold Mode 3 (memory
  `Polina bold-approve overrides «покажи не аппрувь»`); tighter goal-supersede so a new directive cancels
  in-flight old-context actions. TD after E16.

## DEF-05 — Reference sweep stalls after Designer (Inngest tail-drop; Critic/Artist never fire)

- **When:** 2026-07-05 ~17:06–17:12, during the 26-shot reference fan-out.
- **Symptom:** Reference Designers ran for all fanned shots (plans reached ~20 shots), but **zero Reference
  Critic and zero Reference Artist events fired** for ~5 min → ref images frozen at 6/32, only the 6 pre-existing
  plans APPROVED. Chain silently stuck after the Designer stage.
- **Cause:** matches E15 root cause (memory `inngest_dev_router_unreliable_no_selfheal`) — the Inngest dev
  router drops the tail of a batch / jams the concurrency lane; fire-and-forget with no reconciliation → shots
  wedge after one stage. Compounded by DEF-02 (critic→artist auto-chain doesn't fire even when reached).
- **Impact:** HIGH for the "all 32 refs" goal — without intervention the sweep never completes.
- **Workaround this run:** steered Polina (Mode 3) to walk the State Matrix and manually drive each stuck shot
  Critic → approve plan → Artist, rather than wait for auto-progression.
- **Fix direction:** the gap-fill reconciler + cron pacing designed after E15 (memory
  `2026-07-05-e15-inngest-router-rootcause-session`) — implement behind `MECHANICS_AUTO_ADVANCE`. TD.

## DEF-06 — Dev server died silently (Turbopack panic on corrupt .next), froze the whole run

- **When:** 2026-07-05 ~17:05, ~40 min undetected.
- **Symptom:** Next dev server crashed — `FATAL TurbopackInternalError: Next.js package not found`,
  `PUT /api/inngest → 500`; Inngest could not invoke functions → entire pipeline wedged at 7/32 refs. UI still
  looked alive (cached), so the failure was invisible; no reconciliation surfaced it.
- **Cause:** corrupt `.next` Turbopack cache (node_modules were intact — `next`/`sharp`/`esbuild` all
  resolvable). Matches memory `dev_workflow_no_build_during_dev` (build-while-dev corrupts `.next`).
- **Recovery (orchestrator ops, no code):** killed the Next-dev process tree (PIDs), `rm -rf .next`, restarted
  `npm run dev`. Inngest re-registered (`PUT /api/inngest 200`) and drained the queued backlog. `npm install`
  NOT needed. Per memory `eref_generation_needs_stable_server`, a stable `next build && npm start` is the
  durable answer for long EREF runs — dev proved fragile mid-sweep.
- **Fix direction:** run the pipeline on a stable server for real sweeps; add a liveness/heartbeat that surfaces
  a dead worker instead of silent wedge.

## DEF-07 — Mass Reference Artist failures from plan-version race (STALE / INVALIDATED plans)

- **When:** 2026-07-05 ~17:58–18:01 — 17 artist failures in one burst.
- **Symptom:** `EXEC-EREF: PLAN_ANCHOR_STALE` and `Plan asset <id> status="INVALIDATED"` — artists fail because
  the plan they render is no longer the current/approved version.
- **Cause:** Polina concurrently re-ran Reference Designers (minting new plan versions → invalidating the old)
  AND fired `regenerateImageFromPlan` against captured, now-stale `planAssetId`s. Race between re-plan and
  render. Firing by explicit stale `planAssetId` instead of resolving the shot's current approved plan.
- **Workaround:** steered Polina — stop re-running designers; ensure one current APPROVED plan per shot; fire
  the artist by `shotId` only (no stale `planAssetId`); one calm pass, no re-touch until the artist completes.
- **Fix direction:** `regenerateImageFromPlan` should resolve the shot's current approved plan when given a
  stale/invalidated `planAssetId` (or reject early with a clear "re-plan first"); guard against designer/artist
  races on the same shot. TD.

## DEF-08 — Last ~10 refs wedged: stuck dispatch_intent claims + dropped critic/artist chain

- **When:** discovered 2026-07-05 ~19:05 while trying to finish 22→32.
- **Symptom:** for SH18/20/21/23/25/28/30/31/32 (+SH16), NO pipeline event produces effect — direct Designer
  re-trigger yields no activity, direct `review-ref-plan` critic fire is a silent no-op, direct plan approve →
  HTTP 400. The shots are frozen mid-pipeline.
- **Root (from `dispatch_intent` table):** the server crash (DEF-06) + the churn left claims in mixed state —
  3 `claimed` (non-terminal → block re-dispatch), 10 `failed` (EXEC-EREF artist, anchor-stale), 47 `done`.
  Re-authored Designers DID complete for some (SH16/21/25/28 `done`) so fresh plans exist, but the
  **critic→artist chain never fires** (DEF-05 drop) and the critic is not idempotent on direct re-fire, so
  nothing advances. Manual approve rejects (400) because the plan/state is inconsistent.
- **Impact:** the last ~10 refs cannot be completed by any live-poke; requires code repair.
- **Fix direction (the real work):** (1) reconcile/reset stuck `claimed` dispatch_intent rows on server
  restart (crash-recovery); (2) make the ref-plan critic idempotent + able to be re-fired; (3) gap-fill dropped
  chain steps (the E15 reconciler TD); (4) the traffic-light approve model (memory
  `backlog_enable_mechanics_auto_advance_smoke`). All feed the MECHANICS_AUTO_ADVANCE fix.
