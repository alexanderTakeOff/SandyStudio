// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-vgen.ts
// EXEC-VGEN Visual Generator — generates one shot per event.
// Triggered N times in parallel (one per shot) via EXEC-EDIT's fan-out.
// Concurrency limit 3 — strictest, since real fal.ai/Kling have tight quotas.
//
// Terminal: shot assets pile up in DRAFT. EXEC-PUB picks them up after
// Director approves the whole batch.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execVgenGenerateShot = createAgentInngestFunction({
  id: 'exec-vgen-generate-shot',
  name: 'EXEC-VGEN: Generate Shot',
  agentId: 'EXEC-VGEN',
  concurrencyId: 'exec-vgen',
  eventName: 'sandystudio/exec-vgen/generate-shot',
  operation: 'video_generation',
  resolveRunArgs: (eventData) => ({
    shotId: eventData.shotId as string,
  }),
  // No fan-out: shots collect for batch approval before publish.
});
