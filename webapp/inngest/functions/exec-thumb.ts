// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-thumb.ts
// EXEC-THUMB Thumbnail Creator — generates YouTube thumbnail (1280×720 PNG).
// Triggered by EXEC-COPY after metadata approval.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execThumbGenerateThumbnail = createAgentInngestFunction({
  id: 'exec-thumb-generate-thumbnail',
  name: 'EXEC-THUMB: Generate Thumbnail',
  agentId: 'EXEC-THUMB',
  concurrencyId: 'exec-thumb',
  eventName: 'sandystudio/exec-thumb/generate-thumbnail',
  operation: 'thumbnail_generation',
  // Plan-driven: carry the APPROVED SPC-thumb_plan id into the runner so the
  // executor renders the designed variants (absent → mock placeholder).
  resolveRunArgs: (eventData) => {
    const planAssetId =
      typeof eventData.planAssetId === 'string' ? (eventData.planAssetId as string) : undefined;
    return planAssetId ? { planAssetId } : {};
  },
  // Terminal — thumbnails join the pile awaiting Director approval before publish.
});
