// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-eref.ts
// EXEC-EREF — Episode Reference Generator (v2 Pilot Pass + Fan-out + Upscale).
//
// One Inngest function subscribes to FOUR events and branches on event.name:
//   - sandystudio/exec-eref/start              → run pilot pass (pilot_count=2)
//   - sandystudio/exec-eref/fanout-trigger     → resume from start_index
//   - sandystudio/exec-eref/upscale-final      → upscale a single asset to 4K
//   - sandystudio/exec-eref/generate-references → legacy path (treated as /start)
//
// Concurrency:
//   - Pilot/fan-out paths are episode-keyed at limit 1 (avoid file-name races
//     and duplicate spend per technology.md §4).
//   - Upscale paths are also episode-keyed at limit 1 to keep the Director
//     UX deterministic; per-asset parallelism would surprise the budget log.
//
// We bypass `createAgentInngestFunction` because the factory takes a single
// event name and inserts a Job row + activity events; the v2 runner handles
// both internally and we want minimal ceremony for the upscale branch.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { concurrencyFor } from '@/lib/inngest/concurrency';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  runEpisodeReferences,
  EpisodeReferencesError,
} from '@/lib/agents/runners/episode-references';
import { runUpscaleOnly } from '@/lib/agents/runners/eref-upscale-only';
import { clearErefCancel } from '@/lib/api/eref-cancel';
import { loadAgentInputs, insertJobRow, markJobCompleted, markJobFailed } from '@/lib/agents/runner';

interface ErefEventData {
  episodeId: string;
  pilot_count?: number;
  start_index?: number;
  assetId?: string;
  storyboardAssetId?: string;
}

const DEFAULT_PILOT_COUNT = 2;

export const execErefStart = inngest.createFunction(
  {
    id: 'exec-eref',
    name: 'EXEC-EREF: Generate Episode References (Pilot+Fanout+Upscale)',
    retries: 2,
    concurrency: concurrencyFor('exec-eref'),
  },
  // Multi-event subscription — branch on event.name in the handler.
  [
    { event: 'sandystudio/exec-eref/start' },
    { event: 'sandystudio/exec-eref/fanout-trigger' },
    { event: 'sandystudio/exec-eref/upscale-final' },
    // Backward-compat — remove after one release once no in-flight events
    // remain. Treated identically to /start.
    { event: 'sandystudio/exec-eref/generate-references' },
  ],
  async ({ event, step, runId }) => {
    const data = event.data as ErefEventData;
    const { episodeId } = data;

    // ── Branch: upscale-final ─────────────────────────────────────────────
    if (event.name === 'sandystudio/exec-eref/upscale-final') {
      if (!data.assetId) {
        return { ok: false, reason: 'upscale-final event missing assetId' };
      }
      const result = await step.run('upscale-asset', async () => {
        const supabase = createSupabaseServiceRoleClient();
        return runUpscaleOnly({ assetId: data.assetId as string, supabase });
      });
      return {
        ok: result.ok,
        kind: 'upscale',
        assetId: data.assetId,
        reason: result.reason,
        cost_usd: result.cost_usd,
        final_4k_url: result.final_4k_url,
      };
    }

    // ── Branch: pilot start (or legacy /generate-references) ──────────────
    const isLegacy =
      event.name === 'sandystudio/exec-eref/generate-references';
    const isStart = event.name === 'sandystudio/exec-eref/start' || isLegacy;

    // Insert a Job row so Pipeline View shows EXEC-EREF as RUNNING.
    const job = await step.run('insert-job-row', async () => {
      const supabase = createSupabaseServiceRoleClient();
      return insertJobRow({
        supabase,
        agentId: 'EXEC-EREF',
        episodeId,
        inngestEvent: event.name,
        inngestRunId: runId,
        inputSnapshot: data as Record<string, unknown>,
      });
    });

    try {
      // Clear any stale cancel token from a prior run on /start.
      if (isStart) {
        await step.run('clear-cancel-token', async () => {
          const supabase = createSupabaseServiceRoleClient();
          await clearErefCancel(supabase, episodeId);
        });
      }

      const result = await step.run('run-episode-references', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const inputs = await loadAgentInputs({
          supabase,
          agentId: 'EXEC-EREF',
          episodeId,
        });
        const ep = inputs.episode as { episode_code?: string } | undefined;

        if (isStart) {
          return runEpisodeReferences({
            inputs,
            supabase,
            episodeCode: ep?.episode_code,
            pilot_count: data.pilot_count ?? DEFAULT_PILOT_COUNT,
          });
        }
        // fanout-trigger
        return runEpisodeReferences({
          inputs,
          supabase,
          episodeCode: ep?.episode_code,
          start_index: data.start_index ?? DEFAULT_PILOT_COUNT,
        });
      });

      await step.run('mark-completed', async () => {
        const supabase = createSupabaseServiceRoleClient();
        // Job row links to the FIRST inserted asset (best-effort) so the
        // Pipeline View has something to click through to.
        const firstAssetId = result.insertedAssetIds[0];
        await markJobCompleted(supabase, job.id, firstAssetId ?? null);
        await supabase
          .from('activity_events')
          .insert({
            event_type: 'agent_completed',
            severity: 'info',
            title: isStart
              ? 'EXEC-EREF pilot pass completed'
              : 'EXEC-EREF fan-out completed',
            description: result.description,
            actor: 'EXEC-EREF',
            episode_id: episodeId,
            asset_id: firstAssetId ?? null,
            job_id: job.id,
            metadata: {
              cancelled: result.cancelled ?? false,
              completed_shots: result.completedShots ?? result.insertedAssetIds.length,
              cost_usd: result.costUsd,
              kind: isStart ? 'eref_pilot' : 'eref_fanout',
            },
          } as never);
      });

      return {
        ok: true,
        kind: isStart ? 'pilot' : 'fanout',
        jobId: job.id,
        completed: result.completedShots ?? result.insertedAssetIds.length,
        cancelled: result.cancelled ?? false,
        cost_usd: result.costUsd,
      };
    } catch (err) {
      await step.run('mark-failed', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const message =
          err instanceof EpisodeReferencesError
            ? `EXEC-EREF: ${err.message}`
            : err instanceof Error
              ? err.message
              : 'unknown error';
        await markJobFailed(supabase, job.id, message);
      });
      throw err;
    }
  },
);
