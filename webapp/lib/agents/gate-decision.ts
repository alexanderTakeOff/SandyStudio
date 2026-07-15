// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/gate-decision.ts
// S3 / P1 — the ONE autonomy choke-point + its measurement.
//
// Today the "may the pipeline advance without a human?" decision is scattered as
// `governance_mode === 4` (factory) and `directorUserId === 'AUTOTEST'`
// (next-events). This module is the single place that decides, plus the
// build-exhaustive per-agent gate CLASSIFICATION that future autonomy flips
// (S6/S7 — "auto-pass the safest MECHANICAL gates") will key on.
//
// PHASE 2: `resolveGateDecision(gateClass, mode)` is the single mode-aware brain
// (gateClass × governance_mode → advance | require_human) the reconciler keys on.
// `decideGate(agentId)` is the factory measurement wrapper (records gate_decision_log
// off the producing agent's static GATE_CLASS). Mode 4/AUTOTEST removed in Phase 1.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/types.gen';
import type { AgentId } from './types';

/**
 * Gate taxonomy (initial, tunable from E13 data):
 *  - mechanical: rule-based / deterministic output (automated critics, checks,
 *    assembly, render, archival) — the future auto-pass candidates.
 *  - creative:   needs human taste (authoring of script / storyboard / references /
 *    video / music / copy / thumbnail / bibles).
 *  - hard_limit: Director-always per CLAUDE.md (publish / LOCKED / budget / mode).
 *
 * Build-exhaustive: a new AgentId without a class is a TYPE ERROR — a new agent
 * cannot ship unclassified.
 */
export const GATE_CLASS: Record<AgentId, 'mechanical' | 'creative' | 'hard_limit'> = {
  'EXEC-SW': 'creative',
  'EXEC-SREV': 'mechanical',
  'EXEC-SB': 'creative',
  'EXEC-CREAD': 'mechanical',
  'EXEC-WCHK': 'mechanical',
  'EXEC-EREF': 'creative',
  'EXEC-EREF-DESIGNER': 'creative',
  'EXEC-EPREV': 'mechanical',
  'EXEC-VANIM': 'creative',
  'EXEC-VPREV': 'mechanical',
  'EXEC-EDIT': 'mechanical',
  'EXEC-VGEN': 'creative',
  'EXEC-MGEN': 'creative',
  'EXEC-STITCH': 'mechanical',
  'EXEC-THUMB-DESIGNER': 'creative',
  'EXEC-THUMB': 'creative',
  'EXEC-COPY': 'creative',
  'EXEC-PUB': 'hard_limit',
  'EXEC-ANAL': 'mechanical',
  'EXEC-ARCH': 'mechanical',
  'EXEC-STY': 'creative',
  'EXEC-BIBLE-AUTHOR': 'creative',
  'EXEC-STYLE-CHECK': 'mechanical',
  'EXEC-EREF-CHECK': 'mechanical',
  'EXEC-ORCH': 'mechanical',
  'EXEC-CONC': 'mechanical',
};

export type GateClass = (typeof GATE_CLASS)[AgentId];
export type GateDecidedBy = 'factory' | 'human';

export interface GateDecision {
  /** Did the pipeline advance autonomously (mode-aware) vs require a human? */
  autonomous: boolean;
  decision: 'advance' | 'require_human';
  decidedBy: GateDecidedBy;
  gateClass: GateClass;
}

/**
 * The mode-aware decision core (Phase 2) — the single brain the reconciler keys on.
 * gateClass × governance_mode → advance | require_human:
 *
 *   hard_limit  → require_human ALWAYS (publish / lock / budget / mode; CLAUDE.md §6).
 *   mechanical  → advance in Mode 2 & 3, require_human in Mode 1. A mechanical gate
 *                 is one whose quality was already judged (a critic PASS), so the
 *                 Director-supervised (2) and delegated (3) modes let it self-advance.
 *   creative    → advance ONLY in Mode 3 (DELEGATED — Polina is the delegate).
 *                 Mode 1 (MANUAL) and Mode 2 (HYBRID — "pause and eyeball") keep the
 *                 Director's hand on every creative artifact that has no enforcing critic.
 *
 * NOTE for the reconciler: gateClass is computed PER CELL, not from the producing
 * agent — a critic-gated stage with a PASS is `mechanical` (the critic judged it),
 * a rendered artifact with no enforcing critic is `creative`. When a stage GAINS an
 * enforcing critic (e.g. VISUAL_CRITIC_ENFORCE on ref_image), it becomes mechanical
 * automatically and starts auto-advancing in Mode 2 too — no change needed here.
 */
export function resolveGateDecision(
  gateClass: GateClass,
  governanceMode: number | null | undefined,
): 'advance' | 'require_human' {
  if (gateClass === 'hard_limit') return 'require_human';
  const mode = governanceMode ?? 1;
  if (gateClass === 'mechanical') {
    return mode === 2 || mode === 3 ? 'advance' : 'require_human';
  }
  // creative
  return mode === 3 ? 'advance' : 'require_human';
}

/**
 * The single autonomy decision, keyed on the producing agent's static GATE_CLASS.
 * Used at the factory measurement choke-point (gate_decision_log). The reconciler
 * uses `resolveGateDecision` directly with a per-cell gateClass instead.
 */
export function decideGate(args: {
  agentId: AgentId;
  governanceMode?: number | null;
}): GateDecision {
  const gateClass = GATE_CLASS[args.agentId] ?? 'creative';
  const decision = resolveGateDecision(gateClass, args.governanceMode);
  const advance = decision === 'advance';
  return {
    autonomous: advance,
    decision,
    decidedBy: advance ? 'factory' : 'human',
    gateClass,
  };
}

/**
 * Record one gate decision (S3 measurement). Best-effort: never throws into the
 * caller (a measurement write must never break a pipeline run). No-op-safe.
 */
export async function recordGateDecision(
  supabase: SupabaseClient<Database>,
  args: {
    episodeId: string;
    shotId?: string | null;
    agentId: AgentId;
    governanceMode?: number | null;
    decision: GateDecision;
  },
): Promise<void> {
  try {
    await supabase.from('gate_decision_log').insert({
      episode_id: args.episodeId,
      shot_id: args.shotId ?? null,
      gate: args.agentId,
      gate_class: args.decision.gateClass,
      governance_mode: args.governanceMode ?? null,
      autonomous: args.decision.autonomous,
      decision: args.decision.decision,
      decided_by: args.decision.decidedBy,
    });
  } catch {
    // Measurement is non-critical — swallow so it never masks the real run.
  }
}
