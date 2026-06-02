// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-copy.ts
// EXEC-COPY Copywriter — writes YouTube metadata (title/description/tags).
// Triggered after script approval. Fans out to EXEC-THUMB-DESIGNER (the viral
// thumbnail Plan author), which in turn chains to the EXEC-THUMB renderer.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execCopyWriteMetadata = createAgentInngestFunction({
  id: 'exec-copy-write-metadata',
  name: 'EXEC-COPY: Write Metadata',
  agentId: 'EXEC-COPY',
  concurrencyId: 'exec-copy',
  eventName: 'sandystudio/exec-copy/write-metadata',
  operation: 'metadata_writing',
  nextEvent: (saved, eventData) => ({
    name: 'sandystudio/exec-thumb-designer/plan',
    data: {
      episodeId: eventData.episodeId as string,
      assetId: saved.assetId,
    },
  }),
});
