// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-pub.ts
// EXEC-PUB Publisher — uploads to YouTube + emits the `published` event.
//
// HARD GOVERNANCE LIMIT (CLAUDE.md §6, phase-4-jiggly-wave.md §4.4):
//   This event MUST carry `directorConfirm: true` in every mode or the
//   gate fails with NonRetriableError (publish is a Director-only hard limit).
//
// Concurrency limit 1 — YouTube Data API quota is sequential to avoid burn.
// runAgent emits the `sandystudio/exec-pub/published` event in result.next_event;
// the factory dispatches it.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execPubPublish = createAgentInngestFunction({
  id: 'exec-pub-publish',
  name: 'EXEC-PUB: Publish to YouTube',
  agentId: 'EXEC-PUB',
  concurrencyId: 'exec-pub',
  eventName: 'sandystudio/exec-pub/publish',
  operation: 'publish',
  // No nextEvent here — runAgent's result.next_event carries
  // sandystudio/exec-pub/published, which the factory dispatches.
});
