// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-thumb-designer.ts
// EXEC-THUMB-DESIGNER — LLM author of the viral YouTube thumbnail Plan
// (distribution tail, 2026-06-01). Fired when SPC-metadata is APPROVED.
// Writes ONE SPC-thumb_plan asset holding N distinct high-CTR concepts; the
// Director approves it, then approve-route fires exec-thumb/generate-thumbnail
// with the planAssetId so the executor renders the variants.
//
// In Mode 4 (auto-chain) nextEvent auto-fires the renderer with the freshly
// saved plan id; in Modes 1-3 the chain is suppressed and the Director's plan
// approval fires the renderer instead.
//
// Event shape: { episodeId, assetId?, revisionNote? }
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execThumbDesignerPlan = createAgentInngestFunction({
  id: 'exec-thumb-designer-plan',
  name: 'EXEC-THUMB-DESIGNER: Author Thumbnail Plan',
  agentId: 'EXEC-THUMB-DESIGNER',
  concurrencyId: 'exec-thumb-designer',
  eventName: 'sandystudio/exec-thumb-designer/plan',
  operation: 'thumbnail_plan_generation',
  // Designer must see its own prior DRAFT/REVIEW Plans so a re-fire after
  // REQUEST_REVISION treats the note as a hard contract.
  inputAllowedStatuses: ['APPROVED', 'REVIEW', 'REVISION', 'DRAFT'],
  // Mode-4 auto-chain only (factory gates nextEvent to Mode 4 / Critic events);
  // Modes 1-3 wait for the Director to approve the Plan.
  nextEvent: (saved, eventData) => ({
    name: 'sandystudio/exec-thumb/generate-thumbnail',
    data: {
      episodeId: eventData.episodeId as string,
      planAssetId: saved.assetId,
    },
  }),
});
