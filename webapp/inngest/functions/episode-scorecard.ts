// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/episode-scorecard.ts
//
// Auto-generates the Episode Autonomy Scorecard at lifecycle milestones. Decoupled
// subscriber (mirrors reconcile-episode / schedule-analytics) so the generic
// factory stays untouched beyond a one-line fire-and-forget emit.
//
//   snapshot  ← sandystudio/scorecard/refresh  (factory emits on EXEC-STITCH done)
//   published ← sandystudio/exec-pub/published  (already emitted on publish)
//
// The analytics phase (audience metrics) is deferred until those metrics are
// actually populated — subscribing to exec-anal/collect now would write 4 near-
// identical rows per publish with no new data. Add the trigger with the metrics.
//
// Read-only source → writes one episode_scorecard row + one REV-scorecard .md
// asset. Debounced + concurrency-1 per episode, so a burst collapses safely.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { refreshScorecard } from '@/lib/agents/scorecard/persist-scorecard';
import type { ScorecardPhase } from '@/lib/agents/scorecard/compute-scorecard';

export const episodeScorecard = inngest.createFunction(
  {
    id: 'episode-scorecard',
    name: 'Episode Autonomy Scorecard',
    retries: 1,
    // Collapse a burst (final cut save + reconcile churn) into one compute.
    debounce: { period: '10s', key: 'event.data.episodeId' },
    // One scorecard compute per episode at a time.
    concurrency: { limit: 1, key: 'event.data.episodeId' },
  },
  [
    { event: 'sandystudio/scorecard/refresh' },
    { event: 'sandystudio/exec-pub/published' },
  ],
  async ({ event, step }) => {
    const episodeId = (event.data as { episodeId?: string })?.episodeId;
    if (!episodeId) return { skipped: 'no episodeId' };

    const phase: ScorecardPhase =
      event.name === 'sandystudio/exec-pub/published' ? 'published' : 'snapshot';

    const result = await step.run('refresh-scorecard', async () => {
      const supabase = createSupabaseServiceRoleClient();
      const { scorecardRowId, rec } = await refreshScorecard(supabase, episodeId, phase);
      // step.run must return JSON-serializable data.
      return {
        scorecardRowId,
        kpi1: rec.kpi1RunsPerShot,
        kpi2: rec.codeableTouchesTotal,
        autonomyPct: (rec.metrics as { autonomy_pct?: number }).autonomy_pct ?? null,
      };
    });

    return { ok: true, phase, episodeId, ...result };
  },
);
