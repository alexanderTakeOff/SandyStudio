// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-edit.ts
// EXEC-EDIT Animatic Editor — assembles approved storyboard acts into a low-fi
// animatic. Now consumes a pre-generated music track too (Phase A.2 PR γ,
// LT-04, 2026-05-08): MGEN fires earlier (REV-world_check approval), so by
// the time EDIT runs the music is APPROVED and baked into the animatic for
// pacing review.
//
// Legacy multi-event fan-out (3 fake shots + 1 music) is preserved for
// replay-pilot's pre-Pilot-Pass path. New episodes go through the Pilot
// Pass flow that fires from VID-animatic APPROVED in approve/route.ts.
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
  // Legacy fan-out: replay-pilot's pre-Pilot-Pass path emits 3 fake shots
  // here. New flow does NOT use this branch — VID-animatic APPROVED →
  // EXEC-VGEN/start fires the Pilot Pass directly. MGEN no longer fires
  // here — moved to REV-world_check approval (Phase A.2 PR γ).
  nextEvent: (saved, eventData, result) => {
    const shotIds = (result.metadata.shot_ids as string[]) ?? [];
    const episodeId = eventData.episodeId as string;
    return shotIds.map((shotId) => ({
      name: 'sandystudio/exec-vgen/generate-shot',
      data: {
        episodeId,
        shotId,
        animaticAssetId: saved.assetId,
      },
    }));
  },
});
