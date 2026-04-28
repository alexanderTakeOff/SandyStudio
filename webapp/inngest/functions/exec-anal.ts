// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-anal.ts
// EXEC-ANAL Analytics Collector — pulls YouTube metrics at one collection point.
// Triggered by schedule-analytics fan-out (T+1h/24h/7d/30d).
// Concurrency 2 — YouTube Analytics API allows slight parallelism.
//
// Phase 4 mock returns all-zero metrics per providers.yaml mock.outputs.analytics_collect.
// The asset row carries the report; full analytics_reports row insertion is
// part of saveAgentOutput's per-agent path (TODO Sprint 10 if needed).
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execAnalCollect = createAgentInngestFunction({
  id: 'exec-anal-collect',
  name: 'EXEC-ANAL: Collect Analytics',
  agentId: 'EXEC-ANAL',
  concurrencyId: 'exec-anal',
  eventName: 'sandystudio/exec-anal/collect',
  operation: 'analytics_collection',
  resolveRunArgs: (eventData) => ({
    collectionPoint: eventData.collectionPoint as 'T+1h' | 'T+24h' | 'T+7d' | 'T+30d',
    youtubeVideoId: eventData.youtubeVideoId as string,
  }),
});
