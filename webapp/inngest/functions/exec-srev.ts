// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-srev.ts
// EXEC-SREV Script Reviewer — QA gate after EXEC-SW.
// On PASS: fans out to EXEC-SB and EXEC-COPY in parallel.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execSrevReviewScript = createAgentInngestFunction({
  id: 'exec-srev-review-script',
  name: 'EXEC-SREV: Review Script',
  agentId: 'EXEC-SREV',
  concurrencyId: 'exec-srev',
  eventName: 'sandystudio/exec-srev/review-script',
  operation: 'script_review',
  // Note: in mock mode we always PASS, so always fan out. In real mode the
  // verdict will be embedded in metadata; the orchestrator decides routing.
  nextEvent: (_saved, eventData) => ({
    name: 'sandystudio/exec-sb/create-storyboard',
    data: {
      episodeId: eventData.episodeId as string,
      scriptAssetId: eventData.scriptAssetId as string,
    },
  }),
});
