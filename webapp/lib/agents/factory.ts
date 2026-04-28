// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/factory.ts
// createAgentInngestFunction — emits an Inngest function with the canonical
// 6-step shape from phase-4-jiggly-wave.md §3.
//
// Why a factory:
//   - 11 production agents share the same shape (insert → load+validate →
//     execute → record-cost → save-and-complete → fan-out)
//   - Per-agent variations are small: agent id, event name, fan-out target,
//     extra event-data fields (shotId, section, collectionPoint)
//   - Without a factory, each function file would be ~100 lines of paste
//   - With it, each function file is ~30 lines declaring just the variations
//
// Specialized cases (EXEC-PUB governance, EXEC-EDIT per-shot fan-out, the
// schedule-analytics cron) bypass this factory and write the function inline.
// ──────────────────────────────────────────────────────────────────────────────

import { NonRetriableError } from 'inngest';

import { inngest } from '../inngest/client';
import { concurrencyFor, type AgentConcurrencyId } from '../inngest/concurrency';
import { recordCost } from '../budget';
import { validateAgentInputs } from './gate';
import {
  insertJobRow,
  loadAgentInputs,
  markJobCompleted,
  markJobFailed,
  runAgent,
  saveAgentOutput,
  type RunAgentArgs,
} from './runner';
import type { AgentResult } from './types';
import { resolveModelId } from './registry';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import type { AgentId } from './types';

/** Spec passed to createAgentInngestFunction. */
export interface AgentFunctionSpec<EventName extends string = string> {
  /** Inngest function id (kebab-case). */
  id: string;
  /** Display name for Inngest UI. */
  name: string;
  /** AgentId from registry. */
  agentId: AgentId;
  /** Concurrency lookup key (lowercase agent code). */
  concurrencyId: AgentConcurrencyId;
  /** Event this function listens to. */
  eventName: EventName;
  /** Operation label written to budget_log. */
  operation: string;
  /** Inngest retry count. Default 2. */
  retries?: number;
  /**
   * Optional next-event emitter. Receives the saved asset id, original
   * event data, AND the runAgent result (so callbacks can read metadata
   * like shot counts). Returns one event, an array of events for fan-out,
   * or null for no further dispatch.
   */
  nextEvent?: (
    saved: { assetId: string },
    eventData: Record<string, unknown>,
    result: AgentResult
  ) =>
    | { name: string; data: Record<string, unknown> }
    | Array<{ name: string; data: Record<string, unknown> }>
    | null;
  /**
   * Optional resolver for runAgent extras (shotId, section, collectionPoint,
   * youtubeVideoId). Defaults to no extras.
   */
  resolveRunArgs?: (eventData: Record<string, unknown>) => Partial<
    Pick<RunAgentArgs, 'shotId' | 'section' | 'collectionPoint' | 'youtubeVideoId'>
  >;
}

export function createAgentInngestFunction<E extends string>(
  spec: AgentFunctionSpec<E>
) {
  return inngest.createFunction(
    {
      id: spec.id,
      name: spec.name,
      // Inngest types retries as a literal union 0..20; default to 2.
      retries: (spec.retries ?? 2) as 2,
      concurrency: concurrencyFor(spec.concurrencyId),
    },
    // The cast is safe: caller passes a string literal that matches a known
    // Events key. Validation is enforced at the wiring site, not here.
    { event: spec.eventName as E },
    async ({ event, step, runId }) => {
      const eventData = event.data as Record<string, unknown> & {
        episodeId: string;
      };
      const { episodeId } = eventData;

      // ── Step 1: insert RUNNING job row ─────────────────────────────────────
      const job = await step.run('insert-job-row', async () => {
        const supabase = createSupabaseServiceRoleClient();
        return insertJobRow({
          supabase,
          agentId: spec.agentId,
          episodeId,
          inngestEvent: spec.eventName,
          inngestRunId: runId,
          inputSnapshot: eventData,
        });
      });

      // ── Step 2: load + validate (one checkpoint) ───────────────────────────
      const gate = await step.run('load-and-validate', async () => {
        const supabase = createSupabaseServiceRoleClient();
        await loadAgentInputs({
          supabase,
          agentId: spec.agentId,
          episodeId,
        });
        return validateAgentInputs({
          supabase,
          agentId: spec.agentId,
          episodeId,
          eventContext: {
            directorConfirm: eventData.directorConfirm as boolean | undefined,
            confirmedBy: eventData.confirmedBy as string | undefined,
          },
        });
      });

      if (!gate.passed) {
        await step.run('mark-failed-gate', async () => {
          const supabase = createSupabaseServiceRoleClient();
          await markJobFailed(supabase, job.id, gate.reason ?? 'Gate failed');
        });
        throw new NonRetriableError(gate.reason ?? `Gate failed for ${spec.agentId}`);
      }

      // ── Step 3: execute agent ──────────────────────────────────────────────
      const exec = await step.run('execute-agent', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const inputs = await loadAgentInputs({
          supabase,
          agentId: spec.agentId,
          episodeId,
        });
        const runArgs: RunAgentArgs = {
          agentId: spec.agentId,
          inputs,
          ...(spec.resolveRunArgs ? spec.resolveRunArgs(eventData) : {}),
        };
        return runAgent(runArgs);
      });

      // ── Step 4: idempotent cost record ─────────────────────────────────────
      await step.run('record-cost', async () => {
        const supabase = createSupabaseServiceRoleClient();
        return recordCost(supabase, {
          jobId: job.id,
          episodeId,
          agentId: spec.agentId,
          costUsd: exec.result.cost_usd,
          apiProvider: 'mock',
          modelOrTier: resolveModelId(spec.agentId) || 'mock',
          operation: spec.operation,
        });
      });

      // ── Step 5: save asset + mark job COMPLETED ────────────────────────────
      const saved = await step.run('save-and-complete', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const { data: ep, error } = await supabase
          .from('episodes')
          .select('episode_code')
          .eq('id', episodeId)
          .single();
        if (error) {
          throw new Error(`save-and-complete: episode lookup failed: ${error.message}`);
        }
        // Variant carries shot/section info into the filename so multiple
        // assets-per-agent (shots, music sections) don't collide.
        const variant =
          (eventData.shotId as string | undefined) ??
          (eventData.section as string | undefined) ??
          (eventData.collectionPoint as string | undefined);
        const out = await saveAgentOutput({
          supabase,
          agentId: spec.agentId,
          episodeId,
          episodeCode: ep.episode_code,
          result: exec.result,
          outputKind: exec.outputKind,
          variant,
        });
        await markJobCompleted(supabase, job.id, out.assetId);
        return out;
      });

      // ── Step 6: fan-out (optional, single or array) ────────────────────────
      if (spec.nextEvent) {
        const next = spec.nextEvent(saved, eventData, exec.result);
        if (next) {
          // Inngest's step.sendEvent accepts either one event or an array.
          await step.sendEvent('fan-out', Array.isArray(next) ? next : next);
        }
      }
      // runAgent may also return its own next_event (e.g. EXEC-PUB → published).
      if (exec.result.next_event) {
        await step.sendEvent('runner-next', exec.result.next_event);
      }
      if (exec.result.fan_out_events && exec.result.fan_out_events.length > 0) {
        await step.sendEvent(
          'runner-fan-out',
          exec.result.fan_out_events as Array<{
            name: string;
            data: Record<string, unknown>;
          }>
        );
      }

      return {
        ok: true,
        jobId: job.id,
        assetId: saved.assetId,
        runId,
      };
    },
  );
}
