// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-vprev.ts
// EXEC-VPREV — Animator's Critic (Sprint «Дизайнер и Аниматор», Day 8
// 2026-05-19). Fired by EXEC-VANIM's nextEvent right after a fresh
// SPC-shot_plan asset is saved. Validates V01-V09 hard checks.
//
// Auto-chain: REVISE → re-fire EXEC-VANIM with acceptance_criteria as
//             revisionNote hard contract. PASS/FAIL → no chain.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';
import type { AgentResult } from '@/lib/agents/types';
import { isComedyLikeGenre } from '@/lib/api/genre';
import { shortShotLabel } from '@/lib/api/vgen-shot-helpers';

export const execVprevReviewPlan = createAgentInngestFunction({
  id: 'exec-vprev-review-plan',
  name: "EXEC-VPREV: Validate Animator's Plan",
  agentId: 'EXEC-VPREV',
  concurrencyId: 'exec-vprev',
  eventName: 'sandystudio/exec-vprev/review-plan',
  operation: 'shot_plan_critic_review',
  resolveRunArgs: (eventData) => {
    const shotId =
      typeof eventData.shotId === 'string' ? (eventData.shotId as string) : undefined;
    const planAssetId =
      typeof eventData.planAssetId === 'string'
        ? (eventData.planAssetId as string)
        : undefined;
    // TD-74 (2026-05-27) — Director check waivers propagated from upstream
    // event payload. The factory's top-level extractor (factory.ts) also
    // handles this for the RunAgentArgs path, but resolveRunArgs is the
    // explicit per-agent override surface.
    const args: {
      shotId?: string;
      planAssetId?: string;
      directorOverrides?: ReadonlyArray<{ check: string; rationale: string }>;
    } = {};
    if (shotId) args.shotId = shotId;
    if (planAssetId) args.planAssetId = planAssetId;
    if (Array.isArray(eventData.directorOverrides)) {
      args.directorOverrides = eventData.directorOverrides as ReadonlyArray<{
        check: string;
        rationale: string;
      }>;
    }
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
      // TD-74 (2026-05-27) — preserve Director waivers across the REVISE
      // re-fire loop so Polина doesn't have to re-attach them on each
      // iteration. Animator picks them up the same way it did first time.
      const directorOverrides = Array.isArray(eventData.directorOverrides)
        ? (eventData.directorOverrides as ReadonlyArray<{ check: string; rationale: string }>)
        : undefined;
      return {
        name: 'sandystudio/exec-vanim/plan',
        data: {
          episodeId: eventData.episodeId as string,
          shotId,
          revisionNote,
          ...(directorOverrides && directorOverrides.length > 0
            ? { directorOverrides }
            : {}),
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
          name: 'sandystudio/exec-gagad/review-shot-plan',
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
