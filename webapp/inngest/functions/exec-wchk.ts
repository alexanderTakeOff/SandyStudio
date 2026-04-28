// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-wchk.ts
// EXEC-WCHK World Checker — verifies storyboard against world bible rules.
// On PASS: hands off to EXEC-EDIT for animatic assembly.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execWchkCheckWorld = createAgentInngestFunction({
  id: 'exec-wchk-check-world',
  name: 'EXEC-WCHK: Check World Consistency',
  agentId: 'EXEC-WCHK',
  concurrencyId: 'exec-wchk',
  eventName: 'sandystudio/exec-wchk/check-world',
  operation: 'world_check',
  nextEvent: (_saved, eventData) => ({
    name: 'sandystudio/exec-edit/create-animatic',
    data: {
      episodeId: eventData.episodeId as string,
      storyboardAssetIds: eventData.storyboardAssetIds as string[],
    },
  }),
});
