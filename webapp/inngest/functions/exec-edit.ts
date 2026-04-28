// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-edit.ts
// EXEC-EDIT Animatic Editor — assembles approved storyboard acts into a low-fi
// animatic. Critical fan-out point: emits one EXEC-VGEN event per shot AND
// one EXEC-MGEN event for music. After this, EXEC-PUB waits for all shots +
// music + thumb + metadata to be APPROVED.
//
// Cost-protection rationale (per agents/exec/editor.md): catches pacing
// problems for $0 before the expensive per-shot VGEN fan-out begins.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execEditCreateAnimatic = createAgentInngestFunction({
  id: 'exec-edit-create-animatic',
  name: 'EXEC-EDIT: Create Animatic',
  agentId: 'EXEC-EDIT',
  concurrencyId: 'exec-edit',
  eventName: 'sandystudio/exec-edit/create-animatic',
  operation: 'animatic_assembly',
  // Multi-event fan-out: N shots + 1 music. shot_ids come from runAgent's
  // mock output metadata; in real mode they come from the storyboard.
  nextEvent: (saved, eventData, result) => {
    const shotIds = (result.metadata.shot_ids as string[]) ?? [];
    const episodeId = eventData.episodeId as string;
    return [
      ...shotIds.map((shotId) => ({
        name: 'sandystudio/exec-vgen/generate-shot',
        data: {
          episodeId,
          shotId,
          animaticAssetId: saved.assetId,
        },
      })),
      {
        name: 'sandystudio/exec-mgen/generate-music',
        data: {
          episodeId,
          animaticAssetId: saved.assetId,
          section: 'main',
        },
      },
    ];
  },
});
