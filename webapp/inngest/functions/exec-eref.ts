// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-eref.ts
// EXEC-EREF Episode Reference Generator — backbone v2 stage between Storyboard
// and Animatic (specs/glossary.md §4).
//
// MVP step: generates episode-specific reference images per unique location and
// character pose in the approved storyboard. Director approves these BEFORE the
// expensive Veo animatic so cost can be capped early.
//
// Step 5 (real): full gpt-image-1 fan-out per storyboard shot.
// Current: stub case in runner.ts produces one mock IMG-episode_ref asset so
// the pipeline view shows the correct backbone progression.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execErefGenerateReferences = createAgentInngestFunction({
  id: 'exec-eref-generate-references',
  name: 'EXEC-EREF: Generate Episode References',
  agentId: 'EXEC-EREF',
  concurrencyId: 'exec-eref',
  eventName: 'sandystudio/exec-eref/generate-references',
  operation: 'episode_reference_generation',
  nextEvent: (saved, eventData) => ({
    name: 'sandystudio/exec-edit/create-animatic',
    data: {
      episodeId: eventData.episodeId as string,
      storyboardAssetIds: [saved.assetId],
    },
  }),
});
