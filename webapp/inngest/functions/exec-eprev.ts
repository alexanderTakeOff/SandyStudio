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
import { readabilityGateEnabled } from '@/lib/agents/chain-flags';
import { shortShotLabel } from '@/lib/api/vgen-shot-helpers';

export const execEprevReviewPlan = createAgentInngestFunction({
  id: 'exec-eprev-review-plan',
  name: "EXEC-EPREV: Validate Designer's Plan",
  agentId: 'EXEC-EPREV',
  concurrencyId: 'exec-eprev',
  eventName: 'sandystudio/exec-eprev/review-plan',
  operation: 'eref_plan_critic_review',
  // Belt against a wedged SDK roundtrip holding the episode concurrency slot
  // forever (E17 2026-07-07, Director q8). Pure Sonnet/Haiku call → 10m is ample.
  finishTimeout: '10m',
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
  // 2026-05-22 — surface shot label in activity titles.
  resolveActivityContext: (eventData) => {
    const shotId =
      typeof eventData.shotId === 'string' ? eventData.shotId : '';
    const planAssetId =
      typeof eventData.planAssetId === 'string' ? eventData.planAssetId : null;
    return {
      shortLabel: shortShotLabel(shotId),
      metadata: { shot_id: shotId || null, plan_asset_id: planAssetId },
    };
  },
  /**
   * Auto-chain (two outputs by verdict):
   *
   *   verdict=REVISE → re-fire the Designer with acceptance_criteria as
   *     a hard-contract revisionNote.
   *
   *   verdict=PASS  → fire EXEC-CREAD eref readability review IF the
   *     READABILITY_GATE_ENABLED flag is on AND series_genre is comedy-like.
   *     CREAD checks the SPC-ref_plan still delivers the storyboard's readable
   *     intent against the genre playbook (T1 — absorbed the retired GAGAD
   *     eref_review). Flag off ⇒ null (pre-GAGAD legacy: Plan waits for Director).
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
      if (readabilityGateEnabled() && isComedyLikeGenre(seriesGenre) && planAssetId) {
        return {
          name: 'sandystudio/exec-cread/review-ref-plan',
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
