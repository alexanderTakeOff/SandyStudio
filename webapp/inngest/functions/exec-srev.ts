// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-srev.ts
// EXEC-SREV Story Editor — QA gate after Writer.
// Routing by verdict (2026-05-12 Director directive — close the internal
// Writer↔Story Editor loop so Director only sees PASS drafts):
//   PASS / PASS-WITH-NOTES → fan out to Storyboard Artist + Publicist
//   REVISE / FAIL          → fire Writer again with the review markdown as
//                            revisionNote (factory forwards to runScreenwriter)
// In mock mode the runner always returns PASS — fan-out continues as before.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execSrevReviewScript = createAgentInngestFunction({
  id: 'exec-srev-review-script',
  name: 'EXEC-SREV: Review Script',
  agentId: 'EXEC-SREV',
  concurrencyId: 'exec-srev',
  eventName: 'sandystudio/exec-srev/review-script',
  operation: 'script_review',
  // Story Editor IS the gate from REVIEW to APPROVED — without this override
  // the input loader (`loadAgentInputs` in runner.ts) filters out the very
  // script under review. Closes the 3rd layer of the gate→runner→loader
  // REVIEW-status bug (2026-05-12 hot-fix).
  inputAllowedStatuses: ['APPROVED', 'REVIEW', 'REVISION'],
  nextEvent: (_saved, eventData, result) => {
    const verdict = (result?.metadata as { verdict?: string } | undefined)?.verdict;
    const reviewMarkdown =
      (result?.metadata as { markdown?: string } | undefined)?.markdown ?? '';

    // REVISE / FAIL → bounce back to Writer, do NOT advance pipeline.
    if (verdict === 'REVISE' || verdict === 'FAIL') {
      return {
        name: 'sandystudio/exec-sw/write-script',
        data: {
          episodeId: eventData.episodeId as string,
          // Forward Story Editor's review markdown as the revision note
          // (factory.ts pulls revisionNote from event data → runScreenwriter).
          // Writer's prompt now treats this as HARD ACCEPTANCE CRITERIA.
          revisionNote: reviewMarkdown,
        },
      };
    }

    // PASS / PASS-WITH-NOTES / UNKNOWN / mock → continue downstream.
    return {
      name: 'sandystudio/exec-sb/create-storyboard',
      data: {
        episodeId: eventData.episodeId as string,
        scriptAssetId: eventData.scriptAssetId as string,
      },
    };
  },
});
