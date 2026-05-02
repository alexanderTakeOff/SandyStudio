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
// Hard limits (Category A) — Director always, in ALL modes:
//   PUBLISH · LOCK · BUDGET · MODE_CHANGE
//
// Category B — creative gates (REGENERATE_IMAGE, ENRICH_ASSET, AGENT_RUN, …)
//   Mode 1: blocked without directorConfirm
//   Mode 2-3: auto-allowed (EXEC-DIR-AI / pipeline can fire)
//   Mode 4: auto-allowed
//
// Category C — autonomous / direct Director input (UPLOAD_ASSET, EDIT_DESCRIPTION)
//   Always allowed regardless of mode
//
// The enforceMode() return shape is the foundation EXEC-ORCH (deferred slice)
// will plug into to drive auto-actions.
// ──────────────────────────────────────────────────────────────────────────────

import type { ActionCategory, GovernanceAction } from './agents/types';
import type { GovernanceModeNum } from './api/series-bible';

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
  /**
   * Actor making the request — used by future EXEC-ORCH to call enforceMode
   * with `actor='EXEC-ORCH'`. Same gate decides whether ORCH may auto-fire.
   */
  actor?: string;
}

export interface GovernanceDecision {
  /** True when the action is permitted to proceed. */
  allowed: boolean;
  /** Backward-compat alias for `allowed` — older callers read this. */
  passed: boolean;
  /**
   * True when only an explicit Director confirmation can permit this action.
   * UI uses this to render confirm dialogs / disabled buttons.
   */
  requiresDirector: boolean;
  /**
   * True when the system (pipeline / EXEC-ORCH) may fire this without Director.
   * False for Category A always; for B in Mode 1; for C only when context lacks actor.
   */
  autoFireAllowed: boolean;
  /** Governance mode at the moment of the call — stamped into provenance + activity events. */
  modeAtTime: GovernanceModeNum;
  /** Category this action falls into. Useful for UI grouping. */
  category: ActionCategory;
  /** Single human-readable reason if blocked. UI shows this verbatim. */
  reason?: string;
  /** Machine-readable code for activity_events metadata. */
  code?:
    | 'mode_4_autotest'
    | 'director_confirmed'
    | 'no_director_confirm'
    | 'category_c_autonomous'
    | 'category_b_pipeline_auto'
    | 'category_a_hard_limit';
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

/** Action → category map. Single source of truth. */
const ACTION_CATEGORY: Record<GovernanceAction, ActionCategory> = {
  PUBLISH: 'A',
  LOCK: 'A',
  BUDGET_OVERRIDE: 'A',
  MODE_CHANGE: 'A',
  AGENT_RUN: 'B',
  REGENERATE_IMAGE: 'B',
  ENRICH_ASSET: 'B',
  UPLOAD_ASSET: 'C',
  EDIT_DESCRIPTION: 'C',
};

export function categoryFor(action: GovernanceAction): ActionCategory {
  return ACTION_CATEGORY[action];
}

/**
 * Decide whether `action` is allowed for `episode` given the event context.
 *
 * Returns a structured decision the caller branches on — see GovernanceDecision.
 * Note: legacy `passed` field kept as alias of `allowed` for back-compat.
 */
export function enforceMode(
  action: GovernanceAction,
  episode: GovernanceEpisode,
  context: GovernanceContext = {},
): GovernanceDecision {
  const mode = (episode.governance_mode as GovernanceModeNum) ?? 1;
  const category = categoryFor(action);

  // Mode 4 AUTOTEST short-circuits everything (CI smoke tests).
  if (mode === 4) {
    return {
      allowed: true,
      passed: true,
      requiresDirector: false,
      autoFireAllowed: true,
      modeAtTime: 4,
      category,
      code: 'mode_4_autotest',
    };
  }

  // Category C — always allowed (uploads, free-text edits). Director's direct input.
  if (category === 'C') {
    return {
      allowed: true,
      passed: true,
      requiresDirector: false,
      autoFireAllowed: false, // C is human-initiated by definition; auto-fire makes no sense
      modeAtTime: mode,
      category,
      code: 'category_c_autonomous',
    };
  }

  // Category A — hard limit. Always requires explicit director confirm. Auto-fire never allowed (except Mode 4 above).
  if (category === 'A') {
    if (context.directorConfirm === true) {
      return {
        allowed: true,
        passed: true,
        requiresDirector: false,
        autoFireAllowed: false,
        modeAtTime: mode,
        category,
        code: 'director_confirmed',
      };
    }
    return {
      allowed: false,
      passed: false,
      requiresDirector: true,
      autoFireAllowed: false,
      modeAtTime: mode,
      category,
      reason:
        `${action} is a hard limit per CLAUDE.md §6 — Director must explicitly confirm. ` +
        `Episode ${episode.id} is in Mode ${mode}. Click the confirmation button in the UI.`,
      code: 'no_director_confirm',
    };
  }

  // Category B — creative gates. Mode-dependent.
  // Mode 1 MANUAL: Director must confirm.
  // Mode 2-3: pipeline / EXEC-DIR-AI may auto-fire.
  if (mode === 1) {
    if (context.directorConfirm === true) {
      return {
        allowed: true,
        passed: true,
        requiresDirector: false,
        autoFireAllowed: false,
        modeAtTime: 1,
        category,
        code: 'director_confirmed',
      };
    }
    return {
      allowed: false,
      passed: false,
      requiresDirector: true,
      autoFireAllowed: false,
      modeAtTime: 1,
      category,
      reason:
        `${action} requires Director confirmation in Mode 1 (MANUAL). ` +
        `Click the action button in the UI to confirm.`,
      code: 'no_director_confirm',
    };
  }

  // Mode 2-3 — pipeline-driven; allow auto-fire.
  return {
    allowed: true,
    passed: true,
    requiresDirector: false,
    autoFireAllowed: true,
    modeAtTime: mode,
    category,
    code: 'category_b_pipeline_auto',
  };
}
