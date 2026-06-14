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
