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
