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
    const args: { shotId?: string; planAssetId?: string } = {};
    if (shotId) args.shotId = shotId;
    if (planAssetId) args.planAssetId = planAssetId;
    return args;
  },
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
      name: 'sandystudio/exec-vanim/plan',
      data: {
        episodeId: eventData.episodeId as string,
        shotId,
        revisionNote,
      },
    };
  },
});
