// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/reconcile-episode.ts
//
// Фаза 2b — the self-advance consumer. Sole subscriber to
// `sandystudio/reconcile/episode`. Runs the reconciler executor for the episode
// (auto-approve the mechanical PASS stages the plan allows, fire the stitch,
// surface HALTs) and dispatches the returned cascade events, which in turn make
// the next agents run — closing the "factory drives itself" loop.
//
// Inert unless MECHANICS_AUTO_ADVANCE is on: reconcileEpisode checks the flag
// and returns EMPTY when off, so even a stray trigger is a no-op. Idempotent —
// an already-APPROVED cell yields no action, so overlapping triggers are safe.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { reconcileEpisode } from '@/lib/agents/reconcile-execute';

export const reconcileEpisodeFn = inngest.createFunction(
  {
    id: 'reconcile-episode',
    name: 'Reconcile Episode (Фаза 2b self-advance)',
    retries: 1,
    // Collapse a burst of completions for one episode into a single convergence
    // pass — the reconciler is idempotent, so this is purely an efficiency win.
    debounce: { period: '5s', key: 'event.data.episodeId' },
    // One convergence pass per episode at a time — avoids two passes racing on
    // the same REVIEW cells.
    concurrency: { limit: 1, key: 'event.data.episodeId' },
  },
  { event: 'sandystudio/reconcile/episode' },
  async ({ event, step }) => {
    const episodeId = event.data?.episodeId;
    if (!episodeId) return { skipped: 'no episodeId' };

    const result = await step.run('reconcile', async () => {
      const supabase = createSupabaseServiceRoleClient();
      const r = await reconcileEpisode(supabase, episodeId);
      // step.run must return JSON-serializable data.
      return {
        ran: r.ran,
        events: r.events,
        approved: r.approvedAssetIds.length,
        halted: r.halted.length,
      };
    });

    if (result.events.length > 0) {
      await step.sendEvent(
        'reconcile-cascade',
        result.events.map((ev) => ({ name: ev.name, data: ev.data })) as never,
      );
    }

    return { ran: result.ran, approved: result.approved, halted: result.halted };
  },
);
