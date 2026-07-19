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
import { isFalBalanceLock } from '@/lib/agents/providers/fal-seedance';
import { logEvent } from '@/lib/api/events';
import { agentDisplayName } from '@/lib/api/agent-names';
import {
  isAnimaticV1,
  excludedShotIdsFromEpisodeMeta,
  type AnimaticContract,
} from '@/lib/api/animatic-shotlist';
import { isVgenCancelled, clearVgenCancel } from '@/lib/api/vgen-cancel';
import { setVgenPilotState } from '@/lib/api/vgen-pilot-state';
import { animatorChainEnabled, resolveVideoRegenCap } from '@/lib/agents/chain-flags';

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
  /**
   * Deliberate re-render flag (2026-06-12). Set by the manual trigger route
   * (PA regenerateVideoFromPlan / Director drawer) to bypass the per-Plan
   * dedup gate below. Auto-dispatch paths (computeNextEvents, fan-out)
   * never set it — an existing VID-shot for the same plan suppresses them.
   */
  regenerate?: boolean;
}

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

    // Excluded ("button") shot belt (Slice 3, 2026-07-03): an excluded shot must
    // never render — a paid no-op. computeNextEvents already skips the auto-chain
    // edges, but this catches DIRECT triggers (PA regenerateShot / kebab Generate
    // video) that bypass it. $0, no job row, no provider call.
    {
      const excluded = await step.run('check-excluded', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const { data: epRow } = await supabase
          .from('episodes')
          .select('metadata')
          .eq('id', episodeId)
          .maybeSingle();
        return excludedShotIdsFromEpisodeMeta(
          (epRow as { metadata?: unknown } | null)?.metadata,
        ).has(shotId);
      });
      if (excluded) {
        return { ok: false, kind: 'excluded', shotId };
      }
    }

    // Cancel switch — abort the in-flight FAN-OUT between shots (the pilot is a
    // fresh start and instead CLEARS any stale token below). Deliberate
    // /trigger renders are caught EARLIER and HONESTLY at the q21 readiness gate
    // (shot-readiness.ts → /trigger returns a clear "cancelled — clear the
    // block" blocker, $0, before dispatch) rather than dying silently here, so
    // this runner-side abort now only stops auto-dispatched fan-out shots.
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

    // C1 gate: single-shot without a plan is forbidden while ANIMATOR_CHAIN is on.
    // Placed before the main try/catch so the catch block's markJobFailed
    // does not double-fail. NonRetriableError inside step.run causes Inngest
    // to mark the run failed without retrying.
    if (!isPilot && animatorChainEnabled() && !data.planAssetId) {
      await step.run('c1-gate-check', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const label = shortShotLabel(shotId);
        const errMsg = 'C1 gate: single-shot generation without an approved animator plan is forbidden while ANIMATOR_CHAIN_ENABLED. Author a Plan (exec-vanim/plan) first.';
        try {
          await logEvent(supabase, {
            event_type: 'agent_failed',
            severity: 'error',
            title: `${agentDisplayName('EXEC-VGEN')} C1 gate blocked${label ? ` — ${label}` : ''}`,
            description: errMsg,
            actor: 'EXEC-VGEN',
            episode_id: episodeId,
            job_id: job.id,
            metadata: {
              agent: 'EXEC-VGEN',
              shot_id: shotId,
              vgen_pilot: isPilot,
            },
          });
        } catch {
          // Swallow logging errors — don't mask the gate error.
        }
        await markJobFailed(supabase, job.id, errMsg);
        throw new NonRetriableError(errMsg);
      });
    }

    // Runner-side per-Plan idempotency (2026-06-12, E07 smoke: SH03 rendered
    // twice — approve-route auto-dispatch + manual fire — extra $1.21). The
    // emit-time checks in computeNextEvents can't see each other's in-flight
    // events, and manual surfaces (generate-single-shot route, PA tools,
    // scripts) bypass them entirely. This is the LAST gate before money:
    // if any VID-shot already carries this planAssetId (either metadata
    // shape — top-level `plan_asset_id` is what this file's own save step
    // writes), complete the job as a duplicate-suppression no-op.
    if (data.planAssetId && data.regenerate !== true) {
      const duplicateOf = await step.run('plan-dedup-check', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const { data: vidRows } = await supabase
          .from('assets')
          .select('id,metadata')
          .eq('episode_id', episodeId)
          .like('file_type', 'VID-shot%');
        for (const row of (vidRows ?? []) as Array<{ id: string; metadata?: unknown }>) {
          const m = row.metadata as
            | { provenance?: { plan_asset_id?: unknown }; plan_asset_id?: unknown }
            | null;
          const pid =
            typeof m?.provenance?.plan_asset_id === 'string'
              ? m.provenance.plan_asset_id
              : typeof m?.plan_asset_id === 'string'
                ? m.plan_asset_id
                : null;
          if (pid === data.planAssetId) return row.id;
        }
        return null;
      });
      if (duplicateOf) {
        await step.run('complete-as-duplicate', async () => {
          const supabase = createSupabaseServiceRoleClient();
          const label = shortShotLabel(shotId);
          await markJobCompleted(supabase, job.id, duplicateOf);
          await logEvent(supabase, {
            event_type: 'agent_completed',
            severity: 'info',
            title: `${agentDisplayName('EXEC-VGEN')} duplicate suppressed${label ? ` — ${label}` : ''}`,
            description: `VID-shot for plan ${data.planAssetId} already exists (asset ${duplicateOf}) — generation skipped, $0 spent.`,
            actor: 'EXEC-VGEN',
            episode_id: episodeId,
            asset_id: duplicateOf,
            job_id: job.id,
            metadata: {
              agent: 'EXEC-VGEN',
              kind: 'duplicate_suppressed',
              shot_id: shotId,
              plan_asset_id: data.planAssetId,
            },
          });
        });
        return {
          ok: true,
          kind: 'duplicate-suppressed',
          jobId: job.id,
          assetId: duplicateOf,
          cost_usd: 0,
        };
      }
    }

    // Shot-level dedup (2026-06-22, Director: NO automatic video re-generation).
    // The plan-level check above is keyed on planAssetId, so a RE-AUTHORED plan
    // (new asset id) for an already-rendered shot slips through and re-renders
    // it — wasted money. This shot-level gate is the by-construction backstop:
    // if ANY VID-shot already exists for this shotId and the caller did not
    // explicitly pass regenerate:true, suppress at $0. Covers every event path
    // (auto-chain computeNextEvents, manual triggerAgent, PA tools). Re-gen is
    // allowed ONLY via the explicit Director surfaces (regenerate-video route is
    // a separate inline path; PA/drawer set regenerate:true) — i.e. after the
    // Director's visual review + per-shot decision, never automatically.
    if (data.regenerate !== true) {
      const normShot = (s: string | null | undefined): string =>
        (s ?? '').toUpperCase().match(/A\d+-SC\d+-SH\d+/)?.[0] ?? (s ?? '');
      const target = normShot(shotId);
      // Per-episode video-regen cap (Director 2026-07-06 — Episode Settings).
      // Count existing VID-shot rows for THIS shot and block automatic re-gen
      // once we hit episodes.metadata.video_regen_cap (default 1 → today's
      // "one auto-render then stop"). Director's explicit regenerate surface
      // (regenerate:true) always bypasses this.
      const dedup = await step.run('shot-dedup-check', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const { data: epRow } = await supabase
          .from('episodes')
          .select('metadata')
          .eq('id', episodeId)
          .maybeSingle();
        const cap = resolveVideoRegenCap((epRow as { metadata?: unknown } | null)?.metadata);
        const { data: vidRows } = await supabase
          .from('assets')
          .select('id,metadata')
          .eq('episode_id', episodeId)
          .like('file_type', 'VID-shot%');
        let count = 0;
        let lastId: string | null = null;
        for (const row of (vidRows ?? []) as Array<{ id: string; metadata?: unknown }>) {
          const sid = (row.metadata as { shot_id?: unknown } | null)?.shot_id;
          if (typeof sid === 'string' && normShot(sid) === target && target) {
            count++;
            lastId = row.id;
          }
        }
        return { count, lastId, cap };
      });
      if (dedup.lastId && dedup.count >= dedup.cap) {
        await step.run('complete-as-shot-duplicate', async () => {
          const supabase = createSupabaseServiceRoleClient();
          const label = shortShotLabel(shotId);
          await markJobCompleted(supabase, job.id, dedup.lastId!);
          await logEvent(supabase, {
            event_type: 'agent_completed',
            severity: 'warning',
            title: `${agentDisplayName('EXEC-VGEN')} re-gen blocked${label ? ` — ${label}` : ''}`,
            description: `Shot ${shotId} already has ${dedup.count} VID-shot(s) (cap ${dedup.cap}) — automatic re-generation suppressed, $0 spent. Re-render requires the explicit Director regenerate surface after visual review.`,
            actor: 'EXEC-VGEN',
            episode_id: episodeId,
            asset_id: dedup.lastId!,
            job_id: job.id,
            metadata: { agent: 'EXEC-VGEN', kind: 'regen_blocked', shot_id: shotId },
          });
        });
        return {
          ok: true,
          kind: 'regen-blocked',
          jobId: job.id,
          assetId: dedup.lastId,
          cost_usd: 0,
        };
      }
    }

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
        const targetStatus = 'REVIEW' as const;
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
          // 2026-06-05: persist resolution + plan_asset_id. Their absence made
          // the drawer's regen control panel fall back to its 720p default even
          // for a 1080p video (Director couldn't tell the real resolution, and a
          // regen would silently DOWNGRADE to 720p). resolution comes from the
          // runner's effectiveResolution; plan_asset_id proves the render was
          // plan-driven (was always null in metadata even when a plan drove it).
          resolution: existingMeta.resolution ?? null,
          plan_asset_id: data.planAssetId ?? null,
          c1_valid: Boolean(data.planAssetId),
          // Provider verification stamp (Phase A.1 directive 2026-05-07).
          model_id: existingMeta.model_id ?? null,
          operation_name: existingMeta.operation_name ?? null,
        };
        // Description carries the production trace surfaced in the AssetPreview
        // green box — Director audits model_id at a glance from the drawer.
        const cost = typeof exec.result.cost_usd === 'number' ? exec.result.cost_usd : null;
        const description = existingMeta.model_id
          ? `model=${existingMeta.model_id} · ${existingMeta.aspect_ratio ?? '?'} · ${existingMeta.quality_tier ?? '?'} · ${existingMeta.resolution ?? 'provider-default'} · ${existingMeta.duration_seconds ?? '?'}s${cost !== null ? ` · cost $${cost.toFixed(3)}` : ''} · op=${existingMeta.operation_name ?? '?'}`
          : null;
        // F3 class (2026-06-12): error-checked — a silent {error} here would
        // leave the VID-shot DRAFT with no trace (same disease as TD-76).
        const { error: patchErr } = await supabase
          .from('assets')
          .update({
            status: targetStatus,
            metadata: metaPatch as never,
            ...(description ? { description } : {}),
          } as never)
          .eq('id', out.assetId);
        if (patchErr) {
          throw new Error(
            `exec-vgen save: status/metadata patch failed for ${out.assetId}: ${patchErr.message}`,
          );
        }

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
      // q12 (2026-06-05): a provider balance-lock (fal "Exhausted balance" 403)
      // is terminal — wrap as NonRetriableError so Inngest stops the 3× retry
      // that burned the retry budget and leaked pre-spend reservations. Detect
      // by message so it survives MultiVideoGenError wrapping.
      if (err instanceof Error && isFalBalanceLock(err.message)) {
        throw new NonRetriableError(err.message, { cause: err });
      }
      throw err;
    }
  },
);

/**
 * Pure per-shot fanout decision. Exported as a test seam.
 *
 * Three outcomes:
 *   - author a Plan  → `exec-vanim/plan`   (chain on, shot has NO plan at all)
 *   - generate video → `exec-vgen/single-shot` (with the APPROVED planAssetId)
 *   - wait           → `null`              (a plan exists but isn't approved yet)
 *
 * 2026-07-19 — the "wait" outcome is new and it is the fix for the runaway
 * authoring loop. This used to key BOTH decisions off one value: the approved
 * plan id. A plan that had PASSed the critic sits in REVIEW by contract
 * (critic-loop.ts — "PASS → leave in REVIEW for the Director"), so it was
 * absent from the approved map and read as "this shot has no plan" — every
 * fan-out re-authored it, minting yet another version, which PASSed again, and
 * so on. E30 reached 17 versions on SH27 with 108 PASS verdicts and only 9
 * REVISEs; no cap caught it because none of them counts plan authoring.
 *
 * The two signals are now separate: `hasLivePlan` decides whether to AUTHOR,
 * `approvedPlanAssetId` decides whether to GENERATE. When a plan exists but is
 * not approved the shot is simply waiting on the Director — we must not author
 * a duplicate, and we must not generate either (VGEN hard-fails on a plan whose
 * status isn't APPROVED, which is what spammed SH05/SH06 with agent_failed).
 *
 * Flag off → byte-identical legacy behavior.
 */
export function decideFanoutEmit(
  episodeId: string,
  shot: { shot_id: string; duration_seconds: number },
  approvedPlanAssetId: string | undefined,
  animatorChainOn: boolean,
  hasLivePlan = false,
): { event: string; data: Record<string, unknown> } | null {
  if (animatorChainOn && approvedPlanAssetId === undefined) {
    // A live-but-unapproved plan means "authored, awaiting the Director".
    if (hasLivePlan) return null;
    return {
      event: 'sandystudio/exec-vanim/plan',
      data: { episodeId, shotId: shot.shot_id },
    };
  }
  return {
    event: 'sandystudio/exec-vgen/single-shot',
    data: {
      episodeId,
      shotId: shot.shot_id,
      duration_seconds: shot.duration_seconds,
      ...(approvedPlanAssetId !== undefined ? { planAssetId: approvedPlanAssetId } : {}),
    },
  };
}

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
      // 2026-07-19 — fetch ALL non-invalidated plans, not just APPROVED ones,
      // and keep the two facts apart: which shots already HAVE a plan (any live
      // status) versus which have an APPROVED one to generate from. Selecting
      // only APPROVED made a PASSed plan sitting in REVIEW look like "no plan"
      // and the fan-out re-authored it forever. See decideFanoutEmit.
      const { data: planRows } = await supabase
        .from('assets')
        .select('id,status,metadata')
        .eq('episode_id', episodeId)
        .or('file_type.eq.SPC-shot_plan,file_type.like.SPC-shot_plan-%')
        .in('status', ['DRAFT', 'REVIEW', 'REVISION', 'APPROVED', 'LOCKED']);
      const planByShotId = new Map<string, string>();
      const shotsWithLivePlan = new Set<string>();
      for (const row of (planRows ?? []) as Array<{
        id: string;
        status?: string | null;
        metadata?: unknown;
      }>) {
        const meta = row.metadata as { shot_id?: unknown } | null;
        const sid = typeof meta?.shot_id === 'string' ? meta.shot_id : null;
        if (!sid) continue;
        shotsWithLivePlan.add(sid);
        if (row.status === 'APPROVED' || row.status === 'LOCKED') {
          planByShotId.set(sid, row.id);
        }
      }

      let emitted = 0;
      let skipped = 0;
      let withPlan = 0;
      let planned = 0;
      let awaitingApproval = 0;
      const chainOn = animatorChainEnabled();
      for (const s of shotList) {
        if (skipShotIds.has(s.shot_id)) { skipped += 1; continue; }
        const planAssetId = planByShotId.get(s.shot_id);
        if (planAssetId) withPlan += 1;
        const decision = decideFanoutEmit(
          episodeId,
          s,
          planAssetId,
          chainOn,
          shotsWithLivePlan.has(s.shot_id),
        );
        if (decision === null) {
          // Plan authored, not approved — the Director owns the next move.
          awaitingApproval += 1;
          continue;
        }
        if (decision.event === 'sandystudio/exec-vanim/plan') {
          await inngest.send({ name: decision.event as never, data: decision.data as never });
          planned += 1;
        } else {
          await emitSingleShot(episodeId, s.shot_id, s.duration_seconds, planAssetId);
          emitted += 1;
        }
      }
      return {
        emitted,
        skipped,
        total: shotList.length,
        pilots: pilotShotIds.size,
        with_plan: withPlan,
        planned,
        awaiting_approval: awaitingApproval,
      };
    });

    return { ok: true, kind: 'fanout-trigger', ...result };
  },
);
