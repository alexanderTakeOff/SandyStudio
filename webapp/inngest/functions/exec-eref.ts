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
import { recordCost } from '@/lib/budget';
import { clearErefCancel } from '@/lib/api/eref-cancel';
import {
  loadAgentInputs,
  insertJobRow,
  markJobCompleted,
  markJobFailed,
  closeOpenJobsForRun,
} from '@/lib/agents/runner';
import { validateAgentInputs } from '@/lib/agents/gate';
import { logEvent } from '@/lib/api/events';
import { agentDisplayName } from '@/lib/api/agent-names';
import { NonRetriableError } from 'inngest';

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
    // ── Job-row close guarantee (E33, 2026-07-29) ──────────────────────────
    // This is the function whose row actually leaked: on 2026-07-29 an
    // EXEC-EREF job sat RUNNING for hours because the app process died mid-step
    // — the `catch` below never ran, because NO user code ran. onFailure is
    // invoked from the outside, once, after retries are exhausted, so it is the
    // only hook that survives a dead worker. Same shape as the factory's.
    onFailure: async ({ event, error }: { event: { data?: { run_id?: string } }; error: Error }) => {
      const failedRunId = typeof event?.data?.run_id === 'string' ? event.data.run_id : null;
      if (!failedRunId) return;
      try {
        await closeOpenJobsForRun(
          createSupabaseServiceRoleClient(),
          failedRunId,
          `EXEC-EREF run failed after retries — ${error?.message ?? 'unknown error'}`,
        );
      } catch {
        // Best-effort — the hourly reaper still sits behind this.
      }
    },
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

      // 2026-07-25 — the 4K upscale is a PAID fal call fired on every Director
      // APPROVE of a reference asset, and its cost was previously returned in the
      // Inngest run output and thrown away. Nothing reached budget_log, so the
      // money page under-reported every episode by one upscale per approved ref.
      // jobId=null (this branch has no job row, same convention as the direct
      // Director rerolls in /api/assets/[id]/regenerate-image); enforceCeiling
      // false because the money is already spent — blocking here would only lose
      // the audit row.
      if (result.cost_usd > 0) {
        await step.run('record-upscale-cost', async () => {
          const supabase = createSupabaseServiceRoleClient();
          await recordCost(supabase, {
            jobId: null,
            // Prefer the asset's own episode over the event payload — the ledger
            // must bill the episode that actually owns the reference.
            episodeId: result.episode_id ?? episodeId ?? null,
            agentId: 'EXEC-EREF',
            costUsd: result.cost_usd,
            apiProvider: result.provider_id ?? 'fal_ai',
            modelOrTier: result.model ?? 'upscale-4k',
            operation: 'image_upscale',
            enforceCeiling: false,
          });
        });
      }

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
        inputSnapshot: data as unknown as Record<string, unknown>,
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

      // I4 (gate universality, 2026-06-04): the same readiness gate every
      // factory agent passes — upstream APPROVED storyboard + LOCKED Series
      // Bible canon + media-reachability preflight — BEFORE the paid gpt-image
      // fan-out. Replaces the hand-rolled factory-bypass. Only the start/fanout
      // generation path is gated (the upscale branch returned earlier).
      const gate = await step.run('load-and-validate', async () => {
        const supabase = createSupabaseServiceRoleClient();
        await loadAgentInputs({ supabase, agentId: 'EXEC-EREF', episodeId });
        return validateAgentInputs({ supabase, agentId: 'EXEC-EREF', episodeId });
      });
      if (!gate.passed) {
        await step.run('mark-failed-gate', async () => {
          const supabase = createSupabaseServiceRoleClient();
          await markJobFailed(supabase, job.id, gate.reason ?? 'Gate failed');
        });
        throw new NonRetriableError(gate.reason ?? 'Gate failed for EXEC-EREF');
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

      // 2026-07-25 — this function deliberately bypasses `createAgentInngestFunction`
      // (see the header note), and in doing so it also skipped the factory's
      // `record-cost` step. So the ENTIRE reference image spend of the legacy
      // pilot + fan-out path — the biggest image bill in the pipeline, fired by the
      // Director's own EXEC-EREF trigger button — went to activity_events metadata
      // only and never to budget_log. Recorded here as its own step so an Inngest
      // retry of `run-episode-references` cannot double-bill: the step is memoised,
      // and the job-id unique index in recordCost is the second line of defence.
      if (result.costUsd > 0) {
        await step.run('record-cost', async () => {
          const supabase = createSupabaseServiceRoleClient();
          await recordCost(supabase, {
            jobId: job.id,
            episodeId,
            agentId: 'EXEC-EREF',
            costUsd: result.costUsd,
            apiProvider: 'fal_ai',
            modelOrTier: 'image_gen_multi',
            operation: isStart ? 'eref_pilot_generation' : 'eref_fanout_generation',
            // The images are already generated and billed by the time we get here;
            // refusing the audit row on a ceiling breach would only hide the spend.
            // The ceiling still guards the NEXT run through the readiness gate.
            enforceCeiling: false,
          });
        });
      }

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
        // I6 (loud observability): emit agent_failed (pa/notify-needed fires →
        // Polина/Director see it) instead of a silent console-only markJobFailed.
        try {
          await logEvent(supabase, {
            event_type: 'agent_failed',
            severity: 'error',
            title: `${agentDisplayName('EXEC-EREF')} failed`,
            description: message.slice(0, 500),
            actor: 'EXEC-EREF',
            episode_id: episodeId,
            job_id: job.id,
            metadata: {
              agent: 'EXEC-EREF',
              inngest_run_id: runId,
              error: message.slice(0, 500),
            },
          });
        } catch {
          // Swallow logging errors so we don't mask the original failure.
        }
        await markJobFailed(supabase, job.id, message);
      });
      throw err;
    }
  },
);
