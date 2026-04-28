// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-sw.ts
// EXEC-SW Screenwriter — first agent in the production pipeline.
// Reads APPROVED brief, produces a script asset, fans out to EXEC-SREV.
//
// Canonical 6-step shape per phase-4-jiggly-wave.md §3:
//   1. insert-job-row     RUNNING row in jobs
//   2. load-and-validate  loadAgentInputs + validateAgentInputs in one step
//   3. execute-agent      runAgent (mock provider in Phase 4)
//   4. record-cost        idempotent budget_log insert
//   5. save-and-complete  assets row + jobs.status=COMPLETED
//   6. fan-out            sandystudio/exec-srev/review-script
//
// Every other production agent follows this exact pattern with different
// agent ids and different fan-out targets.
// ──────────────────────────────────────────────────────────────────────────────

import { NonRetriableError } from 'inngest';

import { inngest } from '@/lib/inngest/client';
import { concurrencyFor } from '@/lib/inngest/concurrency';
import { recordCost } from '@/lib/budget';
import { validateAgentInputs } from '@/lib/agents/gate';
import {
  insertJobRow,
  loadAgentInputs,
  markJobCompleted,
  markJobFailed,
  runAgent,
  saveAgentOutput,
} from '@/lib/agents/runner';
import { resolveModelId } from '@/lib/agents/registry';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

const AGENT_ID = 'EXEC-SW' as const;
const EVENT_NAME = 'sandystudio/exec-sw/write-script' as const;

export const execSwWriteScript = inngest.createFunction(
  {
    id: 'exec-sw-write-script',
    name: 'EXEC-SW: Write Script',
    retries: 2,
    concurrency: concurrencyFor('exec-sw'),
  },
  { event: EVENT_NAME },
  async ({ event, step, runId }) => {
    const { episodeId, briefAssetId } = event.data;

    // ── Step 1: insert RUNNING jobs row ──────────────────────────────────────
    const job = await step.run('insert-job-row', async () => {
      const supabase = createSupabaseServiceRoleClient();
      return insertJobRow({
        supabase,
        agentId: AGENT_ID,
        episodeId,
        inngestEvent: EVENT_NAME,
        inngestRunId: runId,
        inputSnapshot: { briefAssetId },
      });
    });

    // ── Step 2: load + validate (combined per Plan-agent feedback) ───────────
    const gate = await step.run('load-and-validate', async () => {
      const supabase = createSupabaseServiceRoleClient();
      await loadAgentInputs({ supabase, agentId: AGENT_ID, episodeId });
      return validateAgentInputs({
        supabase,
        agentId: AGENT_ID,
        episodeId,
      });
    });

    if (!gate.passed) {
      await step.run('mark-failed', async () => {
        const supabase = createSupabaseServiceRoleClient();
        await markJobFailed(supabase, job.id, gate.reason ?? 'Gate failed');
      });
      throw new NonRetriableError(gate.reason ?? `Gate failed for ${AGENT_ID}`);
    }

    // ── Step 3: execute agent (mock provider in Phase 4) ─────────────────────
    const exec = await step.run('execute-agent', async () => {
      const supabase = createSupabaseServiceRoleClient();
      const inputs = await loadAgentInputs({ supabase, agentId: AGENT_ID, episodeId });
      return runAgent({ agentId: AGENT_ID, inputs });
    });

    // ── Step 4: idempotent cost record ───────────────────────────────────────
    await step.run('record-cost', async () => {
      const supabase = createSupabaseServiceRoleClient();
      return recordCost(supabase, {
        jobId: job.id,
        episodeId,
        agentId: AGENT_ID,
        costUsd: exec.result.cost_usd,
        apiProvider: 'mock',
        modelOrTier: resolveModelId(AGENT_ID) || 'mock',
        operation: 'script_generation',
      });
    });

    // ── Step 5: save asset + mark job COMPLETED ──────────────────────────────
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
      const out = await saveAgentOutput({
        supabase,
        agentId: AGENT_ID,
        episodeId,
        episodeCode: ep.episode_code,
        result: exec.result,
        outputKind: exec.outputKind,
      });
      await markJobCompleted(supabase, job.id, out.assetId);
      return out;
    });

    // ── Step 6: fan-out to next agent ────────────────────────────────────────
    await step.sendEvent('fan-out-srev', {
      name: 'sandystudio/exec-srev/review-script',
      data: {
        episodeId,
        scriptAssetId: saved.assetId,
      },
    });

    return {
      ok: true,
      jobId: job.id,
      assetId: saved.assetId,
      runId,
    };
  },
);
