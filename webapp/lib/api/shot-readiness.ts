// ──────────────────────────────────────────────────────────────────────────────
// lib/api/shot-readiness.ts
//
// q21 — one fail-loud readiness gate before a shot's video is generated. It does
// NOT re-implement validation: it ORCHESTRATES the checks that already exist
// (shot-plan-contract parse, resolveVanimProviderId, VIDEO_PROVIDER_CAPS,
// media-preflight) into a single ReadinessReport so a doomed generation is
// caught BEFORE dispatch — at $0, with a reason the Director sees immediately —
// instead of failing late inside a paid Inngest run (the silent C1 reject and
// the 2026-06-03 cascade both passed an early gate that didn't look this far).
//
// Reuse, not addition: every concrete rule lives in its existing module; this
// file is the chokepoint that runs them together and reports.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';
import { parseShotPlanContract } from '@/lib/api/shot-plan-contract';
import { resolveVanimProviderId } from '@/lib/agents/runners/animator';
import { VIDEO_PROVIDER_CAPS } from '@/lib/api/provider-capabilities';
import { assertMediaResolves, type PreflightAsset } from '@/lib/agents/media-preflight';
import { isVgenCancelled } from '@/lib/api/vgen-cancel';

export interface ReadinessFinding {
  code: string;
  message: string;
}

export interface ReadinessReport {
  ok: boolean;
  /** Hard reasons the shot cannot generate — dispatch MUST be refused. */
  blockers: ReadinessFinding[];
  /** Advisory — generation may proceed but the Director should know. */
  warnings: ReadinessFinding[];
  details: Record<string, unknown>;
}

interface PlanRow {
  id: string;
  content: string | null;
  status: string;
  version: number | null;
  file_type: string;
}

interface RefRow {
  id: string;
  filename: string | null;
  drive_file_id: string | null;
  staging_path: string | null;
}

/** Resolve the APPROVED Shot Plan to validate: explicit id, else newest for the shot. */
async function loadPlan(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  shotId: string,
  planAssetId: string | null,
): Promise<{ plan: PlanRow | null; reason: string | null }> {
  if (planAssetId) {
    const { data, error } = await supabase
      .from('assets')
      .select('id,content,status,version,file_type')
      .eq('id', planAssetId)
      .maybeSingle();
    if (error) return { plan: null, reason: `plan fetch failed: ${error.message}` };
    if (!data) return { plan: null, reason: `plan ${planAssetId} not found` };
    return { plan: data as PlanRow, reason: null };
  }
  // No explicit plan — find the newest APPROVED SPC-shot_plan for this shot.
  const { data, error } = await supabase
    .from('assets')
    .select('id,content,status,version,file_type,metadata')
    .eq('episode_id', episodeId)
    .like('file_type', 'SPC-shot_plan%')
    .eq('status', 'APPROVED');
  if (error) return { plan: null, reason: `plan lookup failed: ${error.message}` };
  const rows = (data ?? []).filter((r) => {
    const sid = (r as { metadata?: { shot_id?: unknown } }).metadata?.shot_id;
    if (typeof sid === 'string') return sid === shotId;
    return (r as PlanRow).file_type === `SPC-shot_plan-${shotId}`;
  }) as PlanRow[];
  if (rows.length === 0) return { plan: null, reason: 'no APPROVED shot plan for this shot' };
  rows.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  return { plan: rows[0]!, reason: null };
}

/**
 * Validate that `shotId` can generate its video right now. Pure read — no paid
 * calls, no mutations. Returns a report; callers decide whether to throw
 * (assertShotReadyForGeneration) or surface warnings.
 */
export async function validateShotReadyForGeneration(
  supabase: SupabaseClient<Database>,
  args: { shotId: string; episodeId: string; planAssetId?: string | null },
): Promise<ReadinessReport> {
  const blockers: ReadinessFinding[] = [];
  const warnings: ReadinessFinding[] = [];
  const details: Record<string, unknown> = { shotId: args.shotId };

  // 0. VGEN cancel switch — an active episode cancel is an honest readiness
  // blocker (q10 2026-06-16). The deliberate render is refused HERE at the
  // gate, $0, with a reason and a pointer to the × that clears it — instead of
  // dying silently as `kind:cancelled` inside the runner (the E10 false-start).
  if (await isVgenCancelled(supabase, args.episodeId)) {
    blockers.push({
      code: 'vgen_cancelled',
      message:
        'VGEN is cancelled for this episode — clear the block (× on the VGEN banner) before generating.',
    });
    return { ok: false, blockers, warnings, details };
  }

  // 1. Plan present + APPROVED.
  const { plan, reason } = await loadPlan(
    supabase,
    args.episodeId,
    args.shotId,
    args.planAssetId ?? null,
  );
  if (!plan) {
    blockers.push({ code: 'plan_missing', message: reason ?? 'no shot plan' });
    return { ok: false, blockers, warnings, details };
  }
  details.planAssetId = plan.id;
  if (plan.status !== 'APPROVED') {
    blockers.push({
      code: 'plan_not_approved',
      message: `plan ${plan.id} is ${plan.status}, expected APPROVED`,
    });
  }

  // 2. Plan body parses + has a prompt (same parser the runner executes).
  const contract = parseShotPlanContract(plan.content);
  if (contract.error) {
    blockers.push({ code: 'plan_unparseable', message: contract.error });
    return { ok: false, blockers, warnings, details };
  }
  if (!contract.prompt) {
    blockers.push({ code: 'prompt_missing', message: 'plan has no non-empty prompt' });
  }

  // 3. Provider contract — resolution / duration / prompt length / capability.
  if (!contract.providerId) {
    blockers.push({ code: 'provider_missing', message: 'plan declares no provider.id' });
  } else {
    try {
      const resolved = resolveVanimProviderId(contract.providerId);
      const caps = VIDEO_PROVIDER_CAPS[resolved.providerImpl];
      details.provider = { id: contract.providerId, impl: resolved.providerImpl };
      if (
        contract.resolution &&
        caps.supports_resolutions.length > 0 &&
        !caps.supports_resolutions.includes(contract.resolution)
      ) {
        blockers.push({
          code: 'resolution_unsupported',
          message: `${resolved.providerImpl} does not support ${contract.resolution} (allowed: ${caps.supports_resolutions.join(', ')})`,
        });
      } else if (contract.resolution && caps.supports_resolutions.length === 0) {
        warnings.push({
          code: 'resolution_ignored',
          message: `${resolved.providerImpl} uses a fixed resolution; declared ${contract.resolution} is ignored`,
        });
      }
      if (contract.durationSeconds != null) {
        if (
          contract.durationSeconds < caps.min_duration_s ||
          contract.durationSeconds > caps.max_duration_s
        ) {
          // WARNING, not blocker: the runner CLAMPS duration into range
          // (runner.ts ~1848 Math.min/max) rather than failing — so blocking
          // here would be stricter than the path that actually runs and could
          // refuse a render the runner would happily clamp + complete.
          warnings.push({
            code: 'duration_out_of_range',
            message: `duration ${contract.durationSeconds}s outside ${resolved.providerImpl} range ${caps.min_duration_s}-${caps.max_duration_s}s — runner will clamp`,
          });
        }
      }
      if (contract.endImageAssetId && !caps.supports_end_image) {
        warnings.push({
          code: 'end_image_ignored',
          message: `${resolved.providerImpl} ignores end_image`,
        });
      }
      if (contract.seed != null && !caps.supports_seed) {
        warnings.push({ code: 'seed_ignored', message: `${resolved.providerImpl} ignores seed` });
      }
      if (
        caps.max_prompt_chars &&
        contract.prompt &&
        contract.prompt.length > caps.max_prompt_chars
      ) {
        warnings.push({
          code: 'prompt_too_long',
          message: `prompt ${contract.prompt.length} chars exceeds ${resolved.providerImpl} max ${caps.max_prompt_chars}`,
        });
      }
    } catch {
      // WARNING, not blocker: resolveVanimProviderId throws on an off-allowlist
      // provider.id, but the runner catches that and SOFT-falls back to the
      // DB-config provider (runner.ts ~2004-2014) — it does not fail. Blocking
      // here would be stricter than the runner and could refuse a plan it would
      // run. We can't validate resolution/duration without caps, so we pass it
      // through to the runner's own fallback + gates.
      warnings.push({
        code: 'provider_unknown',
        message: `provider.id "${contract.providerId}" off the Animator allowlist — runner will fall back to DB-config provider`,
      });
    }
  }

  // 4. Reference media (anchors + end image) actually loads — reuse the
  //    canonical media-preflight reader (disk-cache → Drive → legacy staging).
  const refIds = [
    contract.startAnchorAssetId,
    contract.endAnchorAssetId,
    contract.endImageAssetId,
  ].filter((x): x is string => typeof x === 'string' && x.length > 0);
  if (refIds.length > 0) {
    const { data: refRows } = await supabase
      .from('assets')
      .select('id,filename,drive_file_id,staging_path')
      .in('id', refIds);
    const found = (refRows ?? []) as RefRow[];
    const missing = refIds.filter((id) => !found.some((r) => r.id === id));
    for (const id of missing) {
      blockers.push({ code: 'ref_not_found', message: `reference asset ${id} not found` });
    }
    const descriptors: PreflightAsset[] = found.map((r) => ({
      id: r.id,
      filename: r.filename,
      driveFileId: r.drive_file_id,
      stagingPath: r.staging_path,
    }));
    if (descriptors.length > 0) {
      const media = await assertMediaResolves(supabase, descriptors);
      details.refsChecked = descriptors.length;
      for (const dead of media.dead) {
        blockers.push({
          code: 'ref_media_dead',
          message: `reference ${dead.assetId}: ${dead.reason}`,
        });
      }
    }
  }

  return { ok: blockers.length === 0, blockers, warnings, details };
}

/** Throwing wrapper for routes that want fail-loud refusal before dispatch. */
export class ShotNotReadyError extends Error {
  readonly report: ReadinessReport;
  constructor(report: ReadinessReport) {
    super(
      `Shot not ready for generation: ${report.blockers.map((b) => b.message).join('; ')}`,
    );
    this.name = 'ShotNotReadyError';
    this.report = report;
  }
}

export async function assertShotReadyForGeneration(
  supabase: SupabaseClient<Database>,
  args: { shotId: string; episodeId: string; planAssetId?: string | null },
): Promise<ReadinessReport> {
  const report = await validateShotReadyForGeneration(supabase, args);
  if (!report.ok) throw new ShotNotReadyError(report);
  return report;
}
