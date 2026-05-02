// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/regenerate-image/route.ts
// Generic image-asset regeneration — works for ANY image asset:
//   - SBL-* (Bible character / location / object / style)
//   - IMG-episode_ref_* (per-episode reference)
//   - IMG-thumbnail
//   - any future image asset type
//
// Two actions, single endpoint:
//   POST { prompt, quality?, directorConfirm? }
//     → run gpt-image-1 with the (edited) prompt, push entry to
//       metadata.image_prompt.history (preserving older versions for rollback),
//       update staging_path / drive_* on the asset row to the new image.
//
//   POST { restore_version, directorConfirm? }
//     → copy a previous history entry forward as a NEW entry (source='restore'),
//       point staging_path / drive_* at the old image_url. No paid call.
//
// Mode-gated via `enforceMode('REGENERATE_IMAGE')`:
//   - Mode 1: requires `directorConfirm: true` in POST body
//   - Mode 2-3: pipeline auto-fire allowed (UI button just calls without flag)
//   - Mode 4: always allowed
//
// Bible assets don't carry an episode — we treat them as Mode-1 governed
// (Director's series-level canon work always requires explicit confirm).
// Episode-level assets pull `governance_mode` from the episode.
//
// Refuses to run when asset.status === 'LOCKED'.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { generateImageOpenAI } from '@/lib/agents/providers/openai-image';
import { persistBinary } from '@/lib/agents/persist-binary';
import { runStyleCheck } from '@/lib/agents/runners/style-check';
import { getStyleGuardianMode } from '@/lib/api/style-guardian-config';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { enforceMode } from '@/lib/governance';
import {
  type AssetMetadataDoc,
  type ImagePromptHistoryEntry,
  type GovernanceModeNum,
  stampLastModified,
  buildProvenance,
} from '@/lib/api/series-bible';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.union([
  z.object({
    prompt: z.string().min(8).max(8000),
    quality: z.enum(['low', 'medium', 'high']).optional(),
    style_anchor_asset_id: z.string().uuid().nullable().optional(),
    directorConfirm: z.boolean().optional(),
  }),
  z.object({
    restore_version: z.number().int().positive(),
    directorConfirm: z.boolean().optional(),
  }),
]);

interface AssetRow {
  id: string;
  series_id: string | null;
  episode_id: string | null;
  filename: string;
  file_type: string;
  status: string;
  staging_path: string | null;
  drive_file_id: string | null;
  drive_web_view_url: string | null;
  drive_path: string | null;
  metadata: AssetMetadataDoc | null;
}

async function resolveMode(
  sb: ReturnType<typeof createSupabaseServiceRoleClient>,
  asset: AssetRow,
): Promise<GovernanceModeNum> {
  // Episode-level asset → use its episode's governance_mode.
  if (asset.episode_id) {
    const { data } = await sb
      .from('episodes')
      .select('governance_mode')
      .eq('id', asset.episode_id)
      .maybeSingle();
    const mode = (data as { governance_mode?: number } | null)?.governance_mode;
    if (mode === 1 || mode === 2 || mode === 3 || mode === 4) return mode;
  }
  // Bible asset (series-level) — default to Mode 1 (Director's manual canon work).
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
    throw new ValidationError('Asset is LOCKED — cannot regenerate image');
  }

  // Only image-bearing assets (SBL-* / IMG-*) — block others.
  const isImageAsset =
    asset.file_type.startsWith('SBL-character') ||
    asset.file_type.startsWith('SBL-location') ||
    asset.file_type.startsWith('SBL-object') ||
    asset.file_type.startsWith('SBL-style') ||
    asset.file_type.startsWith('IMG-');
  if (!isImageAsset) {
    throw new ValidationError(`File type ${asset.file_type} is not an image asset — cannot regenerate`);
  }

  // ── Mode gate ──────────────────────────────────────────────────────────────
  const mode = await resolveMode(sb, asset);
  const decision = enforceMode(
    'REGENERATE_IMAGE',
    { id: asset.episode_id ?? asset.id, governance_mode: mode },
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

  const meta: AssetMetadataDoc = (asset.metadata ?? {}) as AssetMetadataDoc;
  const existingHistory = meta.image_prompt?.history ?? [];
  const nextVersion = (meta.image_prompt?.current_version ?? 0) + 1;
  const nowIso = new Date().toISOString();

  // ── Branch A: restore previous version ────────────────────────────────────
  if ('restore_version' in body) {
    const target = existingHistory.find((h) => h.version === body.restore_version);
    if (!target) {
      throw new ValidationError(
        `No image_prompt history entry with version ${body.restore_version}`,
      );
    }
    if (!target.staging_path && !target.drive_web_view_url) {
      throw new ValidationError(
        `Version ${body.restore_version} has no stored image URL — cannot restore`,
      );
    }
    const restoreEntry: ImagePromptHistoryEntry = {
      version: nextVersion,
      prompt: target.prompt,
      source: 'restore',
      at: nowIso,
      cost_usd: 0,
      staging_path: target.staging_path,
      drive_file_id: target.drive_file_id,
      drive_web_view_url: target.drive_web_view_url,
      width: target.width,
      height: target.height,
      quality: target.quality,
      restored_from_version: target.version,
      mode_at_time: decision.modeAtTime,
    };
    const newMeta: AssetMetadataDoc = {
      ...meta,
      image_prompt: {
        current_version: nextVersion,
        style_anchor_asset_id: meta.image_prompt?.style_anchor_asset_id ?? null,
        history: [...existingHistory, restoreEntry],
      },
      provenance: meta.provenance
        ? stampLastModified(meta.provenance, user.email ?? user.id, 'director', nowIso, decision.modeAtTime)
        : buildProvenance({
            by: user.email ?? user.id,
            byKind: 'director',
            source: 'manual_add',
            at: nowIso,
            modeAtTime: decision.modeAtTime,
          }),
    };

    const upd = await sb
      .from('assets')
      .update({
        staging_path: target.staging_path,
        drive_file_id: target.drive_file_id,
        drive_web_view_url: target.drive_web_view_url,
        metadata: newMeta as unknown as Record<string, unknown>,
      } as never)
      .eq('id', assetId);
    if (upd.error) throw new Error(`asset restore failed: ${upd.error.message}`);

    await sb.from('activity_events').insert({
      event_type: 'asset_updated',
      severity: 'info',
      title: `Image restored: ${asset.filename} → v${target.version}`,
      description: `Director ${user.email ?? user.id} rolled back to version ${target.version}`,
      actor: user.id,
      asset_id: assetId,
      episode_id: asset.episode_id,
      metadata: {
        kind: 'image_prompt_restore',
        from_version: target.version,
        new_version: nextVersion,
        mode_at_time: decision.modeAtTime,
      },
    } as never);

    return apiOk({
      asset_id: assetId,
      action: 'restore',
      restored_from_version: target.version,
      new_version: nextVersion,
      cost_usd: 0,
      mode_at_time: decision.modeAtTime,
    });
  }

  // ── Branch B: edit prompt + reroll ────────────────────────────────────────

  // Pre-flight Style Guardian check. Behaviour depends on app_config.style_guardian_mode:
  //   warn          → record verdict, NEVER block
  //   strict        → FAIL blocks (Director may pass directorConfirm with override flag)
  //   auto_rewrite  → use suggested_prompt instead of original; mark history
  let promptToSend = body.prompt;
  let styleVerdict: 'PASS' | 'WARN' | 'FAIL' | null = null;
  let styleRewritten = false;
  let styleSkipped = false;
  if (asset.series_id) {
    const guardMode = await getStyleGuardianMode(sb);
    const result = await runStyleCheck({
      supabase: sb,
      prompt: body.prompt,
      assetType: asset.file_type,
      seriesId: asset.series_id,
    });
    styleVerdict = result.verdict;
    styleSkipped = result.skipped;
    if (!result.skipped) {
      if (guardMode === 'strict' && result.verdict === 'FAIL') {
        return apiOk(
          {
            action_blocked: true,
            reason: 'Style Guardian FAIL — prompt diverges from LOCKED Series Bible style.',
            style_check: result,
            style_guardian_mode: guardMode,
          },
          undefined,
          { status: 409 },
        );
      }
      if (guardMode === 'auto_rewrite' && result.suggested_prompt && result.verdict !== 'PASS') {
        promptToSend = result.suggested_prompt;
        styleRewritten = true;
      }
    }
  }

  const real = await generateImageOpenAI({
    prompt: promptToSend,
    size: '1024x1024',
    quality: body.quality ?? 'medium',
  });

  const persisted = await persistBinary({
    base64: real.b64_data,
    ext: 'png',
    driveFilename: asset.filename
      .replace(/-(v\d+)-([A-Z]+)\.[a-z]+$/, `-$1-$2.png`)
      .replace(/\.md$/, '.png'),
    localHint: `regen-${assetId.slice(-8)}`,
    episodeCode: undefined,
    supabase: sb,
  });

  const newEntry: ImagePromptHistoryEntry = {
    version: nextVersion,
    prompt: promptToSend,
    source: 'director_edit',
    at: nowIso,
    cost_usd: real.cost_usd,
    staging_path: persisted.browserUrl,
    drive_file_id: persisted.driveFileId,
    drive_web_view_url: persisted.driveWebViewUrl,
    width: real.width,
    height: real.height,
    quality: body.quality ?? 'medium',
    mode_at_time: decision.modeAtTime,
    style_check_verdict: styleVerdict,
    style_check_rewritten: styleRewritten,
  };

  const newMeta: AssetMetadataDoc = {
    ...meta,
    image_prompt: {
      current_version: nextVersion,
      style_anchor_asset_id:
        body.style_anchor_asset_id !== undefined
          ? body.style_anchor_asset_id
          : meta.image_prompt?.style_anchor_asset_id ?? null,
      history: [...existingHistory, newEntry],
    },
    provenance: meta.provenance
      ? stampLastModified(meta.provenance, user.email ?? user.id, 'director', nowIso, decision.modeAtTime)
      : buildProvenance({
          by: user.email ?? user.id,
          byKind: 'director',
          source: 'manual_add',
          at: nowIso,
          modeAtTime: decision.modeAtTime,
        }),
  };

  const upd = await sb
    .from('assets')
    .update({
      staging_path: persisted.browserUrl,
      drive_file_id: persisted.driveFileId,
      drive_web_view_url: persisted.driveWebViewUrl,
      drive_path: persisted.browserUrl,
      metadata: newMeta as unknown as Record<string, unknown>,
    } as never)
    .eq('id', assetId);
  if (upd.error) throw new Error(`asset update failed: ${upd.error.message}`);

  await sb.from('activity_events').insert({
    event_type: 'asset_updated',
    severity: 'info',
    title: `Image regenerated: ${asset.filename} → v${nextVersion}`,
    description: `Director ${user.email ?? user.id} edited prompt and rerolled (cost $${real.cost_usd.toFixed(4)})`,
    actor: user.id,
    asset_id: assetId,
    episode_id: asset.episode_id,
    metadata: {
      kind: 'image_prompt_reroll',
      new_version: nextVersion,
      cost_usd: real.cost_usd,
      width: real.width,
      height: real.height,
      mode_at_time: decision.modeAtTime,
    },
  } as never);

  return apiOk({
    asset_id: assetId,
    action: 'reroll',
    new_version: nextVersion,
    cost_usd: real.cost_usd,
    width: real.width,
    height: real.height,
    staging_url: persisted.browserUrl,
    drive_web_view_url: persisted.driveWebViewUrl,
    mode_at_time: decision.modeAtTime,
    style_check: { verdict: styleVerdict, rewritten: styleRewritten, skipped: styleSkipped },
  });
});
