// ──────────────────────────────────────────────────────────────────────────────
// lib/governance.ts
// Governance Mode enforcement per CLAUDE.md §6 + specs/company/governance.md.
//
// Modes:
//   1 — MANUAL    Director approves every gate (default at session start)
//   2 — HYBRID    Director keeps Category-A scope; EXEC-DIR-AI handles rest
//   3 — DELEGATED EXEC-DIR-AI handles everything except hard limits
//   4 — AUTOTEST  All gates auto-pass (pipeline testing only)
//
// Hard limits in CLAUDE.md §6 — Director always, in ALL modes:
//   PUBLISH · LOCK · BUDGET · MODE_CHANGE
//
// Phase 4 enforces ONLY the PUBLISH hard limit. Per the approved plan
// (phase-4-jiggly-wave.md §4.4): all other agents call enforceMode() but it
// returns {passed: true} for everything except PUBLISH. Full Approval
// Authority Matrix is wired up in Phase 7 via the wizard.
// ──────────────────────────────────────────────────────────────────────────────

import type { GovernanceAction } from './agents/types';

/** Episode shape needed by governance — matches Supabase row partial. */
export interface GovernanceEpisode {
  id: string;
  governance_mode: number; // 1..4
}

/** Event payload context inspected for `directorConfirm` etc. */
export interface GovernanceContext {
  /** Set true by the API route when Director clicked the confirm button. */
  directorConfirm?: boolean;
  /** Identifier of the human/agent that confirmed, for audit trail. */
  confirmedBy?: string;
}

export interface GovernanceDecision {
  passed: boolean;
  /** Single human-readable reason if blocked. UI shows this verbatim. */
  reason?: string;
  /** Machine-readable code for activity_events metadata. */
  code?: 'mode_4_autotest' | 'director_confirmed' | 'no_director_confirm' | 'category_c_autonomous';
}

/** Thrown by callers when they want a hard NonRetriableError instead of a soft pass-through. */
export class GovernanceError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'GovernanceError';
    this.code = code;
  }
}

/**
 * Decide whether `action` is allowed for `episode` given the event context.
 *
 * Phase 4 contract:
 *   - action='PUBLISH' + Mode 1/2/3 + no directorConfirm → BLOCKED
 *   - action='PUBLISH' + Mode 4 (AUTOTEST)              → PASSED
 *   - action='PUBLISH' + directorConfirm=true           → PASSED
 *   - all other actions                                 → PASSED (Phase 7 expands this)
 */
export function enforceMode(
  action: GovernanceAction,
  episode: GovernanceEpisode,
  context: GovernanceContext = {}
): GovernanceDecision {
  // Mode 4 AUTOTEST short-circuits everything for CI smoke tests.
  if (episode.governance_mode === 4) {
    return {
      passed: true,
      code: 'mode_4_autotest',
    };
  }

  if (action === 'PUBLISH') {
    if (context.directorConfirm === true) {
      return {
        passed: true,
        code: 'director_confirmed',
      };
    }
    return {
      passed: false,
      reason:
        `PUBLISH blocked: episode ${episode.id} is in Mode ${episode.governance_mode} ` +
        `and event payload missing directorConfirm: true. ` +
        `Hard limit per CLAUDE.md §6 — Director must explicitly confirm publish.`,
      code: 'no_director_confirm',
    };
  }

  // All other actions in Phase 4: pass-through. Phase 7 wires the full matrix.
  return {
    passed: true,
    code: 'category_c_autonomous',
  };
}
