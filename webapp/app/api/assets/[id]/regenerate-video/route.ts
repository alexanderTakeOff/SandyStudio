// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/regenerate-video/route.ts
// Per-shot VGEN re-generation with edited Universal Core settings
// (purrfect-stirring-hollerith plan, Phase 1).
//
// Director opens a VID-shot in the Episode Asset Drawer, edits aspect /
// quality / duration / reference, and clicks "Generate". This route:
//   1. Validates the asset is a VID-shot.
//   2. Resolves the storyboard shot (from the asset's metadata.shot_id).
//   3. Reads the PROMPT from the shot's APPROVED SPC-shot_plan — the same
//      contract the automated path executes (runner.ts EXEC-VGEN plan-driven
//      branch). No plan → hard refusal, never a fallback prompt.
//   4. Loads (or accepts an override of) the approved EREF reference image.
//   5. Calls the video provider with the chosen Universal Core settings.
//   6. Persists the new mp4 → NEW asset row (status REVIEW). Old asset is
//      preserved for audit / rollback.
//
// E33 audit P0 #4 (2026-07-29): this route used to build its prompt from
// `body.prompt ?? buildShotPromptV2(storyboardShot, …)` — the approved plan was
// never read. So the Director pressing "Re-generate" in the UI got a video that
// bypassed the plan he had approved (and, because the panel echoed the previous
// asset's stored prompt back, a re-authored plan was silently ignored). The
// plan is now the ONLY prompt source here, exactly as in the automated path;
// the legacy storyboard template and the free-text prompt override are gone —
// to change the prompt, revise the plan (REQUEST_REVISION → Animator) or edit
// it on the Shot Plan contract page.
//
// Mode-gated via `enforceMode('REGENERATE_IMAGE')` — same Category C as
// regenerate-image.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { logEvent } from '@/lib/api/events';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { getMultiVideoProvider } from '@/lib/agents/providers/video-gen-multi';
import { getVgenDefaults } from '@/lib/api/vgen-defaults';
import {
  clampRenderDuration,
  deliveryAspectFor,
  type VideoAspectRatio,
  type VideoProviderId,
  type VideoResolution,
} from '@/lib/api/provider-capabilities';
import {
  resolveVideoParams,
  type EpisodeVideoConfig,
} from '@/lib/api/resolve-generation-params';
import { persistBinary } from '@/lib/agents/persist-binary';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { enforceMode } from '@/lib/governance';
import { recordCost } from '@/lib/budget';
import { parseShotPlanContract } from '@/lib/api/shot-plan-contract';
import {
  assertShotReadyForGeneration,
  resolveApprovedShotPlan,
  shotPlanRenderParams,
} from '@/lib/api/shot-readiness';
import {
  effectiveDurationSeconds,
  isAnimaticV1,
} from '@/lib/api/animatic-shotlist';
import {
  getApprovedEREFForShot,
  getStoryboardShotById,
} from '@/lib/api/vgen-shot-helpers';
import { readAssetMediaAsBase64 } from '@/lib/media-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  // NO `prompt`, `provider`, `quality_tier`, `resolution`, `seed` or
  // `duration_seconds` — every one of them is a DECISION of the approved
  // SPC-shot_plan, read here through the same projection the automated path
  // uses (E33 audit P0 #4 + the three same-class holes, 2026-07-29). Each of
  // these fields was a second, uncontrolled channel: the drawer could run an
  // approved prompt at an unapproved tier/resolution, and `body.seed` let a
  // "retry" differ from the first take ONLY by seed — $0.968 on a dice roll
  // instead of on the revision. To change any of them, revise the plan
  // (REQUEST_REVISION → Animator) or edit it on the Shot Plan contract page.
  //
  // Aspect stays a per-shot channel: it is the delivery-format axis the
  // episode authority owns (resolveVideoParams), mirroring the runner's event
  // `aspectRatio` arg rather than a plan field.
  aspect_ratio: z.enum(['16:9', '9:16', '1:1', '21:9', '4:3', '3:4', 'auto']).optional(),
  end_image_asset_id: z.string().uuid().nullable().optional(),
  reference_asset_id: z.string().uuid().nullable().optional(),
  directorConfirm: z.boolean().optional(),
});

interface AssetRow {
  id: string;
  series_id: string | null;
  episode_id: string | null;
  filename: string;
  file_type: string;
  status: string;
  staging_path: string | null;
  drive_path: string | null;
  drive_file_id: string | null;
  drive_web_view_url: string | null;
  metadata: unknown;
  agent_id: string | null;
  version: number | null;
  content: string | null;
}

type GovernanceModeNum = 1 | 2 | 3;

async function resolveMode(
  sb: ReturnType<typeof createSupabaseServiceRoleClient>,
  asset: AssetRow,
): Promise<GovernanceModeNum> {
  if (asset.episode_id) {
    const { data } = await sb
      .from('episodes')
      .select('governance_mode')
      .eq('id', asset.episode_id)
      .maybeSingle();
    const mode = (data as { governance_mode?: number } | null)?.governance_mode;
    if (mode === 1 || mode === 2 || mode === 3) return mode;
  }
  return 1;
}

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const assetId = params?.id;
  if (!assetId) throw new NotFoundError('Asset');

  const { user } = await requireDirector();
  const body = await parseJson(req, Body);
  const sb = createSupabaseServiceRoleClient();

  const { data: assetRaw, error } = await sb
    .from('assets')
    .select('*')
    .eq('id', assetId)
    .maybeSingle();
  if (error) throw new Error(`asset fetch: ${error.message}`);
  if (!assetRaw) throw new NotFoundError(`Asset ${assetId}`);
  const asset = assetRaw as unknown as AssetRow;

  if (asset.status === 'LOCKED') {
    throw new ValidationError('Asset is LOCKED — cannot regenerate video');
  }
  if (!asset.file_type.startsWith('VID-shot')) {
    throw new ValidationError(
      `File type ${asset.file_type} is not a VID-shot — use the matching regenerate route`,
    );
  }
  if (!asset.episode_id) {
    throw new ValidationError('VID-shot asset is missing episode_id');
  }

  // Mode gate
  const mode = await resolveMode(sb, asset);
  const decision = enforceMode(
    'REGENERATE_IMAGE',
    { id: asset.episode_id, governance_mode: mode },
    {
      directorConfirm: body.directorConfirm ?? false,
      confirmedBy: user.email ?? user.id,
      actor: 'director',
    },
  );
  if (!decision.allowed) {
    return apiOk(
      {
        action_blocked: true,
        reason: decision.reason ?? 'Action not allowed in this mode',
        mode_at_time: decision.modeAtTime,
        category: decision.category,
        requires_director: decision.requiresDirector,
      },
      undefined,
      { status: 403 },
    );
  }

  // Resolve shot id from metadata
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const shotId = typeof meta.shot_id === 'string' ? meta.shot_id : null;
  if (!shotId) {
    throw new ValidationError(
      'VID-shot asset has no metadata.shot_id — cannot resolve storyboard shot',
    );
  }

  // Load storyboard shot for prompt building
  const { data: stbAsset } = await sb
    .from('assets')
    .select('id,content')
    .eq('episode_id', asset.episode_id)
    .eq('file_type', 'STB-storyboard')
    .eq('status', 'APPROVED')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const storyboardShot = stbAsset?.content
    ? getStoryboardShotById(stbAsset.content, shotId)
    : null;

  // Episode row — filename prefix + the format authority (generation_config).
  const { data: epRow } = await sb
    .from('episodes')
    .select('episode_code,metadata')
    .eq('id', asset.episode_id)
    .maybeSingle();
  const episodeCode = (epRow as { episode_code?: string } | null)?.episode_code ?? 'SS-unknown';
  const episodeMeta = ((epRow as { metadata?: unknown } | null)?.metadata ?? null) as
    | Record<string, unknown>
    | null;
  const episodeVideoConfig =
    (episodeMeta?.generation_config as { video?: EpisodeVideoConfig } | undefined)?.video ?? null;
  const episodeDeliveryTargets = Array.isArray(episodeMeta?.delivery_targets)
    ? (episodeMeta!.delivery_targets as unknown[]).filter(
        (t): t is string => typeof t === 'string',
      )
    : [];

  // ── Prompt = the shot's APPROVED plan, re-read from the DB ──────────────
  // Same contract, same parser, same fail-loud semantics as the automated path
  // (runner.ts EXEC-VGEN "Refusing silent storyboard fallback"). Resolved BY
  // SHOT, not by an id cached on the previous asset, so a plan re-authored
  // after a REQUEST_REVISION is the one that renders. Every failure mode is a
  // hard refusal with a reason the Director can act on — a silent fallback to
  // a legacy template is precisely the defect this replaces.
  const { plan, reason: planReason } = await resolveApprovedShotPlan(
    sb,
    asset.episode_id,
    shotId,
    null,
  );
  if (!plan) {
    throw new ValidationError(
      `Shot ${shotId} has no APPROVED shot plan (${planReason ?? 'not found'}) — refusing to re-render off-plan. Author/approve the plan first (Animator → EXEC-VPREV → approve).`,
    );
  }

  // ── FREE readiness gate — the same one `/trigger` runs ($0, pre-spend) ───
  // Hole #3 of the same family: the gate guarded the automated dispatch but NOT
  // the Director's button, so a manual re-render could pay a full render and
  // only THEN die on a dead reference, a cancelled VGEN, or a plan whose
  // declared resolution the provider cannot render. Pinned to `plan.id` so the
  // gate validates exactly the plan this request is about to execute. Throws
  // ShotNotReadyError (a ValidationError → 400 carrying the blockers).
  await assertShotReadyForGeneration(sb, {
    shotId,
    episodeId: asset.episode_id,
    planAssetId: plan.id,
  });

  const planContract = parseShotPlanContract(plan.content);
  // The gate above already blocks `plan_unparseable` / `prompt_missing` with
  // richer findings; this is the type-narrowing backstop, not a second gate.
  if (!planContract.prompt) {
    throw new ValidationError(
      `Shot plan ${plan.id} for ${shotId} has no usable \`prompt\`${planContract.error ? ` (${planContract.error})` : ''}. Refusing to re-render off-plan.`,
    );
  }
  const finalPrompt = planContract.prompt;

  // ── The plan's OTHER decisions — provider / quality / resolution / seed ──
  // Same projection the runner's plan-driven branch consumes. Executing the
  // plan's prompt while picking the tier from a UI drawer is the same defect as
  // discarding the plan, just smaller: a contract honoured in part is not
  // honoured. `providerUnknown` mirrors the runner's soft fall-back.
  const planParams = shotPlanRenderParams(planContract);

  // Resolve reference image: override → approved EREF for shot → none
  let referenceImageBase64: string | null = null;
  let referenceErefAssetId: string | null = null;
  if (body.reference_asset_id) {
    const { data: ref } = await sb
      .from('assets')
      .select('id,filename,staging_path,drive_file_id')
      .eq('id', body.reference_asset_id)
      .maybeSingle();
    const refRow = ref as {
      id?: string;
      filename?: string | null;
      staging_path?: string | null;
      drive_file_id?: string | null;
    } | null;
    if (!refRow) {
      throw new ValidationError(
        `Reference asset ${body.reference_asset_id} not found`,
      );
    }
    referenceImageBase64 = await readAssetMediaAsBase64({
      filename: refRow.filename ?? null,
      driveFileId: refRow.drive_file_id ?? null,
      stagingPath: refRow.staging_path ?? null,
    });
    // Director explicitly chose this reference — if its media can't resolve we
    // must NOT silently drop it (that turns img2vid into t2v). Fail LOUD.
    if (!referenceImageBase64) {
      throw new ValidationError(
        `Reference asset ${body.reference_asset_id} has no resolvable media (no disk-cache hit, no Drive bytes, no legacy staging file)`,
      );
    }
    referenceErefAssetId = refRow.id ?? body.reference_asset_id;
  } else {
    const ref = await getApprovedEREFForShot(sb, asset.episode_id, shotId);
    if (ref) {
      referenceErefAssetId = ref.asset.id;
      referenceImageBase64 = ref.image_b64;
      // 2026-07-19 — the SAME rule the explicit-override branch above states:
      // silently dropping the reference turns img2vid into t2v. This branch used
      // to assign a possibly-null `image_b64` and render anyway, so a shot with
      // an APPROVED reference whose bytes could not be resolved burned a full
      // paid render ($1.21 at seedance standard) on a clip that ignored its own
      // start frame — with a 200 OK and no warning anywhere.
      if (!referenceImageBase64) {
        throw new ValidationError(
          `Approved reference ${ref.asset.id} (${ref.asset.filename}) for ${shotId} has no resolvable media — refusing to render text-to-video against an anchored shot. Re-sync the media cache or regenerate the reference.`,
        );
      }
    }
  }

  // Sprint β: optional end-frame for Seedance start→end transition.
  let endImageBase64: string | null = null;
  if (body.end_image_asset_id) {
    const { data: endRef } = await sb
      .from('assets')
      .select('id,filename,staging_path,drive_file_id')
      .eq('id', body.end_image_asset_id)
      .maybeSingle();
    const endRow = endRef as {
      filename?: string | null;
      staging_path?: string | null;
      drive_file_id?: string | null;
    } | null;
    if (!endRow) {
      throw new ValidationError(
        `End-image asset ${body.end_image_asset_id} not found`,
      );
    }
    endImageBase64 = await readAssetMediaAsBase64({
      filename: endRow.filename ?? null,
      driveFileId: endRow.drive_file_id ?? null,
      stagingPath: endRow.staging_path ?? null,
    });
    // Director explicitly chose this end-frame — fail LOUD rather than silently
    // dropping it and degrading the start→end transition.
    if (!endImageBase64) {
      throw new ValidationError(
        `End-image asset ${body.end_image_asset_id} has no resolvable media (no disk-cache hit, no Drive bytes, no legacy staging file)`,
      );
    }
  }

  // Seed: the PLAN's, or none. Never the drawer's, never a fresh roll — an
  // unlocked seed is why the E33 SH01 retry differed from take 1 by nothing but
  // the dice. Providers that ignore seed drop it at the call site below.
  const seed = planParams.seed ?? undefined;

  // 2026-06-09: single resolver authority (same call the runner makes). The
  // shot-override channel now carries the PLAN's provider / quality /
  // resolution (2026-07-29) instead of drawer edits + previous-asset metadata;
  // episode generation_config still wins for declared fields unless
  // allow_shot_overrides is on. Aspect remains the per-request channel.
  const seriesDefaults = await getVgenDefaults(sb, asset.series_id);
  const resolved = resolveVideoParams({
    episodeConfig: episodeVideoConfig,
    shotOverride: {
      provider_id: planParams.format.provider_id,
      aspect_ratio:
        body.aspect_ratio ??
        (typeof meta.aspect_ratio === 'string' ? (meta.aspect_ratio as VideoAspectRatio) : null),
      quality_tier: planParams.format.quality_tier,
      resolution: planParams.format.resolution,
    },
    seriesDefaults,
    deliveryAspect: deliveryAspectFor(episodeDeliveryTargets),
  });
  const providerId: VideoProviderId = resolved.providerId;
  const aspectRatio = resolved.aspectRatio;
  const qualityTier = resolved.qualityTier;
  const resolution: VideoResolution | undefined = resolved.resolution ?? undefined;
  const videoProvider = getMultiVideoProvider(providerId);
  const cap = videoProvider.capabilities;

  // Where each field actually came from. When the plan declares nothing the
  // resolver falls through to episode/series/fallback — legitimate, but it must
  // be VISIBLE (the requirement is "explicit, not a silent pick"), so the source
  // map rides along into the asset description, metadata and the response.
  const formatSource = {
    ...resolved.source,
    ...(planParams.providerUnknown
      ? { plan_provider_id: `${planContract.providerId} (off-allowlist → fell back)` }
      : {}),
  };

  // ── RENDER duration — same authority order as the runner ────────────────
  // Director directive 2026-06-22: render length is the episode-TIMELINE
  // (animatic director_overrides) value, not the possibly-stale plan value —
  // render length is cost. Plan is the fallback, then the storyboard. The
  // drawer's slider is gone: it was a fourth source with the highest priority
  // and no record. Clamped to the resolved provider's contract, never a
  // hardcoded range.
  const { data: animaticRow } = await sb
    .from('assets')
    .select('metadata')
    .eq('episode_id', asset.episode_id)
    .eq('file_type', 'VID-animatic')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const animaticMeta = (animaticRow as { metadata?: unknown } | null)?.metadata;
  const animaticDuration = (() => {
    if (!isAnimaticV1(animaticMeta)) return null;
    const doc = animaticMeta.animatic_v1;
    const animShot = doc.shot_list.find((s) => s.shot_id === shotId);
    if (!animShot) return null;
    return effectiveDurationSeconds(animShot, doc.director_overrides);
  })();
  const { durationSeconds, durationSource } = (() => {
    const pick = (n: number, source: string) => ({
      durationSeconds: clampRenderDuration(cap, n),
      durationSource: source,
    });
    if (animaticDuration !== null && animaticDuration > 0) {
      return pick(animaticDuration, 'animatic');
    }
    if (planParams.durationSeconds !== null && planParams.durationSeconds > 0) {
      return pick(planParams.durationSeconds, 'plan');
    }
    if (storyboardShot?.duration_seconds && storyboardShot.duration_seconds > 0) {
      return pick(storyboardShot.duration_seconds, 'storyboard');
    }
    return pick(5, 'fallback');
  })();

  // Veo Standard img2vid quirk — see runner.ts EXEC-VGEN for full rationale.
  // Seedance has no equivalent constraint; only force-8 when explicitly Veo.
  const isVeoProvider = providerId === 'veo-3-img2vid';
  const generationDuration =
    isVeoProvider && referenceImageBase64 && qualityTier === 'standard'
      ? 8
      : durationSeconds;

  // Generate video via multi-provider router (Sprint β capability surface).
  const real = await videoProvider.generate({
    prompt: finalPrompt,
    aspectRatio,
    quality: qualityTier,
    durationSeconds: generationDuration,
    ...(referenceImageBase64
      ? { referenceImageBase64, referenceImageMime: 'image/png' as const }
      : {}),
    ...(cap.supports_resolutions.length > 0 && resolution
      ? { resolution }
      : {}),
    ...(cap.supports_seed && typeof seed === 'number'
      ? { seed }
      : {}),
    ...(cap.supports_end_image && endImageBase64
      ? { endImageBase64, endImageMime: 'image/png' as const }
      : {}),
  });

  // Persist as a NEW asset row (REVIEW status). Auto-increment version.
  // file_type carries a per-shot variant suffix → prefix-match.
  const { data: existing } = await sb
    .from('assets')
    .select('version')
    .eq('episode_id', asset.episode_id)
    .like('file_type', 'VID-shot%')
    .filter('metadata->>shot_id', 'eq', shotId);
  const maxVersion = ((existing ?? []) as Array<{ version?: number | null }>).reduce(
    (m, row) => Math.max(m, row.version ?? 0),
    0,
  );
  const nextVersion = maxVersion + 1;
  const safeShotId = shotId.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const versionTag = `v${String(nextVersion).padStart(2, '0')}`;

  const persisted = await persistBinary({
    base64: real.mp4_b64,
    ext: 'mp4',
    driveFilename: `${episodeCode}-VID-shot_${safeShotId}-${versionTag}-DRAFT.mp4`,
    localHint: `shot-${safeShotId}`,
    episodeCode,
    supabase: sb,
  });

  const newMetadata = {
    agent_id: 'EXEC-VGEN',
    shot_id: shotId,
    provider_id: real.provider,
    provider_used: real.provider,
    // Provider verification stamp (Phase A.1 directive 2026-05-07).
    model_id: real.model_id,
    operation_name: real.operation_name,
    format: real.format,
    width: real.width,
    height: real.height,
    duration_seconds: real.duration_seconds,
    size_bytes: real.size_bytes,
    aspect_ratio: aspectRatio,
    quality_tier: qualityTier,
    // Sprint β: persist capability-extension knobs so reruns inherit them.
    ...(resolution ? { resolution } : {}),
    ...(typeof seed === 'number' ? { seed } : {}),
    ...(body.end_image_asset_id ? { end_image_asset_id: body.end_image_asset_id } : {}),
    prompt: finalPrompt,
    // Provenance — which approved plan this render executed, and which layer won
    // each parameter. Lets an audit prove the manual re-render honoured the plan
    // in FULL, not just its prompt (E33 audit P0 #4 + the three same-class holes).
    plan_asset_id: plan.id,
    format_source: formatSource,
    duration_source: durationSource,
    reference_eref_asset_id: referenceErefAssetId,
    storyboard_asset_id: stbAsset?.id ?? null,
    staging_path: persisted.absolutePath,
    drive_file_id: persisted.driveFileId,
    drive_web_view_url: persisted.driveWebViewUrl,
    storage_provider: persisted.storageProviderId,
    drive_upload_failed: persisted.driveUploadFailed,
    regenerated_from_asset_id: assetId,
    mode_at_time: decision.modeAtTime,
    // Preserve vgen_pilot flag from the source so the latest row keeps
    // counting as a pilot. Without this, regenerating a pilot shot dropped
    // pilot_approved_count back below pilot_count and "Approve Direction &
    // Fan Out" reported 1/2 even after the Director approved both pilots.
    // Director surfaced this 2026-05-13 evening on E20.
    ...(meta.vgen_pilot === true ? { vgen_pilot: true as const } : {}),
  } as Record<string, unknown>;

  // Production trace shown in AssetPreview's "⚙ {description}" green box.
  // Includes model_id so Director can audit Veo 3.0 vs 3.1 at a glance
  // (Phase A.1 directive 2026-05-07 — "Verify provider").
  const description = `model=${real.model_id} · ${aspectRatio} · ${qualityTier} · ${real.duration_seconds}s · cost $${real.cost_usd.toFixed(3)} · op=${real.operation_name} · plan=${plan.id.slice(0, 8)} · src[provider=${resolved.source.provider} quality=${resolved.source.quality} res=${resolved.source.resolution} dur=${durationSource}${typeof seed === 'number' ? ' seed=plan' : ''}]`;

  const { data: insertedAsset, error: insErr } = await sb
    .from('assets')
    .insert({
      episode_id: asset.episode_id,
      agent_id: 'EXEC-VGEN',
      file_type: 'VID-shot',
      filename: `${episodeCode}-VID-shot_${safeShotId}-${versionTag}-DRAFT.mp4`,
      description,
      drive_path: persisted.browserUrl,
      staging_path: persisted.absolutePath,
      drive_file_id: persisted.driveFileId,
      drive_web_view_url: persisted.driveWebViewUrl,
      status: 'REVIEW',
      version: nextVersion,
      metadata: newMetadata as never,
    } as never)
    .select('id')
    .single();
  if (insErr) throw new Error(`asset insert failed: ${insErr.message}`);

  // Record the real video cost in budget_log so the expenses tab counts manual
  // rerolls (previously only the automated pipeline recorded cost). jobId=null
  // (no Inngest job); enforceCeiling=false — money already spent. Best-effort.
  try {
    await recordCost(sb, {
      jobId: null,
      episodeId: asset.episode_id ?? null,
      agentId: 'EXEC-VGEN',
      costUsd: real.cost_usd,
      apiProvider: real.model_id ?? real.operation_name ?? 'video',
      modelOrTier: real.model_id ?? 'video',
      operation: 'video_reroll',
      enforceCeiling: false,
    });
  } catch {
    /* non-fatal — video already generated; accounting is best-effort here */
  }

  // TD-29.5 (2026-05-21): route through logEvent so the row consistently
  // emits pa/notify-needed when the event_type is actionable.
  await logEvent(sb, {
    event_type: 'asset_updated',
    severity: 'info',
    title: `Video regenerated: shot ${shotId} → ${versionTag}`,
    description: `Director ${user.email ?? user.id} regenerated VGEN shot (cost $${real.cost_usd.toFixed(3)})`,
    actor: user.id,
    asset_id: insertedAsset?.id,
    episode_id: asset.episode_id,
    metadata: {
      kind: 'vgen_regenerate',
      regenerated_from: assetId,
      shot_id: shotId,
      cost_usd: real.cost_usd,
      aspect_ratio: aspectRatio,
      quality_tier: qualityTier,
      duration_seconds: durationSeconds,
      mode_at_time: decision.modeAtTime,
    },
  });

  return apiOk({
    asset_id: insertedAsset?.id,
    cost_usd: real.cost_usd,
    duration_seconds: durationSeconds,
    aspect_ratio: aspectRatio,
    quality_tier: qualityTier,
    // The plan that was executed + which layer supplied each parameter, so the
    // drawer can show what actually drove the render instead of echoing back
    // the controls the Director happened to be looking at.
    plan_asset_id: plan.id,
    provider_id: providerId,
    resolution: resolution ?? null,
    seed: seed ?? null,
    format_source: formatSource,
    duration_source: durationSource,
    new_version: nextVersion,
    staging_url: persisted.browserUrl,
    drive_web_view_url: persisted.driveWebViewUrl,
  });
});
