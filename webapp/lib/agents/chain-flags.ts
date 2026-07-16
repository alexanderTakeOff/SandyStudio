// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/chain-flags.ts
// Single source of truth for optional-chain feature flags. Import from here
// rather than duplicating flag-parsing logic across modules.
// Anti-additivity: moved from next-events.ts (Phase 3, C1-Gate sprint 2026-06-10).
// ──────────────────────────────────────────────────────────────────────────────

/**
 * DESIGNER_CHAIN_ENABLED — controls EREF Designer fan-out.
 * When on: REV-world_check fans out one exec-eref-designer/plan event per shot.
 * When off: legacy exec-eref/generate-references path.
 */
export function designerChainEnabled(): boolean {
  const v = process.env.DESIGNER_CHAIN_ENABLED;
  if (!v) return false;
  return v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'on';
}

/**
 * ANIMATOR_CHAIN_ENABLED — controls Animator Plan authoring + C1 gate.
 * When on: VID-animatic.APPROVED fires exec-vanim/plan per pilot shot;
 * single-shot without a plan is blocked by the C1 gate in exec-vgen.
 * When off: legacy direct fire-to-VGEN path.
 */
export function animatorChainEnabled(): boolean {
  const v = process.env.ANIMATOR_CHAIN_ENABLED;
  if (!v) return false;
  return v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'on';
}

/**
 * READABILITY_GATE_ENABLED — controls EXEC-CREAD Creative Readability gate.
 * Default off; Phase 3 introduces the flag definition, Phase 4 wires it.
 */
export function readabilityGateEnabled(): boolean {
  const v = process.env.READABILITY_GATE_ENABLED;
  if (!v) return false;
  return v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'on';
}

/**
 * CONTINUITY_LEDGER_ENABLED — Motor 1 of the WCHK strengthening (2026-06-11).
 * When on, EXEC-WCHK adds the state-evolution pass: a cheap Haiku extraction
 * turns shot prose into ShotStateDelta[], the deterministic state-ledger
 * judges transitions (revert-without-cause, repeated first-discovery,
 * causeless autonomous change, entity-from-nowhere), and W05 duration limits
 * + W02/W07 advisory canon checks activate. Default off → byte-identical
 * membership-only legacy check (replay-pilot keeps passing).
 */
export function continuityLedgerEnabled(): boolean {
  const v = process.env.CONTINUITY_LEDGER_ENABLED;
  if (!v) return false;
  return v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'on';
}

/**
 * CHECKERS_FREE_TIER — F7 per-agent-class LLM routing (2026-06-12, q8b
 * extension). When on (DEFAULT), text agents of class `checker` (SREV,
 * CREAD, WCHK, VPREV, EPREV, ledger extraction) run on the Gemini free tier
 * in ALL governance modes — the E07 smoke proved free-tier critics stay
 * strict (5 failed / 7 passed verdicts, all on merit). Creators (SW / SB /
 * Designer / Animator) keep Anthropic in Modes 1-3; TEXT_LLM_DEBUG_TIER
 * remains the process-wide Mode-4/smoke kill-switch that frees EVERYTHING.
 * Rollback: CHECKERS_FREE_TIER=false — one env var, one class.
 */
export function checkersFreeTierEnabled(): boolean {
  const v = process.env.CHECKERS_FREE_TIER;
  if (!v) return true; // default ON per Director q8b follow-up
  return !(v.toLowerCase() === 'false' || v === '0' || v.toLowerCase() === 'off');
}

/**
 * C1_STOP_BEFORE_EREF — verification kill-switch. When on, REV-world_check
 * approval does NOT fan out EREF (no paid reference-image generation); the
 * autonomous chain halts after the creative-text layer (script → storyboard →
 * readability → continuity). Lets a Mode-4 run be evaluated for humor
 * readability at the storyboard level cheaply. Default off → normal pipeline.
 */
export function stopBeforeErefEnabled(): boolean {
  const v = process.env.C1_STOP_BEFORE_EREF;
  if (!v) return false;
  return v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'on';
}

/**
 * PLAN_REGEN_CAP — max AUTONOMOUS (EXEC-DIR-AI / Polina) plan-driven re-fires
 * per plan before the runaway-recovery guard HALTs and escalates to the human
 * Director (critic_revision_cap doctrine: 2-3 attempts, then stop). The human
 * Director is never capped — she is the escalation target. Default 3.
 *
 * Root incident (E10 SH10, 2026-06-14): Polina's uncapped "Mode 4 auto-recovery"
 * loop regenerated one anchor 6× on an advisory visual-gate flag — ~4 min +
 * image cost each, no escalation. The cap makes the loop terminate by
 * construction regardless of Polina's behaviour (the only reliable defence —
 * prompt rules alone never stopped her, per the 2026-06-12 E08 finding).
 */
export function planRegenCap(): number {
  const v = process.env.PLAN_REGEN_CAP;
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/**
 * SHOT_REGEN_CAP — max AUTONOMOUS attempts (image-gen + plan-regen COMBINED)
 * for ONE shot ACROSS ALL plan versions, before the factory pre-run hook HALTs
 * and escalates to the human Director. Default 6.
 *
 * Why a SECOND cap on top of planRegenCap(): every existing cap is keyed to a
 * unit that RESETS when a new plan version is born — planRegenCap() is per
 * `planAssetId`, the critic-loop revision cap is per revision chain. The E10
 * SH23 doom-loop (2026-06-15) created a NEW plan each iteration, so both
 * counters reset every turn → 58 plan versions / 45 images / 39 Polina regens
 * on a single shot, burning the OpenAI image billing limit. `HALT` was even
 * stamped at v3/v11/v17 but the loop continued because the counter started
 * over. This cap is keyed to the SHOT (input_snapshot->>shotId), spans every
 * plan version, and never resets — so a runaway terminates by construction
 * regardless of how many fresh plans the loop spawns. The human Director is
 * never capped (she is the escalation target).
 */
export function shotRegenCap(): number {
  const v = process.env.SHOT_REGEN_CAP;
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 6;
}

/**
 * RECONCILE_RECOVERY_CAP — how many times the reconciler mechanically REFIRES a
 * FAILED (never-produced) cell before it HALTs + escalates to the Director
 * (Failure-spine Slice 3). Distinct from the regen caps above: those bound the
 * critic-revision / auto-regen loops on a produced artifact; this bounds the
 * reconciler's re-drive of a stage whose generation DIED with no output. Small
 * by design — Inngest already retries the job 3×, so this only recovers a
 * transient outage that cleared LATER; a logical block re-fails and the cap
 * converges it to the Director instead of looping. Default 1.
 */
export function reconcileRecoveryCap(): number {
  const v = process.env.RECONCILE_RECOVERY_CAP;
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Per-episode retry caps (Director 2026-07-06 — Episode Settings). Three
 * attempt limits the Director can tune per episode before the pipeline HALTs
 * and escalates to her:
 *   - prompt_revision_cap  (default 2) — designer/author re-writes after a
 *     critic REVISE, before HALT (critic-loop).
 *   - reference_regen_cap  (default 2) — EREF auto-regeneration attempts before
 *     the shot lands HUMAN_REVIEW (episode-references loop).
 *   - video_regen_cap      (default 1) — automatic VID-shot generations for a
 *     shot before further auto-gen is suppressed (exec-vgen dedup gate).
 * Each falls back to an env var, then the hard default. `resolve*` overlays the
 * per-episode `episodes.metadata.<key>` over that env/default (mirrors
 * resolveConciergeCapUsd in lib/concierge/cost.ts).
 */
function capFromMetadata(metadata: unknown, key: string, envDefault: () => number): number {
  const raw = (metadata as Record<string, unknown> | null | undefined)?.[key];
  const n =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : envDefault();
}

export function promptRevisionCap(): number {
  const v = process.env.PROMPT_REVISION_CAP;
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 2;
}
export function resolvePromptRevisionCap(metadata: unknown): number {
  return capFromMetadata(metadata, 'prompt_revision_cap', promptRevisionCap);
}

export function referenceRegenCap(): number {
  const v = process.env.REFERENCE_REGEN_CAP;
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 2;
}
export function resolveReferenceRegenCap(metadata: unknown): number {
  return capFromMetadata(metadata, 'reference_regen_cap', referenceRegenCap);
}

export function videoRegenCap(): number {
  const v = process.env.VIDEO_REGEN_CAP;
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}
export function resolveVideoRegenCap(metadata: unknown): number {
  return capFromMetadata(metadata, 'video_regen_cap', videoRegenCap);
}

/**
 * ANCHOR_VISUAL_GATE — run the EREF AI checker on anchor frames too (2026-06-14,
 * Director q "default ON"). Advisory: stamps a visual verdict + flags intruders
 * (extraneous_objects) into the anchor's metadata and emits a stat on bypass; it
 * does NOT block — anchors still land REVIEW for the Director's eye. The
 * regular EREF path always ran the checker; anchors used to skip it entirely.
 * Default ON; set ANCHOR_VISUAL_GATE=false/0/off to disable.
 */
export function anchorVisualGateEnabled(): boolean {
  const v = process.env.ANCHOR_VISUAL_GATE;
  if (!v) return true; // default ON per Director
  return !(v.toLowerCase() === 'false' || v === '0' || v.toLowerCase() === 'off');
}
