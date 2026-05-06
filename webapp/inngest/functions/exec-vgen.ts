// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-vgen.ts
// EXEC-VGEN Visual Generator (v2 Universal Core: Pilot Pass + Fan-out + Per-shot).
//
// Three event subscriptions, branched in-handler:
//   - sandystudio/exec-vgen/start            → pilot pass for a single shot
//                                               (concurrency 1 per episode)
//   - sandystudio/exec-vgen/fanout-trigger   → emit /single-shot per remaining
//                                               shot (concurrency 1 per episode)
//   - sandystudio/exec-vgen/single-shot      → real per-shot generation
//                                               (concurrency 3 per episode)
//
// Legacy `sandystudio/exec-vgen/generate-shot` (Animatic fan-out, pre-Pilot
// Pass) keeps the old factory-built function for back-compat — see
// `execVgenLegacyGenerateShot` below.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';
import { inngest } from '@/lib/inngest/client';
import { concurrencyFor } from '@/lib/inngest/concurrency';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  insertJobRow,
  loadAgentInputs,
  markJobCompleted,
  markJobFailed,
  runAgent,
  saveAgentOutput,
} from '@/lib/agents/runner';
import { resolveProvider } from '@/lib/agents/provider-resolver';
import { recordCost } from '@/lib/budget';
import { isAnimaticV1, type AnimaticContract } from '@/lib/api/animatic-shotlist';
import { isVgenCancelled, clearVgenCancel } from '@/lib/api/vgen-cancel';
import { setVgenPilotState } from '@/lib/api/vgen-pilot-state';

// ── Legacy single-event path ──────────────────────────────────────────────────
// Kept for back-compat with replay-pilot harness and any in-flight
// /generate-shot events from the pre-Pilot-Pass world.
export const execVgenLegacyGenerateShot = createAgentInngestFunction({
  id: 'exec-vgen-generate-shot',
  name: 'EXEC-VGEN: Generate Shot (legacy)',
  agentId: 'EXEC-VGEN',
  concurrencyId: 'exec-vgen',
  eventName: 'sandystudio/exec-vgen/generate-shot',
  operation: 'video_generation',
  resolveRunArgs: (eventData) => ({
    shotId: eventData.shotId as string,
  }),
});

// ── v2 Universal Core: pilot + fan-out + single-shot ──────────────────────────

interface VgenEventData {
  episodeId: string;
  shotId?: string;
  aspect_ratio?: '16:9' | '9:16' | '1:1';
  quality_tier?: 'fast' | 'standard';
  duration_seconds?: number;
  pilot?: boolean;
}

const TARGET_STATUS_BY_MODE = (mode: number | null | undefined): 'APPROVED' | 'REVIEW' =>
  mode === 4 ? 'APPROVED' : 'REVIEW';

// Helper: emit a single-shot event for one remaining shot during fan-out.
async function emitSingleShot(
  episodeId: string,
  shotId: string,
  durationSeconds: number,
): Promise<void> {
  await inngest.send({
    name: 'sandystudio/exec-vgen/single-shot',
    data: {
      episodeId,
      shotId,
      duration_seconds: durationSeconds,
    } as never,
  });
}

// ── Pilot start handler (concurrency 1 / episode) ─────────────────────────────
export const execVgenStart = inngest.createFunction(
  {
    id: 'exec-vgen-start',
    name: 'EXEC-VGEN: Pilot Pass',
    retries: 2,
    concurrency: concurrencyFor('exec-vgen-pilot'),
  },
  { event: 'sandystudio/exec-vgen/start' },
  async ({ event, step, runId }) => {
    const data = event.data as VgenEventData;
    const { episodeId, shotId } = data;
    if (!shotId) {
      return { ok: false, reason: 'exec-vgen/start missing shotId' };
    }

    const job = await step.run('insert-job-row', async () => {
      const supabase = createSupabaseServiceRoleClient();
      return insertJobRow({
        supabase,
        agentId: 'EXEC-VGEN',
        episodeId,
        inngestEvent: event.name,
        inngestRunId: runId,
        inputSnapshot: data as unknown as Record<string, unknown>,
      });
    });

    try {
      // Clear any stale cancel token on a fresh pilot start.
      await step.run('clear-cancel-token', async () => {
        const supabase = createSupabaseServiceRoleClient();
        await clearVgenCancel(supabase, episodeId);
      });

      const exec = await step.run('execute-agent', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const inputs = await loadAgentInputs({
          supabase,
          agentId: 'EXEC-VGEN',
          episodeId,
        });
        let provider;
        try {
          provider = await resolveProvider(supabase, 'character_video');
        } catch {
          provider = undefined;
        }
        const ep = inputs.episode as { episode_code?: string };
        return runAgent({
          agentId: 'EXEC-VGEN',
          inputs,
          provider,
          supabase,
          episodeCode: ep?.episode_code,
          shotId,
          aspectRatio: data.aspect_ratio,
          qualityTier: data.quality_tier,
          durationSeconds: data.duration_seconds,
          vgenPilot: true,
        });
      });

      await step.run('record-cost', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const providerUsed =
          (typeof exec.result.metadata.provider_used === 'string' &&
            exec.result.metadata.provider_used) ||
          'mock';
        await recordCost(supabase, {
          jobId: job.id,
          episodeId,
          agentId: 'EXEC-VGEN',
          costUsd: exec.result.cost_usd,
          apiProvider: providerUsed,
          modelOrTier: providerUsed,
          operation: 'video_generation',
        });
      });

      const saved = await step.run('save-and-complete', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const { data: ep } = await supabase
          .from('episodes')
          .select('episode_code,governance_mode')
          .eq('id', episodeId)
          .single();
        const out = await saveAgentOutput({
          supabase,
          agentId: 'EXEC-VGEN',
          episodeId,
          episodeCode: ep?.episode_code ?? 'SS-unknown',
          result: exec.result,
          outputKind: exec.outputKind,
          // file_type CHECK constraint requires [a-z0-9_-]+ — storyboard
          // shotId is uppercase mixed case (e.g. SS-S14-E01-A1-SC01-SH01),
          // so we lowercase the variant. Canonical shotId roundtrips
          // through metadata.shot_id (set in pilotMetaPatch / fanMetaPatch
          // below) so consumers don't lose the original casing.
          variant: shotId.toLowerCase(),
        });
        await markJobCompleted(supabase, job.id, out.assetId);
        const targetStatus = TARGET_STATUS_BY_MODE(ep?.governance_mode);
        // Persist pilot marker into the asset metadata so approve-pilots
        // route can identify pilot rows. saveAgentOutput strips most metadata
        // keys; rewrite explicitly here.
        const existingMeta = exec.result.metadata as Record<string, unknown>;
        const pilotMetaPatch = {
          vgen_pilot: true,
          shot_id: shotId,
          aspect_ratio: existingMeta.aspect_ratio ?? null,
          quality_tier: existingMeta.quality_tier ?? null,
          duration_seconds: existingMeta.duration_seconds ?? null,
          prompt: existingMeta.prompt ?? null,
          reference_eref_asset_id: existingMeta.reference_eref_asset_id ?? null,
          storyboard_asset_id: existingMeta.storyboard_asset_id ?? null,
          provider_id: existingMeta.provider_id ?? null,
          provider_used: existingMeta.provider_used ?? null,
        };
        await supabase
          .from('assets')
          .update({
            status: targetStatus,
            metadata: pilotMetaPatch as never,
          } as never)
          .eq('id', out.assetId);

        // Mirror factory.ts behaviour — write activity_event so the Pipeline
        // View feed surfaces the completed pilot. Without this the asset is
        // created silently and Director can't open its drawer from the feed.
        await supabase
          .from('activity_events')
          .insert({
            event_type: 'agent_completed',
            severity: 'info',
            title: `EXEC-VGEN pilot completed (${shotId})`,
            description: 'EXEC-VGEN: Pilot Pass',
            actor: 'EXEC-VGEN',
            episode_id: episodeId,
            asset_id: out.assetId,
            job_id: job.id,
            metadata: {
              agent: 'EXEC-VGEN',
              status: targetStatus,
              kind: 'vgen_pilot',
              shot_id: shotId,
            },
          } as never)
          .then(
            () => undefined,
            () => undefined,
          );

        return out;
      });

      // Pilot pass marks state PENDING_REVIEW so Director's pillbar appears.
      await step.run('set-pilot-state', async () => {
        const supabase = createSupabaseServiceRoleClient();
        await setVgenPilotState(supabase, episodeId, 'PENDING_REVIEW');
      });

      return {
        ok: true,
        kind: 'pilot',
        jobId: job.id,
        assetId: saved.assetId,
        cost_usd: exec.result.cost_usd,
      };
    } catch (err) {
      await step.run('mark-failed', async () => {
        const supabase = createSupabaseServiceRoleClient();
        await markJobFailed(
          supabase,
          job.id,
          err instanceof Error ? err.message : 'unknown error',
        );
      });
      throw err;
    }
  },
);

// ── Fan-out trigger handler (concurrency 1 / episode) ─────────────────────────
export const execVgenFanoutTrigger = inngest.createFunction(
  {
    id: 'exec-vgen-fanout-trigger',
    name: 'EXEC-VGEN: Fan-out Trigger',
    retries: 1,
    concurrency: concurrencyFor('exec-vgen-fanout'),
  },
  { event: 'sandystudio/exec-vgen/fanout-trigger' },
  async ({ event, step }) => {
    const data = event.data as VgenEventData;
    const { episodeId } = data;

    const result = await step.run('emit-single-shots', async () => {
      const supabase = createSupabaseServiceRoleClient();

      // Find approved animatic to read shot_list.
      const { data: animatic } = await supabase
        .from('assets')
        .select('id,metadata')
        .eq('episode_id', episodeId)
        .eq('file_type', 'VID-animatic')
        .eq('status', 'APPROVED')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!animatic || !isAnimaticV1((animatic as { metadata?: unknown }).metadata)) {
        return { emitted: 0, reason: 'no_animatic_v1' };
      }
      const animaticMeta = animatic.metadata as unknown as { animatic_v1: AnimaticContract };
      const v1 = animaticMeta.animatic_v1;
      const shotList = v1.shot_list ?? [];

      // Find shots already produced — skip them in fan-out. Two skip categories:
      //   1. Pilot shots (vgen_pilot=true) — already generated in Pilot Pass.
      //   2. Fan-out shots that ALREADY have a row in REVIEW or APPROVED status
      //      for the same shot_id. This makes fan-out idempotent — retrying
      //      after a partial failure (e.g. some shots hit Vertex AI 429) only
      //      regenerates the missing ones instead of duplicating successes.
      const { data: existingRows } = await supabase
        .from('assets')
        .select('status,metadata')
        .eq('episode_id', episodeId)
        .like('file_type', 'VID-shot%');
      const SKIP_STATUSES = new Set(['REVIEW', 'APPROVED', 'LOCKED', 'NEEDS_HUMAN_TWEAK']);
      const skipShotIds = new Set<string>();
      const pilotShotIds = new Set<string>();
      for (const row of (existingRows ?? [])) {
        const meta = (row as { metadata?: unknown }).metadata;
        if (!meta || typeof meta !== 'object') continue;
        const m = meta as Record<string, unknown>;
        const sid = typeof m.shot_id === 'string' ? m.shot_id : null;
        if (!sid) continue;
        const status = (row as { status?: string }).status;
        if (m.vgen_pilot === true) {
          pilotShotIds.add(sid);
        }
        if (status && SKIP_STATUSES.has(status)) {
          skipShotIds.add(sid);
        }
      }

      let emitted = 0;
      let skipped = 0;
      for (const s of shotList) {
        if (skipShotIds.has(s.shot_id)) { skipped += 1; continue; }
        await emitSingleShot(episodeId, s.shot_id, s.duration_seconds);
        emitted += 1;
      }
      return {
        emitted,
        skipped,
        total: shotList.length,
        pilots: pilotShotIds.size,
      };
    });

    return { ok: true, kind: 'fanout-trigger', ...result };
  },
);

// ── Per-shot single-shot handler (concurrency 3 / episode) ────────────────────
export const execVgenSingleShot = inngest.createFunction(
  {
    id: 'exec-vgen-single-shot',
    name: 'EXEC-VGEN: Single Shot',
    retries: 2,
    concurrency: concurrencyFor('exec-vgen-shot'),
  },
  { event: 'sandystudio/exec-vgen/single-shot' },
  async ({ event, step, runId }) => {
    const data = event.data as VgenEventData;
    const { episodeId, shotId } = data;
    if (!shotId) {
      return { ok: false, reason: 'exec-vgen/single-shot missing shotId' };
    }

    // Cancel switch — abort before paid call.
    const cancelled = await step.run('check-cancel', async () => {
      const supabase = createSupabaseServiceRoleClient();
      return isVgenCancelled(supabase, episodeId);
    });
    if (cancelled) {
      return { ok: false, kind: 'cancelled', shotId };
    }

    const job = await step.run('insert-job-row', async () => {
      const supabase = createSupabaseServiceRoleClient();
      return insertJobRow({
        supabase,
        agentId: 'EXEC-VGEN',
        episodeId,
        inngestEvent: event.name,
        inngestRunId: runId,
        inputSnapshot: data as unknown as Record<string, unknown>,
      });
    });

    try {
      const exec = await step.run('execute-agent', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const inputs = await loadAgentInputs({
          supabase,
          agentId: 'EXEC-VGEN',
          episodeId,
        });
        let provider;
        try {
          provider = await resolveProvider(supabase, 'character_video');
        } catch {
          provider = undefined;
        }
        const ep = inputs.episode as { episode_code?: string };
        return runAgent({
          agentId: 'EXEC-VGEN',
          inputs,
          provider,
          supabase,
          episodeCode: ep?.episode_code,
          shotId,
          aspectRatio: data.aspect_ratio,
          qualityTier: data.quality_tier,
          durationSeconds: data.duration_seconds,
          vgenPilot: false,
        });
      });

      await step.run('record-cost', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const providerUsed =
          (typeof exec.result.metadata.provider_used === 'string' &&
            exec.result.metadata.provider_used) ||
          'mock';
        await recordCost(supabase, {
          jobId: job.id,
          episodeId,
          agentId: 'EXEC-VGEN',
          costUsd: exec.result.cost_usd,
          apiProvider: providerUsed,
          modelOrTier: providerUsed,
          operation: 'video_generation',
        });
      });

      const saved = await step.run('save-and-complete', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const { data: ep } = await supabase
          .from('episodes')
          .select('episode_code,governance_mode')
          .eq('id', episodeId)
          .single();
        const out = await saveAgentOutput({
          supabase,
          agentId: 'EXEC-VGEN',
          episodeId,
          episodeCode: ep?.episode_code ?? 'SS-unknown',
          result: exec.result,
          outputKind: exec.outputKind,
          // file_type CHECK constraint requires [a-z0-9_-]+ — storyboard
          // shotId is uppercase mixed case (e.g. SS-S14-E01-A1-SC01-SH01),
          // so we lowercase the variant. Canonical shotId roundtrips
          // through metadata.shot_id (set in pilotMetaPatch / fanMetaPatch
          // below) so consumers don't lose the original casing.
          variant: shotId.toLowerCase(),
        });
        await markJobCompleted(supabase, job.id, out.assetId);
        const targetStatus = TARGET_STATUS_BY_MODE(ep?.governance_mode);
        const existingMeta = exec.result.metadata as Record<string, unknown>;
        const fanMetaPatch = {
          vgen_pilot: false,
          shot_id: shotId,
          aspect_ratio: existingMeta.aspect_ratio ?? null,
          quality_tier: existingMeta.quality_tier ?? null,
          duration_seconds: existingMeta.duration_seconds ?? null,
          prompt: existingMeta.prompt ?? null,
          reference_eref_asset_id: existingMeta.reference_eref_asset_id ?? null,
          storyboard_asset_id: existingMeta.storyboard_asset_id ?? null,
          provider_id: existingMeta.provider_id ?? null,
          provider_used: existingMeta.provider_used ?? null,
        };
        await supabase
          .from('assets')
          .update({
            status: targetStatus,
            metadata: fanMetaPatch as never,
          } as never)
          .eq('id', out.assetId);

        // Mirror factory.ts so the fan-out shot lands in the Pipeline feed.
        await supabase
          .from('activity_events')
          .insert({
            event_type: 'agent_completed',
            severity: 'info',
            title: `EXEC-VGEN completed (${shotId})`,
            description: 'EXEC-VGEN: Single Shot',
            actor: 'EXEC-VGEN',
            episode_id: episodeId,
            asset_id: out.assetId,
            job_id: job.id,
            metadata: {
              agent: 'EXEC-VGEN',
              status: targetStatus,
              kind: 'vgen_fanout',
              shot_id: shotId,
            },
          } as never)
          .then(
            () => undefined,
            () => undefined,
          );

        return out;
      });

      return {
        ok: true,
        kind: 'single-shot',
        jobId: job.id,
        assetId: saved.assetId,
        cost_usd: exec.result.cost_usd,
      };
    } catch (err) {
      await step.run('mark-failed', async () => {
        const supabase = createSupabaseServiceRoleClient();
        await markJobFailed(
          supabase,
          job.id,
          err instanceof Error ? err.message : 'unknown error',
        );
      });
      throw err;
    }
  },
);
