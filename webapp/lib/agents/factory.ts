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
import { resolveProvider, type ContractName, type ResolvedProvider } from './provider-resolver';
import type { AgentId } from './types';

// Maps an agent to the provider contract it consumes. Agents not listed here
// don't go through the resolver (text-only agents → Anthropic / mock LLM).
const CONTRACT_BY_AGENT: Partial<Record<AgentId, ContractName>> = {
  'EXEC-THUMB': 'image',
  'EXEC-VGEN': 'character_video',
  'EXEC-EDIT': 'video',
  'EXEC-MGEN': 'music',
  'EXEC-PUB': 'publish',
};

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { event: spec.eventName as any },
    async ({ event, step, runId }) => {
      const eventData = event.data as Record<string, unknown> & {
        episodeId: string;
      };
      const { episodeId } = eventData;

      // ── Step 1: insert RUNNING job row + emit agent_started activity ─────
      const job = await step.run('insert-job-row', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const created = await insertJobRow({
          supabase,
          agentId: spec.agentId,
          episodeId,
          inngestEvent: spec.eventName,
          inngestRunId: runId,
          inputSnapshot: eventData,
        });
        // Activity feed entry so the Pipeline View shows "Storyboarder started"
        // immediately, not after ~70s of silence. Director's UX request from
        // 2026-05-02 — silent stages were unreadable.
        await supabase.from('activity_events').insert({
          event_type: 'agent_started',
          severity: 'info',
          title: `${spec.name} started`,
          description: `Working on episode (${spec.agentId})…`,
          actor: spec.agentId,
          episode_id: episodeId,
          metadata: {
            file_type: FILE_TYPE_HINT_BY_AGENT[spec.agentId] ?? null,
            job_id: created.id,
            inngest_run_id: runId,
            expected_seconds: EXPECTED_RUNTIME_SECONDS[spec.agentId] ?? 60,
          },
        } as never);
        return created;
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
        // Resolve provider for agents that consume an external contract.
        // Resolver auto-downgrades to 'mock' when the env key is missing,
        // so this is safe in test/dev environments without secrets.
        const contract = CONTRACT_BY_AGENT[spec.agentId];
        let provider: ResolvedProvider | undefined;
        if (contract) {
          try {
            provider = await resolveProvider(supabase, contract);
          } catch {
            // Disabled contract or no row — fall through to mock everywhere.
            provider = undefined;
          }
        }
        const episodeCode =
          (inputs.episode as { episode_code?: string } | undefined)?.episode_code ?? undefined;
        const runArgs: RunAgentArgs = {
          agentId: spec.agentId,
          inputs,
          provider,
          supabase,
          episodeCode,
          ...(spec.resolveRunArgs ? spec.resolveRunArgs(eventData) : {}),
        };
        return runAgent(runArgs);
      });

      // ── Step 4: idempotent cost record ─────────────────────────────────────
      await step.run('record-cost', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const providerUsed =
          (typeof exec.result.metadata.provider_used === 'string' &&
            exec.result.metadata.provider_used) ||
          (typeof exec.result.metadata.provider_id === 'string' &&
            exec.result.metadata.provider_id) ||
          'mock';
        return recordCost(supabase, {
          jobId: job.id,
          episodeId,
          agentId: spec.agentId,
          costUsd: exec.result.cost_usd,
          apiProvider: providerUsed,
          modelOrTier: resolveModelId(spec.agentId) || providerUsed,
          operation: spec.operation,
        });
      });

      // ── Step 5: save asset + mark job COMPLETED ────────────────────────────
      const saved = await step.run('save-and-complete', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const { data: ep, error } = await supabase
          .from('episodes')
          .select('episode_code,governance_mode')
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

        // Mode 4 (AUTOTEST) — auto-promote DRAFT → APPROVED so downstream
        // gates pass without Director approval. Mirrors replay-pilot's
        // autoApproveOutput flag. Modes 1-3 flip DRAFT → REVIEW so the
        // asset surfaces in the Director Inbox; approval there fires the
        // next agent.
        const targetStatus = ep.governance_mode === 4 ? 'APPROVED' : 'REVIEW';
        await supabase
          .from('assets')
          .update({ status: targetStatus })
          .eq('id', out.assetId);

        // (Removed 2026-05-02) Earlier code spoofed STB-act2 + STB-act3 mock
        // rows after EXEC-SB to satisfy a legacy WCHK gate that required
        // minCount=3. The real Storyboarder produces a single STB-storyboard
        // asset with all 3 acts inline (JSON), and gate.ts now uses minCount=1.
        // Spoofing pollutes the storyboard stage with "Mock placeholder" rows
        // visible in the kebab editor — confusing Director. Removed entirely.

        // Write activity_event so the Pipeline View feed shows agent
        // milestones, not just Director approvals. metadata.file_type lets
        // the per-stage filter bucket the event into the right column.
        await supabase
          .from('activity_events')
          .insert({
            event_type: 'agent_completed',
            severity: 'info',
            title: `${spec.agentId} completed`,
            description: spec.name,
            actor: spec.agentId,
            episode_id: episodeId,
            asset_id: out.assetId,
            job_id: job.id,
            metadata: {
              agent: spec.agentId,
              status: targetStatus,
            },
          } as never)
          .then(
            () => undefined,
            () => undefined,
          );

        return out;
      });

      // ── Step 6: fan-out (optional, single or array) ────────────────────────
      // Factory is generic over event names; per-function `nextEvent`
      // callbacks shape payloads. Cast at the boundary — runtime correctness
      // is the call site's responsibility, not the factory's.
      type SendEventPayload = Parameters<typeof step.sendEvent>[1];

      // Auto-chain only in Mode 4 (AUTOTEST). In Modes 1-3 the next agent is
      // fired by Director's asset approval (POST /api/assets/[id]/approve);
      // chaining here would cause the next agent to FAIL its gate because
      // the just-saved asset is REVIEW, not APPROVED.
      const autoChain = await step.run('check-mode', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const { data } = await supabase
          .from('episodes')
          .select('governance_mode')
          .eq('id', episodeId)
          .single();
        return data?.governance_mode === 4;
      });

      if (autoChain) {
        if (spec.nextEvent) {
          const next = spec.nextEvent(saved, eventData, exec.result);
          if (next) {
            await step.sendEvent('fan-out', next as SendEventPayload);
          }
        }
        // runAgent may also return its own next_event (e.g. EXEC-PUB → published).
        if (exec.result.next_event) {
          await step.sendEvent('runner-next', exec.result.next_event as SendEventPayload);
        }
        if (exec.result.fan_out_events && exec.result.fan_out_events.length > 0) {
          await step.sendEvent(
            'runner-fan-out',
            exec.result.fan_out_events as unknown as SendEventPayload,
          );
        }
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
