// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-sb.ts
// EXEC-SB Storyboarder — decomposes script into 3 storyboard acts.
// Fans out to EXEC-WCHK for QA. Per spec, EXEC-COPY fires in parallel via
// EXEC-SREV's fan-out chain (script approved triggers metadata writing).
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execSbCreateStoryboard = createAgentInngestFunction({
  id: 'exec-sb-create-storyboard',
  name: 'EXEC-SB: Create Storyboard',
  agentId: 'EXEC-SB',
  concurrencyId: 'exec-sb',
  eventName: 'sandystudio/exec-sb/create-storyboard',
  operation: 'storyboard_generation',
  nextEvent: (saved, eventData) => ({
    name: 'sandystudio/exec-wchk/check-world',
    data: {
      episodeId: eventData.episodeId as string,
      // Mock mode produces a single storyboard asset with all 3 acts inline.
      // Real mode will pass an array of 3 act asset ids; the gate checks
      // for STB count regardless.
      storyboardAssetIds: [saved.assetId],
    },
  }),
});
