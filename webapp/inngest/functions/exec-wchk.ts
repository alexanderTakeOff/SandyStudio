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
  // 2026-06-14 WCHK ordering fix: the Continuity Critic, like the Script Critic
  // (exec-srev), runs PRE-approval — fired from the CREAD-PASS critic chain
  // while the storyboard is still REVIEW. Default ['APPROVED'] left upstream
  // empty of the board → runContinuityCheck's precondition threw "APPROVED
  // STB not found", and it never re-fired on approval (the E09 stall). Accept
  // reviewable statuses so the REVIEW board is in upstream, mirroring SREV.
  inputAllowedStatuses: ['APPROVED', 'REVIEW', 'REVISION'],
  nextEvent: (_saved, eventData) => ({
    name: 'sandystudio/exec-edit/create-animatic',
    data: {
      episodeId: eventData.episodeId as string,
      storyboardAssetIds: eventData.storyboardAssetIds as string[],
    },
  }),
});
