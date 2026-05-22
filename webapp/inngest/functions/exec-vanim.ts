// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-vanim.ts
// EXEC-VANIM — Animator (Sprint «Дизайнер и Аниматор», Day 6-7 2026-05-19).
// Per-shot LLM Plan author for video generation. Fired per shot after
// VID-animatic.APPROVED (when ANIMATOR_CHAIN_ENABLED is on) or manually via PA.
// Writes one SPC-shot_plan-<shot_id> asset that the Day 8 Critic validates
// and the Director approves; only then does the VGEN executor consume it.
//
// Event shape: { episodeId: uuid, shotId: string, revisionNote?: string }
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';
import { shortShotLabel } from '@/lib/api/vgen-shot-helpers';

export const execVanimPlan = createAgentInngestFunction({
  id: 'exec-vanim-plan',
  name: 'EXEC-VANIM: Author Shot Plan',
  agentId: 'EXEC-VANIM',
  concurrencyId: 'exec-vanim',
  eventName: 'sandystudio/exec-vanim/plan',
  operation: 'shot_plan_generation',
  inputAllowedStatuses: ['APPROVED', 'REVIEW', 'REVISION', 'DRAFT'],
  resolveRunArgs: (eventData) => {
    const shotId =
      typeof eventData.shotId === 'string' ? (eventData.shotId as string) : undefined;
    return shotId ? { shotId } : {};
  },
  // 2026-05-22 — surface shot label in activity titles.
  resolveActivityContext: (eventData) => {
    const shotId =
      typeof eventData.shotId === 'string' ? eventData.shotId : '';
    return {
      shortLabel: shortShotLabel(shotId),
      metadata: { shot_id: shotId || null },
    };
  },
  // Day 8 wiring: auto-fire Animator's Critic on the freshly-saved Plan.
  nextEvent: (saved, eventData) => {
    const shotId =
      typeof eventData.shotId === 'string' ? (eventData.shotId as string) : null;
    if (!shotId) return null;
    return {
      name: 'sandystudio/exec-vprev/review-plan',
      data: {
        episodeId: eventData.episodeId as string,
        planAssetId: saved.assetId,
        shotId,
      },
    };
  },
});
