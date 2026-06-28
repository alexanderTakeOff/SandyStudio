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
// BEHAVIOUR-PRESERVING (measurement-first, q2a 2026-06-28): `decideGate` returns
// EXACTLY today's outcome — `autonomous` is purely Mode-4. `gateClass` is RECORDED
// (gate_decision_log) for the E13 gate-taxonomy measurement; it does NOT yet
// change the advance decision. The factory choke-point is wired now; the
// next-events forks are collapsed later (S6/S7) when the seam is load-bearing.
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
  /** Did the pipeline advance autonomously (Mode 4) vs require a human (Mode 1-3)? */
  autonomous: boolean;
  decision: 'advance' | 'require_human';
  decidedBy: GateDecidedBy;
  gateClass: GateClass;
}

/** The Mode-4 (AUTOTEST) sentinel passed into computeNextEvents in lieu of a
 *  governance_mode read — kept here so the next-events collapse (later) shares it. */
export const AUTOTEST_PRINCIPAL = 'AUTOTEST';

/**
 * The single autonomy decision. Behaviour-preserving: `autonomous` is Mode-4 only
 * (or the AUTOTEST sentinel, the same signal as seen inside next-events). gateClass
 * is recorded, not yet enforced.
 */
export function decideGate(args: {
  agentId: AgentId;
  governanceMode?: number | null;
  /** next-events path: the AUTOTEST sentinel is the Mode-4 proxy. */
  directorUserId?: string | null;
}): GateDecision {
  const autonomous =
    args.governanceMode === 4 || args.directorUserId === AUTOTEST_PRINCIPAL;
  return {
    autonomous,
    decision: autonomous ? 'advance' : 'require_human',
    decidedBy: autonomous ? 'factory' : 'human',
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
