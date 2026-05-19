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
import { isComedyLikeGenre } from '@/lib/api/genre';

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
   * Auto-chain (two outputs by verdict):
   *
   *   verdict=REVISE → re-fire the Designer with acceptance_criteria as
   *     a hard-contract revisionNote.
   *
   *   verdict=PASS  → fire EXEC-GAGAD eref_review IF series_genre is
   *     comedy-like. GAGAD performs cross-layer check that the SPC-ref_plan
   *     delivers the gag intent declared by the episode's SPC-gag_plan.
   *     (GAGAD soft-skips if no gag_plan APPROVED yet.) Day 11+ wiring.
   */
  nextEvent: (_saved, eventData, result: AgentResult) => {
    const meta = result.metadata as
      | {
          verdict?: unknown;
          acceptance_criteria?: unknown;
          series_genre?: unknown;
          plan_asset_id?: unknown;
        }
      | undefined;
    const verdict = typeof meta?.verdict === 'string' ? meta.verdict : null;
    const shotId =
      typeof eventData.shotId === 'string' ? (eventData.shotId as string) : null;
    if (!shotId) return null;

    if (verdict === 'REVISE') {
      const criteria = Array.isArray(meta?.acceptance_criteria)
        ? (meta.acceptance_criteria as unknown[]).filter(
            (v): v is string => typeof v === 'string' && v.trim().length > 0,
          )
        : [];
      const revisionNote =
        criteria.length > 0
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
    }

    if (verdict === 'PASS') {
      const seriesGenre =
        typeof meta?.series_genre === 'string' ? meta.series_genre : null;
      const planAssetId =
        typeof meta?.plan_asset_id === 'string' ? meta.plan_asset_id : null;
      if (isComedyLikeGenre(seriesGenre) && planAssetId) {
        return {
          name: 'sandystudio/exec-gagad/review-ref-plan',
          data: {
            episodeId: eventData.episodeId as string,
            planAssetId,
            shotId,
          },
        };
      }
    }

    return null;
  },
});
