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
// PHASE 1 (Mode-4/AUTOTEST removed): `decideGate.autonomous` is always false —
// every gate requires a human. `gateClass` is the build-exhaustive taxonomy,
// RECORDED to gate_decision_log. PHASE 2 rebuilds `decideGate` as the mode-aware
// brain (gateClass × governance_mode → advance | require_human) and wires it
// INTO the reconciler (the single conductor).
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
  /** Did the pipeline advance autonomously vs require a human?
   *  Phase 1: always human, until Phase 2 wires the mode-aware brain. */
  autonomous: boolean;
  decision: 'advance' | 'require_human';
  decidedBy: GateDecidedBy;
  gateClass: GateClass;
}

/**
 * The single autonomy decision.
 * Phase 1 (Mode-4/AUTOTEST removed): autonomy is OFF — every gate requires a human.
 * `governanceMode` is accepted but unused until Phase 2 rebuilds this as the
 * mode-aware brain (gateClass × governance_mode) wired into the reconciler.
 */
export function decideGate(args: {
  agentId: AgentId;
  governanceMode?: number | null;
}): GateDecision {
  return {
    autonomous: false,
    decision: 'require_human',
    decidedBy: 'human',
    gateClass: GATE_CLASS[args.agentId] ?? 'creative',
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
