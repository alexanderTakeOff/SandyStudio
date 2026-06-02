# Output-Critic Architecture — Mode-3 Autonomy Enabler (DESIGN — needs revision before build)

> Produced by design workflow `wf_3d923094-b56` (2026-06-02), incl. adversarial verify (verdict = **needs_revision**).
> Status: design approved in PRINCIPLE (q14y); build deferred to a dedicated sprint AFTER Topic-3 merge + Topic-2.
> Full raw design + recon in workflow transcript. This doc = the actionable design + the must-resolve list.

## Thesis
Today ONE output-critic exists — `EXEC-EREF-CHECK` (judges generated EREF images inline: Claude Sonnet 4.6 vision, 5-axis 0-100 rubric, verdict APPROVE/REGENERATE/HUMAN_REVIEW, ~$0.008/call, ≤2 retries). Every other PAID artifact (VID-shot, IMG-thumbnail, VID-final_cut) ships to the Director with NO automated quality gate — the Director IS the output-critic, which pins the studio to Mode 1. Generalize EREF-CHECK into a reusable family → Director becomes final-gate + escalation only = Mode 3.

## Pattern (net-new shared `output-critic-core.ts`)
An Output-Critic judges a GENERATED ARTIFACT (not a plan) vs its intent (Plan/Brief) + Bible canon, emits verdict, drives Artist→Critic→regen loop with hard cap + HALT→Director. Distinct from Plan-Critic (EPREV/VPREV judge the plan BEFORE generation).
- Verdict 3-tier (APPROVE / REGEN+reason / HALT) mapped onto existing 4-tier enum so factory.ts verdict→status needs zero change (APPROVE→PASS→REVIEW; REGEN→REVISE→REVISION; HALT→FAIL→REJECTED+escalation).
- Cap = 2 (mirrors GAGAD TD-83). Server-side enforced in runner.ts — never trust LLM to self-limit.
- REUSE: skip-with-fallback error handling, verdict→status mapping, GAGAD cap+escalation, metadata shape, `createAgentInngestFunction` factory, `generateAnthropicVision`. NET-NEW: multi-frame sampling/batching (`frame-sampler.ts`: ffmpeg `-ss/-frames:v 1` → N base64 → one vision call).

## The 3 agents (sibling validators riding existing rows — NO new pipeline rows)
- **EXEC-VGEN-CRITIC** (Video) — judges each VID-shot after Veo/Seedance; 3 frames/5s shot (in/gag/out); axes: character_identity, temporal_coherence, action_clarity, gag_readability, style_match; rides `visual_generator` row; re-fire → EXEC-VGEN. **Recommended FIRST family** (most numerous + most drift-prone + forces the frame-sampler).
- **EXEC-FINAL-CRITIC** (Final cut) — judges VID-final_cut after STITCH; 2 frames/cut-boundary + mid; axes: cross_shot_continuity, audio_sync, pacing, transition_quality, title_card; rides `final_cut`; HALT→Director (publish is Director hard-limit).
- **EXEC-THUMB-CRITIC** (Key art) — judges IMG-thumbnail; single image; axes: sandy_prominence, text_legibility, emotional_hook, brand_palette, on_model; rides `thumbnail_creator` (fills the q11a unstaffed slot); re-fire → EXEC-THUMB.

## Cost (the make-or-break)
Sonnet vision for all (not Opus). Hard checks (resolution/aspect/runtime) run deterministically in code FIRST. Critic ≈ 2-6% of the artifact it guards; ~$0.23/episode no-regen. Real risk = regen loops (each REGEN re-pays full generation). Cap=2 bounds it.

## Mode-3 link
Removes Director from per-artifact judging → critics judge, Director sees only HALTs + final publish gate. TD-39 (PA delivery ack): APPROVE→PA-ack, HALT→PA-escalation — the critic-pass stream is the data source for Mode-3 acks.

## Schema/plumbing (mostly reuse)
3 registry entries + 3 AgentId; **likely NO migration** (0034 already relaxed file_type CHECK → REV-vgen_qc/REV-thumb_qc/REV-final_qc match `REV-*`; `revision_requested` event reused); 3 inngest fns + 3 runner cases + net-new runner modules (core, vgen/thumb/final critic, frame-sampler); gate + factory + pipeline STAGE_FROM_AGENT deltas; 3 system prompts + glossary (same-commit).

## Phased build (~7.5 days; after Topic-3 merge) — VIDEO first
P0 core+frame-sampler (~1.5d) → P1 VGEN-CRITIC (~2d) → P2 live smoke (~0.5d) → P3 FINAL-CRITIC (~1.5d) → P4 THUMB-CRITIC (~1d) → P5 Mode-3+TD-39 wiring (~1d). P0+P1+P2 = first demoable increment (~4d).

---

## ⚠️ MUST RESOLVE before build (adversarial verify — verdict `needs_revision`)

1. **CRITICAL — sync vs async invocation NOT decided.** EREF-CHECK runs INLINE/sync (blocks the save). The design describes VGEN-CRITIC as async (Inngest event-fired after MP4 save). This single choice decides whether Mode 3 is real parallelism or a serial blocking bottleneck. **Must decide before any code.** (→ Director q, next sprint.)
2. **Regen-cost circuit-breaker.** Cap=2 bounds per-shot, but no per-episode regen budget cap. Veo 5s ≈ $0.75; 3 shots hitting cap ≈ +$6.93. Add a per-episode regen-cost ceiling (e.g. max $5) that auto-HALTs, or require Director approval for regen #2. Define whether cap resets on provider-switch.
3. **Re-fire target on REGEN** — design says "let critic classify render-defect (→VGEN) vs plan-defect (→VANIM)." Adversarial recommends: always re-fire the GENERATING agent (VGEN), let the artist decide if it needs a re-plan — the critic sees frames, not the plan's causation.
4. **Cross-shot continuity** — boundary-frame sampling (last K + first K+1) can't judge inside-shot body/lighting continuity. Needs shot-PAIR critic or fuller sampling. FINAL-CRITIC's continuity claim is overstated.
5. **Upscale re-review** — defined only for THUMB; undefined for VGEN/FINAL (shot judged at 720p then upscaled to 4K → critic never saw the 4K).
6. **Director waiver (TD-74) for a HALT** — flow undefined (can Director override an OUTPUT-CRITIC HALT → advance?).
7. **Budget tracking wiring** — regen costs must subtract from episode budget via activity_event metadata so PA/BOARD-FIN sees overflow.
8. **Critic quality SLO** — no false-REGEN rate target / eval harness. Define <5% false-regenerate SLO + eval before Mode-3 launch.
9. **Vision batching cost reality** — verify whether Anthropic charges per-image-in-batch (3 frames = 3×$0.005?) vs per-request.
10. **Mode-gate runner logic** — Mode 1-2 "run critic but don't auto-advance" needs explicit mode-aware verdict-flip in runner.ts (not in current code): mode<3 + APPROVE → REVIEW (await Director); mode≥3 + APPROVE → auto-advance. Show the cap-enforcement pseudocode in runner per GAGAD's runner.ts:1180-1189.

## Open design questions for Director (next sprint)
- **THUMB-CRITIC always-on vs Mode-gated?** (rec: Mode-gated — thumbnails cheap, keep Director's creative cover-choice in Mode 1-2; VGEN+FINAL always-on.)
- **VGEN regen re-fire: critic classifies render-vs-plan, or always →VGEN?** (adversarial: always →VGEN.)
- **Video judging frame count: 3 (rec, ~$0.012/shot) vs denser 5-8?** (rec: start 3, raise if drift slips through on smoke.)
- **+ the CRITICAL sync-vs-async decision above.**
