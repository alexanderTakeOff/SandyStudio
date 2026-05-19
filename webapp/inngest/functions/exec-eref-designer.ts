// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-eref-designer.ts
// EXEC-EREF-DESIGNER — LLM Plan author for the Episode Reference pipeline
// (Sprint «Дизайнер и Аниматор», Day 3, Option A wiring 2026-05-18).
//
// Triggered per shot. Writes a SPC-ref_plan-<shot_id> asset (DRAFT). The
// Critic (EXEC-EPREV, Day 4) auto-fires on the resulting `plan_proposed`
// activity event and validates the Plan. Director then approves; only
// after APPROVED does the legacy EXEC-EREF executor consume the Plan and
// call the actual image provider (Day 3 wiring TODO — refactor
// episode-references.ts to read APPROVED Plan).
//
// Event shape: { episodeId: uuid, shotId: string, revisionNote?: string }
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execErefDesignerPlan = createAgentInngestFunction({
  id: 'exec-eref-designer-plan',
  name: 'EXEC-EREF-DESIGNER: Author Reference Plan',
  agentId: 'EXEC-EREF-DESIGNER',
  concurrencyId: 'exec-eref-designer',
  eventName: 'sandystudio/exec-eref-designer/plan',
  operation: 'eref_plan_generation',
  // Designer needs to see its own previously-rejected DRAFT/REVIEW Plans so it
  // can compute prior_plan_version + treat the Critic's revisionNote as a HARD
  // contract on the next iteration. Mirrors EXEC-SREV's REVIEW-status loader.
  inputAllowedStatuses: ['APPROVED', 'REVIEW', 'REVISION', 'DRAFT'],
  resolveRunArgs: (eventData) => {
    const shotId =
      typeof eventData.shotId === 'string' ? (eventData.shotId as string) : undefined;
    return shotId ? { shotId } : {};
  },
  // Day 4 wiring (2026-05-19): auto-fire Critic on the freshly-saved Plan.
  // The Critic runs V01-V09 hard checks and either PASSes (Plan stays in
  // REVIEW for Director) or REVISEs (Plan flips to REVISION; Critic's own
  // nextEvent re-fires Designer with acceptance_criteria as hard contract).
  // On APPROVED Plan, a separate approve-route handler fires
  // 'sandystudio/exec-eref/execute-from-plan'.
  nextEvent: (saved, eventData) => {
    const shotId =
      typeof eventData.shotId === 'string' ? (eventData.shotId as string) : null;
    if (!shotId) return null;
    return {
      name: 'sandystudio/exec-eprev/review-plan',
      data: {
        episodeId: eventData.episodeId as string,
        planAssetId: saved.assetId,
        shotId,
      },
    };
  },
});
