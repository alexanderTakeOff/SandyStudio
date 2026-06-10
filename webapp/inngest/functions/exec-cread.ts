// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-cread.ts
// EXEC-CREAD — Creative Readability Critic (C1-Gate sprint 2026-06-10).
// Universal, process-invariant critic slotted after STB-storyboard and before
// EXEC-WCHK. Fired by EXEC-SB's nextEvent (and the next-events STB branch) when
// READABILITY_GATE_ENABLED is on. Mirrors exec-srev.ts / exec-eprev.ts.
//
// Auto-chain by verdict (see nextEvent below):
//   PASS / PASS_WITH_UNCERTAINTY → EXEC-WCHK (continuity check) with the
//       storyboard asset id carried forward.
//   REVISE                       → re-fire the Storyboarder with the readability
//       acceptance_criteria as a hard-contract revisionNote.
//   HALT / FAIL / UNKNOWN        → no next event (Director escalation only).
//
// Event shape: { episodeId: uuid, storyboardAssetId: uuid }
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';
import type { AgentResult } from '@/lib/agents/types';
import { shortShotLabel } from '@/lib/api/vgen-shot-helpers';

export const execCreadReviewStoryboard = createAgentInngestFunction({
  id: 'exec-cread-review-storyboard',
  name: 'EXEC-CREAD: Review Storyboard Readability',
  agentId: 'EXEC-CREAD',
  concurrencyId: 'exec-cread',
  eventName: 'sandystudio/exec-cread/review-storyboard',
  operation: 'storyboard_readability_review',
  // Critic IS the gate from REVIEW to APPROVED for the storyboard it reviews —
  // without this override the input loader filters out the very storyboard
  // under review. Mirrors the SREV / WCHK reviewer pattern.
  inputAllowedStatuses: ['APPROVED', 'REVIEW', 'REVISION'],
  resolveRunArgs: (eventData) => {
    const storyboardAssetId =
      typeof eventData.storyboardAssetId === 'string'
        ? (eventData.storyboardAssetId as string)
        : undefined;
    const out: { storyboardAssetId?: string } = {};
    if (storyboardAssetId) out.storyboardAssetId = storyboardAssetId;
    return out;
  },
  resolveActivityContext: (eventData) => {
    const storyboardAssetId =
      typeof eventData.storyboardAssetId === 'string'
        ? eventData.storyboardAssetId
        : null;
    return {
      metadata: { storyboard_asset_id: storyboardAssetId },
    };
  },
  nextEvent: (_saved, eventData, result: AgentResult) => {
    const meta = result.metadata as
      | {
          verdict?: unknown;
          acceptance_criteria?: unknown;
          storyboard_asset_id?: unknown;
        }
      | undefined;
    const verdict = typeof meta?.verdict === 'string' ? meta.verdict : null;
    const storyboardAssetId =
      typeof meta?.storyboard_asset_id === 'string'
        ? meta.storyboard_asset_id
        : typeof eventData.storyboardAssetId === 'string'
          ? (eventData.storyboardAssetId as string)
          : null;

    // REVISE → bounce to the Storyboarder with hard acceptance criteria.
    if (verdict === 'REVISE') {
      const criteria = Array.isArray(meta?.acceptance_criteria)
        ? (meta.acceptance_criteria as unknown[]).filter(
            (v): v is string => typeof v === 'string' && v.trim().length > 0,
          )
        : [];
      const revisionNote =
        criteria.length > 0
          ? `Readability Critic verdict REVISE — hard acceptance criteria:\n- ${criteria.join('\n- ')}`
          : 'Readability Critic verdict REVISE — re-author the storyboard for readability.';
      return {
        name: 'sandystudio/exec-sb/create-storyboard',
        data: {
          episodeId: eventData.episodeId as string,
          // create-storyboard requires scriptAssetId; the Storyboarder runner
          // resolves the script from upstream_assets itself, so an empty
          // string is acceptable (matches the SREV→SB revision bounce shape).
          scriptAssetId: '',
          revisionNote,
        },
      };
    }

    // PASS / PASS_WITH_UNCERTAINTY → continuity check.
    if (verdict === 'PASS' || verdict === 'PASS_WITH_UNCERTAINTY') {
      return {
        name: 'sandystudio/exec-wchk/check-world',
        data: {
          episodeId: eventData.episodeId as string,
          storyboardAssetIds: storyboardAssetId ? [storyboardAssetId] : [],
        },
      };
    }

    // HALT / FAIL / UNKNOWN → no next event (Director escalation).
    return null;
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Per-shot readability review (T1 consolidation 2026-06-10). Absorbed the
// retired EXEC-GAGAD eref_review / vanim_review. Fired by EPREV/VPREV PASS only
// when READABILITY_GATE_ENABLED is on AND the series genre is comedy-like (the
// genre gate lives in the EPREV/VPREV nextEvent, mirroring the old GAGAD wiring).
//
// Auto-chain by verdict:
//   REVISE → re-fire the producer (Designer / Animator) with the readability
//            acceptance_criteria as a hard-contract revisionNote.
//   PASS / HALT / FAIL / UNKNOWN → no next event (the Plan stays in REVIEW for
//            the Director; HALT escalates via applyCriticVerdict in the runner).
// ──────────────────────────────────────────────────────────────────────────────

function reviewResolveRunArgs(
  creadPhase: 'eref' | 'vanim',
): (eventData: Record<string, unknown>) => {
  creadPhase: 'eref' | 'vanim';
  planAssetId?: string;
  shotId?: string;
} {
  return (eventData) => {
    const planAssetId =
      typeof eventData.planAssetId === 'string' ? eventData.planAssetId : undefined;
    const shotId =
      typeof eventData.shotId === 'string' ? eventData.shotId : undefined;
    const args: { creadPhase: 'eref' | 'vanim'; planAssetId?: string; shotId?: string } = {
      creadPhase,
    };
    if (planAssetId) args.planAssetId = planAssetId;
    if (shotId) args.shotId = shotId;
    return args;
  };
}

function reviewResolveActivityContext(
  creadPhase: 'eref' | 'vanim',
): (eventData: Record<string, unknown>) => {
  shortLabel?: string;
  metadata?: Record<string, unknown>;
} {
  return (eventData) => {
    const shotId = typeof eventData.shotId === 'string' ? eventData.shotId : '';
    const planAssetId =
      typeof eventData.planAssetId === 'string' ? eventData.planAssetId : null;
    return {
      shortLabel: shortShotLabel(shotId),
      metadata: { shot_id: shotId || null, plan_asset_id: planAssetId, cread_phase: creadPhase },
    };
  };
}

function reviewNextEvent(
  producerEvent: string,
  label: string,
): (
  saved: { assetId: string },
  eventData: Record<string, unknown>,
  result: AgentResult,
) => { name: string; data: Record<string, unknown> } | null {
  return (_saved, eventData, result) => {
    const meta = result.metadata as
      | { verdict?: unknown; acceptance_criteria?: unknown }
      | undefined;
    const verdict = typeof meta?.verdict === 'string' ? meta.verdict : null;
    if (verdict !== 'REVISE') return null;

    const shotId = typeof eventData.shotId === 'string' ? eventData.shotId : null;
    if (!shotId) return null;

    const criteria = Array.isArray(meta?.acceptance_criteria)
      ? (meta.acceptance_criteria as unknown[]).filter(
          (v): v is string => typeof v === 'string' && v.trim().length > 0,
        )
      : [];
    const revisionNote =
      criteria.length > 0
        ? `Readability Critic (${label}) REVISE — hard acceptance criteria:\n- ${criteria.join('\n- ')}`
        : `Readability Critic (${label}) REVISE — re-derive the plan to preserve the readable intent.`;

    return {
      name: producerEvent,
      data: { episodeId: eventData.episodeId as string, shotId, revisionNote },
    };
  };
}

export const execCreadReviewRefPlan = createAgentInngestFunction({
  id: 'exec-cread-review-ref-plan',
  name: 'EXEC-CREAD: Readability review of SPC-ref_plan',
  agentId: 'EXEC-CREAD',
  concurrencyId: 'exec-cread',
  eventName: 'sandystudio/exec-cread/review-ref-plan',
  operation: 'readability_review_ref_plan',
  resolveRunArgs: reviewResolveRunArgs('eref'),
  resolveActivityContext: reviewResolveActivityContext('eref'),
  nextEvent: reviewNextEvent('sandystudio/exec-eref-designer/plan', 'eref'),
});

export const execCreadReviewShotPlan = createAgentInngestFunction({
  id: 'exec-cread-review-shot-plan',
  name: 'EXEC-CREAD: Readability review of SPC-shot_plan',
  agentId: 'EXEC-CREAD',
  concurrencyId: 'exec-cread',
  eventName: 'sandystudio/exec-cread/review-shot-plan',
  operation: 'readability_review_shot_plan',
  resolveRunArgs: reviewResolveRunArgs('vanim'),
  resolveActivityContext: reviewResolveActivityContext('vanim'),
  nextEvent: reviewNextEvent('sandystudio/exec-vanim/plan', 'vanim'),
});
