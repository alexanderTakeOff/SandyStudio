// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-vgen.ts
// EXEC-VGEN Visual Generator (v2 Universal Core: Pilot Pass + Fan-out + Per-shot).
//
// Event subscriptions:
//   - sandystudio/exec-vgen/start + sandystudio/exec-vgen/single-shot
//       → ONE unified function `execVgenRun` (branches on event.name → isPilot).
//         Pilot pass (1 shot, Director review) and per-shot fan-out generation
//         share the same body; only the cancel-token handling, pilot-state flip,
//         and activity labels differ. (Gate-hardening 2026-06-04, U2/I4+I6.)
//   - sandystudio/exec-vgen/fanout-trigger → emit /single-shot per remaining shot.
//
// I4 (gate universality): the unified handler now runs the SAME readiness gate
// (validateAgentInputs → upstream completeness + governance + media-preflight)
// that every factory-built agent passes, instead of the old factory-bypass.
// I6 (loud observability): a failure emits agent_failed via logEvent (so Polина /
// notify-needed fires), not just a silent markJobFailed.
//
// Legacy `sandystudio/exec-vgen/generate-shot` (Animatic fan-out, pre-Pilot
// Pass) keeps the old factory-built function for back-compat — see
// `execVgenLegacyGenerateShot` below.
// ──────────────────────────────────────────────────────────────────────────────

import { NonRetriableError } from 'inngest';

import { createAgentInngestFunction } from '@/lib/agents/factory';
import { shortShotLabel } from '@/lib/api/vgen-shot-helpers';
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
import { validateAgentInputs } from '@/lib/agents/gate';
import { resolveProvider } from '@/lib/agents/provider-resolver';
import { recordCost } from '@/lib/budget';
import { logEvent } from '@/lib/api/events';
import { agentDisplayName } from '@/lib/api/agent-names';
import { isAnimaticV1, type AnimaticContract } from '@/lib/api/animatic-shotlist';
import { isVgenCancelled, clearVgenCancel } from '@/lib/api/vgen-cancel';
import { setVgenPilotState } from '@/lib/api/vgen-pilot-state';

const EXEC_VGEN_EXPECTED_SECONDS = 150;

// ── Legacy single-event path ──────────────────────────────────────────────────
// Kept for back-compat with replay-pilot harness and any in-flight
// /generate-shot events from the pre-Pilot-Pass world.
//
// TD-50 (2026-05-25) defence-in-depth: even though the trigger route now
// reroutes plan-driven payloads to `single-shot` directly, the legacy handler
// also extracts planAssetId so any historical in-flight `generate-shot` event
// (replay-pilot fixtures, queued retries, third-party callers) still routes
// to the TD-44 resolveVanimProviderId path when a Plan asset id is supplied.
export const execVgenLegacyGenerateShot = createAgentInngestFunction({
  id: 'exec-vgen-generate-shot',
  name: 'EXEC-VGEN: Generate Shot (legacy)',
  agentId: 'EXEC-VGEN',
  concurrencyId: 'exec-vgen',
  eventName: 'sandystudio/exec-vgen/generate-shot',
  operation: 'video_generation',
  resolveRunArgs: (eventData) => ({
    shotId: eventData.shotId as string,
    // TD-50: when the event payload carries planAssetId, surface it so
    // runner.ts q7a Step 6 + TD-44 resolveVanimProviderId fire. Legacy
    // events without planAssetId continue working unchanged (falls back
    // to event-arg / DB-config provider resolution).
    ...(typeof eventData.planAssetId === 'string' &&
    eventData.planAssetId.length > 0
      ? { planAssetId: eventData.planAssetId }
      : {}),
  }),
  // 2026-05-22 — surface shot label in activity titles.
  resolveActivityContext: (eventData) => {
    const shotId =
      typeof eventData.shotId === 'string' ? eventData.shotId : '';
    return {
      shortLabel: shortShotLabel(shotId),
      metadata: { shot_id: shotId || null },
    };
  },
});

// ── v2 Universal Core: pilot + fan-out + single-shot ──────────────────────────

interface VgenEventData {
  episodeId: string;
  shotId?: string;
  aspect_ratio?: '16:9' | '9:16' | '1:1';
  quality_tier?: 'fast' | 'standard';
  duration_seconds?: number;
  pilot?: boolean;
  /** Phase 2 (2026-05-13) — UI dropdown override. Skips
   *  `provider_assignments` global lookup when set. */
  provider?: 'veo-3-img2vid' | 'seedance-fal-img2vid';
  /**
   * ANIMATOR_CHAIN (2026-05-23): when SPC-shot_plan.APPROVED auto-fires
   * this event, the Plan asset id rides along. Runner's runAgent honours
   * `planAssetId` and extracts end_image / seed / quality_tier from the
   * Plan body (q7a Step 6 wiring), bypassing the legacy template prompt.
   * Absent → legacy buildShotPromptV2 path.
   */
  planAssetId?: string;
}

const TARGET_STATUS_BY_MODE = (mode: number | null | undefined): 'APPROVED' | 'REVIEW' =>
  mode === 4 ? 'APPROVED' : 'REVIEW';

// Helper: emit a single-shot event for one remaining shot during fan-out.
// 2026-05-26 (TD-50 follow-up): when an APPROVED SPC-shot_plan exists for
// the shot, forward its planAssetId so the single-shot handler routes to
// the Plan-driven path (Animator-declared provider + quality_tier). Without
// this, every fan-out shot fell back to the legacy template path and
// silently dropped to Seedance fast regardless of what the Animator wrote.
async function emitSingleShot(
  episodeId: string,
  shotId: string,
  durationSeconds: number,
  planAssetId?: string,
): Promise<void> {
  await inngest.send({
    name: 'sandystudio/exec-vgen/single-shot',
    data: {
      episodeId,
      shotId,
      duration_seconds: durationSeconds,
      ...(planAssetId ? { planAssetId } : {}),
    } as never,
  });
}

// Build a synthetic ResolvedProvider for an explicit per-event provider
// override (Phase 2 UI dropdown choice). Skips the `provider_assignments`
// table lookup — the dropdown choice is authoritative for that one shot.
// Env-key availability still gates the choice (mirrors resolveProvider
// auto-downgrade behavior).
function syntheticResolvedProvider(
  providerId: 'veo-3-img2vid' | 'seedance-fal-img2vid',
): import('@/lib/agents/provider-resolver').ResolvedProvider {
  const envKey = providerId === 'seedance-fal-img2vid' ? 'FAL_KEY' : 'GEMINI_API_KEY';
  const envOk = Boolean(process.env[envKey]?.trim());
  return {
    contract: 'character_video' as const,
    providerId: envOk ? providerId : 'mock',
    isActive: true,
    isMock: !envOk,
    envKey,
    envOk,
  };
}

// ── Unified pilot + single-shot handler ───────────────────────────────────────
// One function subscribes to BOTH /start (pilot) and /single-shot (fan-out).
// `isPilot` is derived from the event name; the only per-event differences are:
//   - pilot CLEARS a stale cancel token on start; single-shot CHECKS it (abort).
//   - pilot flips vgen_pilot_state → PENDING_REVIEW after save (Director pillbar).
//   - activity labels / return `kind`.
// Everything else (gate, provider resolution, runAgent, cost, save) is shared.
//
// Concurrency: uses the per-shot cap (`exec-vgen-shot`). The pilot is a single
// event per episode, so it never contends — sharing the shot cap is safe and the
// dedicated pilot cap (1) is no longer needed for correctness.
export const execVgenRun = inngest.createFunction(
  {
    id: 'exec-vgen-run',
    name: 'EXEC-VGEN: Pilot + Single Shot',
    retries: 2,
    concurrency: concurrencyFor('exec-vgen-shot'),
  },
  [
    { event: 'sandystudio/exec-vgen/start' },
    { event: 'sandystudio/exec-vgen/single-shot' },
  ],
  async ({ event, step, runId }) => {
    const isPilot = event.name === 'sandystudio/exec-vgen/start';
    const data = event.data as VgenEventData;
    const { episodeId, shotId } = data;
    if (!shotId) {
      return {
        ok: false,
        reason: `exec-vgen/${isPilot ? 'start' : 'single-shot'} missing shotId`,
      };
    }

    // Cancel switch — abort before paid call (single-shot path). The pilot is a
    // fresh start and instead CLEARS any stale token below.
    if (!isPilot) {
      const cancelled = await step.run('check-cancel', async () => {
        const supabase = createSupabaseServiceRoleClient();
        return isVgenCancelled(supabase, episodeId);
      });
      if (cancelled) {
        return { ok: false, kind: 'cancelled', shotId };
      }
    }

    const job = await step.run('insert-job-row', async () => {
      const supabase = createSupabaseServiceRoleClient();
      const created = await insertJobRow({
        supabase,
        agentId: 'EXEC-VGEN',
        episodeId,
        inngestEvent: event.name,
        inngestRunId: runId,
        inputSnapshot: data as unknown as Record<string, unknown>,
      });
      // TD-69 (2026-05-27): emit agent_started so the Activity Feed + Polина
      // see «Video Artist started — SH<N>» right after job row insert (the
      // approve-route auto-chain path would otherwise run invisibly).
      const label = shortShotLabel(shotId);
      await logEvent(supabase, {
        event_type: 'agent_started',
        severity: 'info',
        title: `${agentDisplayName('EXEC-VGEN')} started${label ? ` — ${label}` : ''}`,
        description: `Working on ${label || (isPilot ? 'pilot pass' : 'shot')} (EXEC-VGEN)…`,
        actor: 'EXEC-VGEN',
        episode_id: episodeId,
        metadata: {
          file_type: 'VID-shot',
          job_id: created.id,
          inngest_run_id: runId,
          expected_seconds: EXEC_VGEN_EXPECTED_SECONDS,
          shot_id: shotId,
          vgen_pilot: isPilot,
          plan_asset_id: data.planAssetId ?? null,
        },
      });
      return created;
    });

    try {
      // Clear any stale cancel token on a fresh pilot start.
      if (isPilot) {
        await step.run('clear-cancel-token', async () => {
          const supabase = createSupabaseServiceRoleClient();
          await clearVgenCancel(supabase, episodeId);
        });
      }

      // ── I4 (gate universality): same readiness gate the factory agents pass.
      // Upstream completeness + governance + media-reachability preflight BEFORE
      // the paid call — replaces the old hand-rolled factory-bypass.
      const gate = await step.run('load-and-validate', async () => {
        const supabase = createSupabaseServiceRoleClient();
        await loadAgentInputs({ supabase, agentId: 'EXEC-VGEN', episodeId });
        return validateAgentInputs({
          supabase,
          agentId: 'EXEC-VGEN',
          episodeId,
        });
      });
      if (!gate.passed) {
        await step.run('mark-failed-gate', async () => {
          const supabase = createSupabaseServiceRoleClient();
          await markJobFailed(supabase, job.id, gate.reason ?? 'Gate failed');
        });
        throw new NonRetriableError(gate.reason ?? 'Gate failed for EXEC-VGEN');
      }

      const exec = await step.run('execute-agent', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const inputs = await loadAgentInputs({
          supabase,
          agentId: 'EXEC-VGEN',
          episodeId,
        });
        // Phase 2 (2026-05-13): per-event provider override takes precedence
        // over the global `provider_assignments.character_video` row, so the UI
        // dropdown choice is honored even if the global default disagrees.
        let provider;
        if (data.provider) {
          provider = syntheticResolvedProvider(data.provider);
        } else {
          try {
            provider = await resolveProvider(supabase, 'character_video');
          } catch {
            provider = undefined;
          }
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
          vgenPilot: isPilot,
          // ANIMATOR_CHAIN: when present, runner reads the approved
          // SPC-shot_plan body and overrides prompt + end_image + seed +
          // quality_tier. Otherwise legacy template path.
          ...(data.planAssetId ? { planAssetId: data.planAssetId } : {}),
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
          // UNIT 3 / I7: the runner pre-reserved the estimated cost against the
          // ceiling (assertBudgetAvailable) and stamped it here. Pass it so
          // recordCost applies only the (actual − reserved) delta and skips the
          // ceiling re-check — otherwise the cost is charged twice.
          reservedUsd:
            typeof exec.result.metadata?.budget_reserved_usd === 'number'
              ? exec.result.metadata.budget_reserved_usd
              : 0,
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
          // through metadata.shot_id (set below) so consumers don't lose
          // the original casing.
          variant: shotId.toLowerCase(),
        });
        await markJobCompleted(supabase, job.id, out.assetId);
        const targetStatus = TARGET_STATUS_BY_MODE(ep?.governance_mode);
        // Persist the pilot marker + production trace into asset metadata.
        // saveAgentOutput strips most metadata keys; rewrite explicitly here.
        const existingMeta = exec.result.metadata as Record<string, unknown>;
        const metaPatch = {
          vgen_pilot: isPilot,
          shot_id: shotId,
          aspect_ratio: existingMeta.aspect_ratio ?? null,
          quality_tier: existingMeta.quality_tier ?? null,
          duration_seconds: existingMeta.duration_seconds ?? null,
          prompt: existingMeta.prompt ?? null,
          reference_eref_asset_id: existingMeta.reference_eref_asset_id ?? null,
          storyboard_asset_id: existingMeta.storyboard_asset_id ?? null,
          provider_id: existingMeta.provider_id ?? null,
          provider_used: existingMeta.provider_used ?? null,
          // Provider verification stamp (Phase A.1 directive 2026-05-07).
          model_id: existingMeta.model_id ?? null,
          operation_name: existingMeta.operation_name ?? null,
        };
        // Description carries the production trace surfaced in the AssetPreview
        // green box — Director audits model_id at a glance from the drawer.
        const cost = typeof exec.result.cost_usd === 'number' ? exec.result.cost_usd : null;
        const description = existingMeta.model_id
          ? `model=${existingMeta.model_id} · ${existingMeta.aspect_ratio ?? '?'} · ${existingMeta.quality_tier ?? '?'} · ${existingMeta.duration_seconds ?? '?'}s${cost !== null ? ` · cost $${cost.toFixed(3)}` : ''} · op=${existingMeta.operation_name ?? '?'}`
          : null;
        await supabase
          .from('assets')
          .update({
            status: targetStatus,
            metadata: metaPatch as never,
            ...(description ? { description } : {}),
          } as never)
          .eq('id', out.assetId);

        // Mirror factory.ts behaviour — write activity_event so the Pipeline
        // View feed surfaces the completed shot. Without this the asset is
        // created silently and Director can't open its drawer from the feed.
        await supabase
          .from('activity_events')
          .insert({
            event_type: 'agent_completed',
            severity: 'info',
            title: isPilot
              ? `EXEC-VGEN pilot completed (${shotId})`
              : `EXEC-VGEN completed (${shotId})`,
            description: isPilot ? 'EXEC-VGEN: Pilot Pass' : 'EXEC-VGEN: Single Shot',
            actor: 'EXEC-VGEN',
            episode_id: episodeId,
            asset_id: out.assetId,
            job_id: job.id,
            metadata: {
              agent: 'EXEC-VGEN',
              status: targetStatus,
              kind: isPilot ? 'vgen_pilot' : 'vgen_fanout',
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
      if (isPilot) {
        await step.run('set-pilot-state', async () => {
          const supabase = createSupabaseServiceRoleClient();
          await setVgenPilotState(supabase, episodeId, 'PENDING_REVIEW');
        });
      }

      return {
        ok: true,
        kind: isPilot ? 'pilot' : 'single-shot',
        jobId: job.id,
        assetId: saved.assetId,
        cost_usd: exec.result.cost_usd,
      };
    } catch (err) {
      // I6 (loud observability): emit agent_failed (not just markJobFailed) so
      // pa/notify-needed fires and Polина / Director see the failure instead of
      // a silent console-only death (closes the hand-rolled-VGEN observability
      // hole). Re-throws so Inngest still marks the run FAILED.
      await step.run('mark-failed', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const errMsg = err instanceof Error ? err.message : 'unknown error';
        const label = shortShotLabel(shotId);
        try {
          await logEvent(supabase, {
            event_type: 'agent_failed',
            severity: 'error',
            title: `${agentDisplayName('EXEC-VGEN')} failed${label ? ` — ${label}` : ''}`,
            description: errMsg.slice(0, 500),
            actor: 'EXEC-VGEN',
            episode_id: episodeId,
            job_id: job.id,
            metadata: {
              agent: 'EXEC-VGEN',
              inngest_run_id: runId,
              error: errMsg.slice(0, 500),
              shot_id: shotId,
              vgen_pilot: isPilot,
            },
          });
        } catch {
          // Swallow logging errors so we don't mask the original failure.
        }
        await markJobFailed(supabase, job.id, errMsg);
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

      // TD-50 follow-up (2026-05-26): build a shot_id → planAssetId map
      // from APPROVED SPC-shot_plan rows so each fan-out emit carries its
      // Plan. Pre-this-fix the fan-out path dropped planAssetId and every
      // remaining shot ran the legacy template, forcing Seedance fast.
      //
      // TD-78 (2026-05-27): widen file_type — Animator writes
      // `SPC-shot_plan-<shot_id>` (TD-66 widening). Strict equality matched
      // none of the modern Plans and every fan-out shot lost its Plan,
      // silently falling back to storyboard template same way as SH19 v02.
      const { data: planRows } = await supabase
        .from('assets')
        .select('id,metadata')
        .eq('episode_id', episodeId)
        .or('file_type.eq.SPC-shot_plan,file_type.like.SPC-shot_plan-%')
        .eq('status', 'APPROVED');
      const planByShotId = new Map<string, string>();
      for (const row of (planRows ?? []) as Array<{
        id: string;
        metadata?: unknown;
      }>) {
        const meta = row.metadata as { shot_id?: unknown } | null;
        const sid = typeof meta?.shot_id === 'string' ? meta.shot_id : null;
        if (sid) planByShotId.set(sid, row.id);
      }

      let emitted = 0;
      let skipped = 0;
      let withPlan = 0;
      for (const s of shotList) {
        if (skipShotIds.has(s.shot_id)) { skipped += 1; continue; }
        const planAssetId = planByShotId.get(s.shot_id);
        if (planAssetId) withPlan += 1;
        await emitSingleShot(episodeId, s.shot_id, s.duration_seconds, planAssetId);
        emitted += 1;
      }
      return {
        emitted,
        skipped,
        total: shotList.length,
        pilots: pilotShotIds.size,
        with_plan: withPlan,
      };
    });

    return { ok: true, kind: 'fanout-trigger', ...result };
  },
);
