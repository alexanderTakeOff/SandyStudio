// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/gate.ts
// Per-agent input gate validation.
//
// Implements CLAUDE.md §11 "Parameter Completeness At Gate":
//   "All parameters an execution agent needs MUST be fully defined by upstream
//    inputs before that agent is triggered. Execution agents are pure functions:
//    output = f(inputs). An execution agent encountering an undefined parameter
//    = upstream gate failure."
//
// For each AgentId, declare which assets must exist in APPROVED status before
// the agent may run. validateAgentInputs() queries Supabase and returns a
// GateResult. enforceMode() is also called inline so a single gate-check
// covers both data completeness and governance authority.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../supabase/types.gen';
import { enforceMode } from '../governance';
import type { AgentId, GateResult, GovernanceAction } from './types';

// ── Agent dependency declarations ────────────────────────────────────────────

interface AgentDependency {
  /** Dot-pattern matched against assets.file_type (e.g. "SCR", "STB", "VID"). */
  fileTypePrefix: string;
  /** How many APPROVED assets of this type must exist for the gate to pass. */
  minCount: number;
  /** Friendly name for the missing-input error message. */
  label: string;
}

interface AgentGateSpec {
  /** Upstream APPROVED assets required before this agent may run. */
  required: AgentDependency[];
  /** Governance action this agent maps to. Default = 'AGENT_RUN' (pass-through in Phase 4). */
  governance: GovernanceAction;
}

/**
 * Per-agent gate specification. Update this single map to change pipeline order.
 *
 * In Phase 4 mock mode, the replay-pilot script pre-populates Supabase with
 * APPROVED assets so the gates pass. In Sprint 10 real mode the same gates
 * fire against real upstream output.
 */
const AGENT_GATES: Readonly<Record<AgentId, AgentGateSpec>> = {
  'EXEC-SW': {
    required: [{ fileTypePrefix: 'SPC-brief', minCount: 1, label: 'Brief' }],
    governance: 'AGENT_RUN',
  },
  'EXEC-SREV': {
    required: [{ fileTypePrefix: 'SCR', minCount: 1, label: 'Script' }],
    governance: 'AGENT_RUN',
  },
  'EXEC-SB': {
    required: [{ fileTypePrefix: 'SCR', minCount: 1, label: 'Approved Script' }],
    governance: 'AGENT_RUN',
  },
  'EXEC-WCHK': {
    // Real EXEC-SB now produces ONE storyboard asset with 3 acts inline,
    // not 3 separate STB rows. Threshold lowered to 1.
    required: [
      { fileTypePrefix: 'STB', minCount: 1, label: 'Approved storyboard' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-EREF': {
    // Backbone v2: between Storyboard and Animatic. Reads APPROVED storyboard
    // and generates per-episode reference images for each unique
    // location/character pose. Step 5 implements real gpt-image-1 fan-out.
    required: [
      { fileTypePrefix: 'STB', minCount: 1, label: 'Approved storyboard' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-EDIT': {
    // Animatic now consumes APPROVED Episode references (not raw storyboard).
    required: [
      { fileTypePrefix: 'IMG-episode_ref', minCount: 1, label: 'Approved episode references' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-VGEN': {
    required: [
      { fileTypePrefix: 'VID-animatic', minCount: 1, label: 'Approved animatic' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-MGEN': {
    required: [
      { fileTypePrefix: 'VID-animatic', minCount: 1, label: 'Approved animatic' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-COPY': {
    required: [{ fileTypePrefix: 'SCR', minCount: 1, label: 'Approved Script' }],
    governance: 'AGENT_RUN',
  },
  'EXEC-THUMB': {
    required: [
      { fileTypePrefix: 'SCR', minCount: 1, label: 'Approved Script' },
      { fileTypePrefix: 'SPC-metadata', minCount: 1, label: 'Approved Metadata' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-PUB': {
    required: [
      { fileTypePrefix: 'VID-animatic', minCount: 1, label: 'Episode video' },
      { fileTypePrefix: 'SPC-metadata', minCount: 1, label: 'Metadata' },
      { fileTypePrefix: 'IMG-thumbnail', minCount: 1, label: 'Thumbnail' },
    ],
    governance: 'PUBLISH', // hard limit
  },
  'EXEC-ANAL': {
    required: [{ fileTypePrefix: 'REV-publish_log', minCount: 1, label: 'Publish log' }],
    governance: 'AGENT_RUN',
  },
  // Agents below have no Inngest function — gate is informational only.
  'EXEC-STY': { required: [], governance: 'AGENT_RUN' },
  'EXEC-BIBLE-AUTHOR': { required: [], governance: 'AGENT_RUN' },
  'EXEC-ARCH': { required: [], governance: 'AGENT_RUN' },
  'EXEC-ORCH': { required: [], governance: 'AGENT_RUN' },
  'EXEC-CONC': { required: [], governance: 'AGENT_RUN' },
};

// ── Validation entry point ────────────────────────────────────────────────────

export interface ValidateInputsArgs {
  supabase: SupabaseClient<Database>;
  agentId: AgentId;
  episodeId: string;
  /** Event payload context for governance decisions (directorConfirm, etc.). */
  eventContext?: {
    directorConfirm?: boolean;
    confirmedBy?: string;
  };
}

/**
 * Validate that all upstream APPROVED assets exist for `agentId` in `episodeId`,
 * AND that governance allows the action in the episode's current mode.
 *
 * Two-phase check:
 *   1. Asset completeness — query assets table for each declared dependency
 *   2. Governance authority — call enforceMode() with the agent's mapped action
 *
 * If either fails → `passed: false` with details. The Inngest function
 * converts this into a NonRetriableError so the job ends in FAILED state.
 */
export async function validateAgentInputs(
  args: ValidateInputsArgs
): Promise<GateResult> {
  const { supabase, agentId, episodeId, eventContext = {} } = args;
  const spec = AGENT_GATES[agentId];

  // ── Step 1: asset completeness ─────────────────────────────────────────────
  const missing: string[] = [];
  for (const dep of spec.required) {
    const { count, error } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('episode_id', episodeId)
      .eq('status', 'APPROVED')
      .like('file_type', `${dep.fileTypePrefix}%`);
    if (error) {
      return {
        passed: false,
        missing: [],
        reason: `Gate query failed for ${agentId}/${dep.fileTypePrefix}: ${error.message}`,
      };
    }
    const found = count ?? 0;
    if (found < dep.minCount) {
      missing.push(`${dep.label} (need ${dep.minCount}, found ${found} APPROVED)`);
    }
  }

  if (missing.length > 0) {
    return {
      passed: false,
      missing,
      reason: `Upstream gate failed for ${agentId}: ${missing.join('; ')}`,
    };
  }

  // ── Step 1.5: EXEC-EREF Series Bible canon precondition ──────────────────
  // Backbone v2 / Step 4 of contract pipeline rollout: Episode references
  // can only be generated when the parent series has at least 1 LOCKED
  // canonical character ref AND 1 LOCKED style guide. Without canon there is
  // nothing to anchor episode visuals on — see specs/company/series_bible.md.
  if (agentId === 'EXEC-EREF') {
    const { seriesIdForEpisode, countLockedBibleSections } = await import(
      '../api/series-bible'
    );
    const seriesId = await seriesIdForEpisode(supabase, episodeId);
    if (!seriesId) {
      return {
        passed: false,
        missing: ['parent series'],
        reason:
          'EXEC-EREF requires a parent series to look up Series Bible canon, but the episode is not linked to a series.',
      };
    }
    const counts = await countLockedBibleSections(supabase, seriesId);
    const bibleMissing: string[] = [];
    if (counts.character < 1)
      bibleMissing.push('≥1 LOCKED Series Bible character (Heroes section)');
    if (counts.style < 1)
      bibleMissing.push('≥1 LOCKED Series Bible style guide (Style section)');
    if (bibleMissing.length > 0) {
      return {
        passed: false,
        missing: bibleMissing,
        reason: `Series Bible canon not provisioned: ${bibleMissing.join(' AND ')}. Open the series Bible UI and LOCK the missing entries before re-triggering EXEC-EREF.`,
      };
    }
  }

  // ── Step 2: governance authority ───────────────────────────────────────────
  // Read episode's current governance_mode for the enforceMode call.
  const { data: episode, error: epErr } = await supabase
    .from('episodes')
    .select('id, governance_mode')
    .eq('id', episodeId)
    .single();
  if (epErr) {
    return {
      passed: false,
      missing: [],
      reason: `Gate episode lookup failed for ${agentId}: ${epErr.message}`,
    };
  }
  const decision = enforceMode(spec.governance, episode, eventContext);
  if (!decision.passed) {
    return {
      passed: false,
      missing: [],
      reason: decision.reason ?? 'Governance blocked',
    };
  }

  return {
    passed: true,
    missing: [],
  };
}
