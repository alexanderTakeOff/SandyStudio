# E16 → Autonomous-Factory Fix Plan

> Root-cause fixes surfaced by the E16 live smoke (2026-07-05). All defects in
> `E16-run-defects.md` (DEF-01…08). Approve/adjust before implementation.
> Current safe state: **Inngest worker FROZEN** (killed), E16 at **31/32 refs**, no video leak
> (2 stray videos SH05/SH06 in REVIEW, ~$1-6). Polina frozen at cap ($30.42). Next dev server up.

## The three roots (all confirmed live)

1. **Plan-version explosion (v7).** Director's law: >2 versions = a hole, not a re-author.
   Root: `PLAN_REGEN_CAP` (2-3) is NOT enforced across the multi-actor re-author paths
   (Polina `regenerateRefPlan` + manual triggers + chain retries each mint a version, no shared
   counter) AND the **anchor-stale loop** — re-authoring a canon-v02-staled plan does not clear the
   staleness, so it re-authors again → v3…v7. → *Fix at the source, not by writing a fresh plan under
   old conditions.*

2. **Auto-cascade ref→video with no reserved gate.** `approved ref_image → Video Designer → shot_plan
   → (auto-approve) → Video Artist (paid)`. Nothing holds "pause after refs". Polina Mode-3 auto-approve
   compounds it. This is the runaway that lit up "all buttons" and started paid video.

3. **Inngest chain unreliable + no recovery.** Silent server death (DEF-06), dropped critic/artist steps
   (DEF-05), critic no-op on stale `planAssetId` (fixed empirically by firing on the LATEST plan),
   stuck `dispatch_intent` claims (DEF-08), and the dev queue **persists/replays across restart** (so
   unfreezing resumes the cascade — verified).

## The fix (Director's traffic-light model as the spine)

### A. Reconciler = traffic-light approve (Mode-3 correct)
- 🟢 all critics PASS → code bulk-approve. 🟠 REVISE/uncertain → Polina. 🔴 caps-exhausted → Director.
- **Plan** stages (ref_plan/shot_plan) gate on critic PASS (EPREV/CREAD). **Visual artifacts** (ref_image,
  video) have NO auto-critic → they are **reserved visual gates** (Polina/Director eyeball), NOT blind
  code-approve. Fix `reconcile.ts`: drop the "no gating critic → approve" branch for ref_image/video;
  route them to a reserved gate. (Files: `lib/agents/reconcile.ts` `STAGE_HAS_CRITIC` + the mechanical
  branch; `production-plan.ts` reserved-gate set — add a `video` reserved gate / "refs-only" plan mode.)

### B. Enforce PLAN_REGEN_CAP + kill the anchor-stale loop
- One shared per-shot re-author counter honored by EVERY path (Polina tool, manual trigger, chain).
  At cap → HALT + escalate (🔴), never author v+1. (Files: `chain-flags.ts`, `eref.ts` tool,
  `episode-references.ts` runner, dispatch guard.)
- Anchor-stale: a re-author MUST clear staleness (pick up canon v02 anchors) or HALT — never loop.

### C. Inngest recovery + safe queue purge
- On server (re)start: reset non-terminal `dispatch_intent` claims (crash-recovery), and provide a
  **queue purge** so a frozen cascade does NOT replay on restart. (This is what blocks a clean SH30 finish.)
- Critic idempotency: `review-ref-plan` must resolve the shot's CURRENT plan (not a passed stale id) and
  be safely re-fireable. (Files: `creative-readability-critic.ts` `loadPlan`, the exec-cread fn wrapper.)

### D. Finish SH30 → 32/32 (safe, after C's purge exists — or manual now)
- Purge the pending video-cascade events → restart Inngest clean → fire ONLY SH30 ref critic on its
  latest plan → renders → 32/32. Approve NOTHING downstream → no video. Delete the 2 stray videos.

## Verification
- `tsc --noEmit` clean · `npm test -- --run` green · unit tests for: traffic-light approve (green/orange/red),
  PLAN_REGEN_CAP enforcement + HALT, reserved video-gate (approved ref does NOT fire video artist).
- Live: enable `MECHANICS_AUTO_ADVANCE` on a CLEAN episode from the start with pilots reserved → observe
  `reconcile/auto-approved` on greens, HALT on caps, video held at the reserved gate. (The smoke E16 missed.)

## Order
C (recovery/purge, unblocks everything + finishes SH30) → A (traffic-light gate, stops the cascade class) →
B (version-explosion cap). Then the real MECHANICS_AUTO_ADVANCE smoke on a clean episode.
