// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-eprev.ts
// EXEC-EPREV — Designer's Critic (Sprint «Дизайнер и Аниматор», Day 4
// 2026-05-19). Fired by EXEC-EREF-DESIGNER's nextEvent callback right after
// a fresh SPC-ref_plan asset is saved. Validates the Plan against V01-V09
// hard checks.
//
// Auto-chain (see resolveNextEvent below):
//   verdict=PASS    → no next event; downstream code flips Plan to REVIEW
//                     so Director sees it.
//   verdict=REVISE  → re-fire Designer with `revisionNote` containing the
//                     Critic's acceptance_criteria as hard contract.
//   verdict=FAIL    → no next event; Director escalation only.
//
// Event shape: { episodeId: uuid, planAssetId: uuid, shotId: string }
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';
import type { AgentResult } from '@/lib/agents/types';

export const execEprevReviewPlan = createAgentInngestFunction({
  id: 'exec-eprev-review-plan',
  name: "EXEC-EPREV: Validate Designer's Plan",
  agentId: 'EXEC-EPREV',
  concurrencyId: 'exec-eprev',
  eventName: 'sandystudio/exec-eprev/review-plan',
  operation: 'eref_plan_critic_review',
  resolveRunArgs: (eventData) => {
    const shotId =
      typeof eventData.shotId === 'string' ? (eventData.shotId as string) : undefined;
    const planAssetId =
      typeof eventData.planAssetId === 'string'
        ? (eventData.planAssetId as string)
        : undefined;
    const args: { shotId?: string; planAssetId?: string } = {};
    if (shotId) args.shotId = shotId;
    if (planAssetId) args.planAssetId = planAssetId;
    return args;
  },
  /**
   * Auto-chain: when the Critic returns REVISE, re-fire the Designer with
   * acceptance_criteria as a hard-contract revisionNote. Designer's prompt
   * treats revisionNote as a hard contract (see episode_reference_designer.md
   * § "Revision request from Critic / Director").
   */
  nextEvent: (_saved, eventData, result: AgentResult) => {
    const meta = result.metadata as
      | { verdict?: unknown; acceptance_criteria?: unknown }
      | undefined;
    const verdict = typeof meta?.verdict === 'string' ? meta.verdict : null;
    if (verdict !== 'REVISE') return null;

    const shotId =
      typeof eventData.shotId === 'string' ? (eventData.shotId as string) : null;
    if (!shotId) return null;

    const criteria = Array.isArray(meta?.acceptance_criteria)
      ? (meta.acceptance_criteria as unknown[]).filter(
          (v): v is string => typeof v === 'string' && v.trim().length > 0,
        )
      : [];
    const revisionNote = criteria.length > 0
      ? `Critic verdict REVISE — hard acceptance criteria:\n- ${criteria.join('\n- ')}`
      : 'Critic verdict REVISE — re-derive the Plan from inputs.';

    return {
      name: 'sandystudio/exec-eref-designer/plan',
      data: {
        episodeId: eventData.episodeId as string,
        shotId,
        revisionNote,
      },
    };
  },
});
