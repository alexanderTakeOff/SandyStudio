// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/regenerate-video/route.ts
// Per-shot VGEN re-generation with edited Universal Core settings
// (purrfect-stirring-hollerith plan, Phase 1).
//
// Director opens a VID-shot in the Episode Asset Drawer, edits aspect /
// quality / duration / prompt / reference, and clicks "Generate". This route:
//   1. Validates the asset is a VID-shot.
//   2. Resolves the storyboard shot (from the asset's metadata.shot_id).
//   3. Loads (or accepts an override of) the approved EREF reference image.
//   4. Calls Veo 3 with the chosen Universal Core settings.
//   5. Persists the new mp4 → NEW asset row (status REVIEW). Old asset is
//      preserved for audit / rollback.
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
import { getVgenDefaults, type VgenProviderId } from '@/lib/api/vgen-defaults';
import {
  deliveryAspectFor,
  type VideoAspectRatio,
  type VideoProviderId,
  type VideoQualityTier,
  type VideoResolution,
} from '@/lib/api/provider-capabilities';
import {
  resolveVideoParams,
  type EpisodeVideoConfig,
} from '@/lib/api/resolve-generation-params';
import { persistBinary } from '@/lib/agents/persist-binary';
import { loadSeriesBibleCanon } from '@/lib/agents/bible-loader';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { enforceMode } from '@/lib/governance';
import { recordCost } from '@/lib/budget';
import {
  buildShotPromptV2,
  makeCharacterCanonSnippets,
  getApprovedEREFForShot,
  getStoryboardShotById,
} from '@/lib/api/vgen-shot-helpers';
import { readAssetMediaAsBase64 } from '@/lib/media-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  prompt: z.string().min(8).max(8000).optional(),
  // Sprint β 2026-05-14: full capability surface. Adapters narrow + downgrade
  // per provider (e.g. Veo silently downgrades 21:9 → 16:9; ignores seed).
  aspect_ratio: z.enum(['16:9', '9:16', '1:1', '21:9', '4:3', '3:4', 'auto']).optional(),
  quality_tier: z.enum(['fast', 'standard']).optional(),
  duration_seconds: z.number().min(4).max(15).optional(),
  resolution: z.enum(['480p', '720p', '1080p']).optional(),
  seed: z.number().int().optional(),
  end_image_asset_id: z.string().uuid().nullable().optional(),
  reference_asset_id: z.string().uuid().nullable().optional(),
  // Phase 2 (2026-05-13): explicit provider override per UI dropdown choice.
  // Fallback chain: body override → asset metadata.provider_id → series default
  // (app_config.vgen_defaults.<series>) → FALLBACK_DEFAULTS.provider_id.
  provider: z.enum(['veo-3-img2vid', 'seedance-fal-img2vid']).optional(),
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

  // Episode title for prompt context
  const { data: epRow } = await sb
    .from('episodes')
    .select('episode_code,title_working,metadata')
    .eq('id', asset.episode_id)
    .maybeSingle();
  const episodeCode = (epRow as { episode_code?: string } | null)?.episode_code ?? 'SS-unknown';
  const episodeTitle = (epRow as { title_working?: string | null } | null)?.title_working ?? '';
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

  // Phase A.1 — load Bible character canon to anchor character visuals in the
  // prompt alongside the EREF reference image. Failure is non-fatal: degrade
  // to empty canon so regenerate still works on series without Bible.
  let bibleCanon: ReturnType<typeof makeCharacterCanonSnippets> = [];
  try {
    const bible = await loadSeriesBibleCanon(sb, asset.episode_id);
    bibleCanon = makeCharacterCanonSnippets(
      bible.characters.map((c) => ({ slug: c.slug, description: c.description })),
    );
  } catch {
    bibleCanon = [];
  }

  // Resolve prompt: explicit override → buildShotPromptV2 (with Bible canon) → fallback
  const finalPrompt = body.prompt
    ? body.prompt
    : storyboardShot
      ? buildShotPromptV2(storyboardShot, episodeTitle, bibleCanon)
      : `Single shot from animated comedy "${episodeTitle}" (shot ${shotId}). Vibrant 2D animation, dynamic action, comedic timing.`;

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

  const seed = typeof body.seed === 'number' ? body.seed : undefined;

  // Map a previous asset's stored provider_id (which may be a legacy alias)
  // into the canonical id for the shot-override channel.
  function normalizeProviderId(raw: string | null | undefined): VgenProviderId | null {
    if (raw === 'veo-3' || raw === 'veo-3-img2vid') return 'veo-3-img2vid';
    if (raw === 'seedance-fal' || raw === 'seedance-fal-img2vid') return 'seedance-fal-img2vid';
    return null;
  }

  // 2026-06-09: single resolver authority (same as the runner). Director's
  // explicit drawer edits (body) and the previous asset's metadata form the
  // per-shot override channel; episode generation_config wins for declared
  // fields unless allow_shot_overrides is on. duration + seed stay per-shot
  // (q27). For an un-configured episode this reproduces the prior
  // body → meta → series → fallback chain — no regression.
  const seriesDefaults = await getVgenDefaults(sb, asset.series_id);
  const resolved = resolveVideoParams({
    episodeConfig: episodeVideoConfig,
    shotOverride: {
      provider_id:
        body.provider ??
        normalizeProviderId(typeof meta.provider_id === 'string' ? meta.provider_id : null),
      aspect_ratio:
        body.aspect_ratio ??
        (typeof meta.aspect_ratio === 'string' ? (meta.aspect_ratio as VideoAspectRatio) : null),
      quality_tier:
        body.quality_tier ??
        (typeof meta.quality_tier === 'string' ? (meta.quality_tier as VideoQualityTier) : null),
      resolution:
        body.resolution ??
        (typeof meta.resolution === 'string' ? (meta.resolution as VideoResolution) : null),
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

  const durationSeconds = (() => {
    const clamp = (n: number) => Math.min(cap.max_duration_s, Math.max(cap.min_duration_s, Math.round(n)));
    if (typeof body.duration_seconds === 'number' && body.duration_seconds > 0) {
      return clamp(body.duration_seconds);
    }
    if (typeof meta.duration_seconds === 'number' && meta.duration_seconds > 0) {
      return clamp(meta.duration_seconds as number);
    }
    if (storyboardShot?.duration_seconds && storyboardShot.duration_seconds > 0) {
      return clamp(storyboardShot.duration_seconds);
    }
    return clamp(5);
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
  const description = `model=${real.model_id} · ${aspectRatio} · ${qualityTier} · ${real.duration_seconds}s · cost $${real.cost_usd.toFixed(3)} · op=${real.operation_name}`;

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
    new_version: nextVersion,
    staging_url: persisted.browserUrl,
    drive_web_view_url: persisted.driveWebViewUrl,
  });
});
