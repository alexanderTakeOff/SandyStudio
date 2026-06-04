# RFC — Gate-Hardening for the Generation Pipeline (2026-06-04)

Status: APPROVED by Director (q23a→Phase1, then Phase2, then Phase3 / q24 INVALIDATED / q25 auto-bounce ON / q26 OUTPUT-critic sync-vs-async TBD in Phase 3). Director delegated full autonomous execution. Mode ===5===.

## Root pathology (the one cause behind ~20 defects)

The codebase learned the **"no silent fallback"** lesson once (TD-78: "Refusing silent storyboard fallback" — VGEN prompt path) and applied it surgically. Every defect below is that same lesson **un-applied one layer over**: in reference-byte loading, provider results, regenerate routes, dispatch gating, budget, idempotency. Not 20 bugs — one pattern × 20.

## Invariants the generation subsystem MUST hold

- **I1 One resolver** — exactly one function resolves a shot's generation inputs; all paths use it.
- **I2 Single-approved (write-side, Director's correction)** — at most ONE APPROVED asset per (shot, slot); approving one demotes the rest to **INVALIDATED** at approve-time. No "newest-of-many" read logic.
- **I3 Loadability** — referenced media resolves to bytes or the run HALTS loud (never silent null → provider 422/500).
- **I4 Gate universality** — every paid dispatch passes the same readiness gate (kill the hand-rolled VGEN/EREF factory-bypass).
- **I5 Provider contract self-enforced** — img2vid can NEVER run imageless (`requires_reference_image`); provider resolved first, clamps/aspect/duration from its capabilities; plan authoritative; unknown vocab = REVISE.
- **I6 Loud observability** — every failure emits `agent_failed`; stuck-job watchdog; no console-only failures.
- **I7 Budget before spend** — ceiling checked + atomically incremented BEFORE the paid call.
- **I8 Idempotency** — retries/re-approves never double-generate (content-hash key; generate in its own step separate from persist).
- **I9 Auto-bounce** — REVISE→author→cap=2→HALT→Director Inbox, generalized to VPREV/EPREV/SREV, active in Mode 1 (Director is NOT the first defect router).
- **I10 Output quality** — rendered frame judged for identity/intent (OUTPUT-critic); camera-orbit + quality_tier↔role enforced deterministically, not only by an LLM.

## Two layers (merge of structural audit + the "caveman" process material)

- **L-I Integrity + Money** (I2,I3,I4,I5,I7,I8): single-approved + DB partial-unique-indexes per slot; one loud Drive-aware resolver; one gated/pre-budgeted/content-idempotent paid path; provider self-enforcement.
- **L-II Process + Quality** (I3 preflight, I9, I10): media-reachability preflight in the gate (cheap first win); generalized auto-bounce loop; OUTPUT-critic (frame-sampler → vision).

## Phases (build order)

- **Phase 1 (money + garbage — FIRST):** single-approved+INVALIDATED+dedup+indexes · one loud resolver (+ fix regen-route `readBibleImageAsBase64` /staging-only → `readAssetMediaAsBase64`) · pre-spend atomic ceiling + idempotent paid step · media-reachability preflight in gate.
- **Phase 2 (process):** generalized auto-bounce (`critic-loop.ts`, wire VPREV/EPREV/SREV, Mode-1 + cap→HALT→Inbox) · provider contract self-enforcement (`requires_reference_image`, provider-first param resolution) · fold hand-rolled VGEN/EREF into the gated path.
- **Phase 3 (output):** OUTPUT-critic core + frame-sampler + VGEN-CRITIC (reuse the auto-bounce loop). q26 sync/async decided on the live smoke.

## Top latent defects (file:line) found by the adversarial hunt — fixed across phases

- Retry RE-spends paid generation (generate + persist in one step) — runner.ts step boundary.
- Re-approve double-fires fan-out (`hasJob` keyed on `asset.updated_at`) — approve/route.ts.
- Ceiling checked AFTER spend + read-modify-write race on `budget_spent` — budget.ts:127, exec-vgen.ts.
- Plan-embedded `start_anchor.asset_id` loaded by id with no status check → renders INVALIDATED frame (aggravated by today's auto-demote) — runner.ts:2050, vgen-shot-helpers getAssetImageBase64ById.
- `readBibleImageAsBase64` /staging-only → regen routes silently drop refs (img2vid→t2v / identity drift) — openai-image-edit.ts:141 used at regenerate-video:215/236, regenerate-image:449.
- img2vid never enforces reference image (capability "accepts"≠"requires") — fal-seedance.ts:247, video-gen-multi.ts.
- Plan aspect ratio silently discarded; Seedance duration clamped to 8 provider-blind — runner.ts:1750,1810.
- Anchors/shot_plan/VID-shot/ref_plan/SBL have NO DB unique index (only EREF, migration 0024) → concurrent double-approve drift.
- Hand-rolled execVgenStart/execVgenSingleShot/execEref bypass validateAgentInputs + enforceMode + agent_failed — exec-vgen.ts:157,493; exec-eref.ts:43.

## Verify gate (CLAUDE.md §12 Ritual 3, after each phase)

`npx tsc --noEmit` · `npx vitest run` · `npm run replay-pilot` — publish counts. Paid live-smoke (Veo/Seedance) only on explicit Director "go" (CLAUDE.md §10) — NOT auto, even under autonomous build.

## Not touched
Hard limits (publish / LOCKED / budget ceiling value / mode change) stay Director-only. Critics never get APPROVE — only PASS→REVIEW.
