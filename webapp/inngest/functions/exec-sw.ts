// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-sw.ts
// EXEC-SW Screenwriter — first agent in the production pipeline.
// Reads APPROVED brief, produces a script asset, fans out to EXEC-SREV.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execSwWriteScript = createAgentInngestFunction({
  id: 'exec-sw-write-script',
  name: 'EXEC-SW: Write Script',
  agentId: 'EXEC-SW',
  concurrencyId: 'exec-sw',
  eventName: 'sandystudio/exec-sw/write-script',
  operation: 'script_generation',
  nextEvent: (saved, eventData) => ({
    name: 'sandystudio/exec-srev/review-script',
    data: {
      episodeId: eventData.episodeId as string,
      scriptAssetId: saved.assetId,
    },
  }),
});
