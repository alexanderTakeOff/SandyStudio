// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-mgen.ts
// EXEC-MGEN Music Generator — produces one music track per section.
// Triggered by EXEC-EDIT after animatic approval.
// Concurrency limit 2 — Suno/Udio quotas tighter than image/video.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execMgenGenerateMusic = createAgentInngestFunction({
  id: 'exec-mgen-generate-music',
  name: 'EXEC-MGEN: Generate Music',
  agentId: 'EXEC-MGEN',
  concurrencyId: 'exec-mgen',
  eventName: 'sandystudio/exec-mgen/generate-music',
  operation: 'music_generation',
  resolveRunArgs: (eventData) => ({
    section: eventData.section as string,
  }),
});
