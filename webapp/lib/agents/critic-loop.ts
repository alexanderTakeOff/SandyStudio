// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/critic-loop.ts
// Generalized auto-bounce mechanic for plan critics (I9, gate-hardening 2026-06-04).
//
// q25 / TD-83 doctrine (critic_revision_cap_doctrine): a critic returns a Plan
// for revision at most `cap` times, then HALTs and escalates to the Director —
// the Director is NOT the first defect router. Until now only EXEC-GAGAD carried
// this mechanic (runner.ts, bespoke); EXEC-VPREV / EXEC-EPREV flipped the Plan to
// REVISION on every REVISE with no cap, so the Designer/Animator could loop
// forever. This module extracts the verdict→status mapping + cap + escalation
// into ONE place the plan critics share.
//
// Counter stability: each REVISE re-authors a NEW plan asset (the critic's
// nextEvent re-fires the author without a planAssetId), so a counter stored on
// the plan's metadata would reset every cycle. We instead read the plan's own
// `version` column — the same max(version)+1 the asset writer assigns per
// re-author (it is what produces the v02 / v03 filenames). version N == attempt
// N == (N-1) revisions so far. No new field, no carry-forward.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../supabase/types.gen';
import type { AgentId } from './types';

/** Verdicts a plan critic can return. UNKNOWN = no parseable verdict → treat as REVISE. */
export type CriticVerdict =
  | 'PASS'
  | 'PASS_WITH_UNCERTAINTY'
  | 'REVISE'
  | 'FAIL'
  | 'HALT'
  | 'UNKNOWN';

/** Default revision cap before HALT — matches the GAGAD mechanic + TD-83 doctrine. */
export const DEFAULT_CRITIC_REVISION_CAP = 2;

/**
 * Map a critic verdict to the Plan asset's next status.
 *   PASS / PASS_WITH_UNCERTAINTY → null  (leave in REVIEW for the Director)
 *   HALT                         → null  (leave in REVIEW; Director must act)
 *   FAIL                         → REJECTED
 *   REVISE / UNKNOWN             → REVISION  (author re-runs)
 * Null means "do not flip" — preserves the existing VPREV/EPREV contract and
 * mirrors GAGAD's "do NOT flip on HALT" rule.
 */
export function mapVerdictToPlanStatus(verdict: CriticVerdict): string | null {
  if (verdict === 'PASS' || verdict === 'PASS_WITH_UNCERTAINTY' || verdict === 'HALT') {
    return null;
  }
  if (verdict === 'FAIL') return 'REJECTED';
  return 'REVISION';
}

export interface ApplyCriticVerdictArgs {
  supabase: SupabaseClient<Database>;
  /** The raw verdict the critic produced. */
  rawVerdict: CriticVerdict;
  /** Plan asset under review (SPC-shot_plan / SPC-ref_plan). */
  planAssetId: string;
  episodeId: string;
  shotId: string;
  /** Critic that produced the verdict — actor for the escalation event. */
  actor: AgentId;
  /** Short phase label for the escalation title (e.g. 'shot_plan', 'ref_plan'). */
  reviewKind: string;
  /** Revisions allowed before a REVISE is coerced to HALT. Default 2. */
  cap?: number;
}

export interface ApplyCriticVerdictResult {
  /** Verdict after cap coercion — REVISE past the cap becomes HALT. This is what
   *  the runner must write into result.metadata.verdict so the critic's nextEvent
   *  stops re-firing the author (it re-fires only on verdict === 'REVISE'). */
  effectiveVerdict: CriticVerdict;
  /** Plan status the row was flipped to (null = left in REVIEW). */
  planStatusAfter: string | null;
  /** Revisions already performed before this verdict (version − 1). */
  revisionsSoFar: number;
}

/**
 * Apply a plan critic's verdict: enforce the revision cap, flip the Plan status,
 * and escalate to the Director Inbox on HALT. Single source of truth shared by
 * EXEC-VPREV and EXEC-EPREV (and the generalization GAGAD already implements
 * inline). Best-effort on its side-effects — a persistence hiccup must not crash
 * the critic; the worst case is the next review re-derives the count from
 * `version`, which is authoritative.
 */
export async function applyCriticVerdict(
  args: ApplyCriticVerdictArgs,
): Promise<ApplyCriticVerdictResult> {
  const {
    supabase,
    rawVerdict,
    planAssetId,
    episodeId,
    shotId,
    actor,
    reviewKind,
    cap = DEFAULT_CRITIC_REVISION_CAP,
  } = args;

  // Read the plan's version as the attempt counter. v01 = attempt 1 = 0 revisions.
  let version = 1;
  try {
    const { data: planRow } = await supabase
      .from('assets')
      .select('version')
      .eq('id', planAssetId)
      .maybeSingle();
    const v = (planRow as { version?: unknown } | null)?.version;
    if (typeof v === 'number' && v > 0) version = Math.floor(v);
  } catch {
    // Fall back to version 1 (0 revisions) — fail open, never block on a read.
  }
  const revisionsSoFar = Math.max(0, version - 1);

  // Cap: a REVISE that would exceed the cap is escalated to a HALT instead. The
  // Director becomes the router only after `cap` automated revisions, not first.
  const effectiveVerdict: CriticVerdict =
    rawVerdict === 'REVISE' && revisionsSoFar >= cap ? 'HALT' : rawVerdict;

  const planStatusAfter = mapVerdictToPlanStatus(effectiveVerdict);
  if (planStatusAfter) {
    try {
      await supabase
        .from('assets')
        .update({ status: planStatusAfter } as never)
        .eq('id', planAssetId);
    } catch {
      // Non-fatal: leave the row as-is; the verdict still reaches the Director
      // via the returned metadata and (on HALT) the escalation event below.
    }
  }

  if (effectiveVerdict === 'HALT') {
    try {
      await supabase.from('activity_events').insert({
        event_type: 'revision_requested',
        severity: 'warning',
        title: `${actor} HALT — manual review needed (${reviewKind})`,
        description: `Critic reached revision cap (revisions=${revisionsSoFar}, cap=${cap}) on shot ${shotId}. Director attention required.`,
        actor,
        episode_id: episodeId,
        asset_id: planAssetId,
        metadata: {
          critic_escalation: true,
          reason: 'cap_reached',
          review_kind: reviewKind,
          target_asset_id: planAssetId,
          shot_id: shotId,
          revisions_so_far: revisionsSoFar,
          cap,
        },
      } as never);
    } catch {
      // Non-fatal: the Plan still sits in REVIEW for the Director; log only.
    }
  }

  return { effectiveVerdict, planStatusAfter, revisionsSoFar };
}
