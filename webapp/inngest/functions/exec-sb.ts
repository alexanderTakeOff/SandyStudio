// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-sb.ts
// EXEC-SB Storyboarder — decomposes script into 3 storyboard acts.
// Fans out to EXEC-WCHK for QA. Per spec, EXEC-COPY fires in parallel via
// EXEC-SREV's fan-out chain (script approved triggers metadata writing).
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';
import { readabilityGateEnabled } from '@/lib/agents/chain-flags';

export const execSbCreateStoryboard = createAgentInngestFunction({
  id: 'exec-sb-create-storyboard',
  name: 'EXEC-SB: Create Storyboard',
  agentId: 'EXEC-SB',
  concurrencyId: 'exec-sb',
  eventName: 'sandystudio/exec-sb/create-storyboard',
  operation: 'storyboard_generation',
  nextEvent: (saved, eventData) => {
    // C1-Gate sprint 2026-06-10 — when READABILITY_GATE_ENABLED is on, the
    // Creative Readability Critic reads the storyboard BEFORE the Continuity
    // Critic. Flag off → byte-identical legacy WCHK fire (replay-pilot).
    if (readabilityGateEnabled()) {
      return {
        name: 'sandystudio/exec-cread/review-storyboard',
        data: {
          episodeId: eventData.episodeId as string,
          storyboardAssetId: saved.assetId,
        },
      };
    }
    return {
      name: 'sandystudio/exec-wchk/check-world',
      data: {
        episodeId: eventData.episodeId as string,
        // Mock mode produces a single storyboard asset with all 3 acts inline.
        // Real mode will pass an array of 3 act asset ids; the gate checks
        // for STB count regardless.
        storyboardAssetIds: [saved.assetId],
      },
    };
  },
});
