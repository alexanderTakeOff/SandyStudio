// ──────────────────────────────────────────────────────────────────────────────
// app/api/series/[id]/bible/[assetId]/regenerate-image/route.ts
// Director-driven prompt edit + image reroll for a Bible asset.
//
// Two actions, single endpoint:
//
//   POST { prompt, quality? }
//     → run gpt-image-1 with the (edited) prompt, push entry to
//       metadata.image_prompt.history (preserving older versions for rollback),
//       update staging_path / drive_* on the asset row to the new image.
//
//   POST { restore_version: <int> }
//     → copy a previous history entry forward as a NEW entry (source='restore'),
//       point staging_path / drive_* at the old image_url. No paid call. No
//       destruction of any history row.
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
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  type AssetMetadataDoc,
  type ImagePromptHistoryEntry,
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
  }),
  z.object({
    restore_version: z.number().int().positive(),
  }),
]);

interface AssetRow {
  id: string;
  series_id: string | null;
  filename: string;
  status: string;
  staging_path: string | null;
  drive_file_id: string | null;
  drive_web_view_url: string | null;
  drive_path: string | null;
  metadata: AssetMetadataDoc | null;
}

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string; assetId: string } | undefined;
  const seriesId = params?.id;
  const assetId = params?.assetId;
  if (!seriesId || !assetId) throw new NotFoundError('Asset');

  const { user } = await requireDirector();
  const body = await parseJson(req, Body);

  // Service-role: we touch metadata which is RLS-bound, and we want write
  // determinism without bouncing through the user's session.
  const sb = createSupabaseServiceRoleClient();

  const { data: assetRaw, error: assetErr } = await sb
    .from('assets')
    .select(
      'id,series_id,filename,status,staging_path,drive_file_id,drive_web_view_url,drive_path,metadata',
    )
    .eq('id', assetId)
    .maybeSingle();
  if (assetErr) throw new Error(`asset fetch: ${assetErr.message}`);
  if (!assetRaw) throw new NotFoundError(`Asset ${assetId}`);
  const asset = assetRaw as unknown as AssetRow;

  if (asset.series_id !== seriesId) {
    throw new ValidationError('Asset does not belong to this series');
  }
  if (asset.status === 'LOCKED') {
    throw new ValidationError('Asset is LOCKED — cannot regenerate image');
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
    };
    const newMeta: AssetMetadataDoc = {
      ...meta,
      image_prompt: {
        current_version: nextVersion,
        style_anchor_asset_id: meta.image_prompt?.style_anchor_asset_id ?? null,
        history: [...existingHistory, restoreEntry],
      },
      provenance: meta.provenance
        ? stampLastModified(meta.provenance, user.email ?? user.id, 'director', nowIso)
        : buildProvenance({
            by: user.email ?? user.id,
            byKind: 'director',
            source: 'manual_add',
            at: nowIso,
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
      title: `Bible image restored: ${asset.filename} → v${target.version}`,
      description: `Director ${user.email ?? user.id} rolled back to version ${target.version}`,
      actor: user.id,
      asset_id: assetId,
      episode_id: null,
      metadata: {
        kind: 'image_prompt_restore',
        from_version: target.version,
        new_version: nextVersion,
      },
    } as never);

    return apiOk({
      asset_id: assetId,
      action: 'restore',
      restored_from_version: target.version,
      new_version: nextVersion,
      cost_usd: 0,
    });
  }

  // ── Branch B: edit prompt + reroll ────────────────────────────────────────
  const real = await generateImageOpenAI({
    prompt: body.prompt,
    size: '1024x1024',
    quality: body.quality ?? 'medium',
  });

  const persisted = await persistBinary({
    base64: real.b64_data,
    ext: 'png',
    driveFilename: asset.filename.replace(/-(v\d+)-([A-Z]+)\.md$/, `-$1-$2.png`).replace(/\.md$/, '.png'),
    localHint: `bible-regen-${assetId.slice(-8)}`,
    episodeCode: undefined,
    supabase: sb,
  });

  const newEntry: ImagePromptHistoryEntry = {
    version: nextVersion,
    prompt: body.prompt,
    source: 'director_edit',
    at: nowIso,
    cost_usd: real.cost_usd,
    staging_path: persisted.absolutePath,
    drive_file_id: persisted.driveFileId,
    drive_web_view_url: persisted.driveWebViewUrl,
    width: real.width,
    height: real.height,
    quality: body.quality ?? 'medium',
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
      ? stampLastModified(meta.provenance, user.email ?? user.id, 'director', nowIso)
      : buildProvenance({
          by: user.email ?? user.id,
          byKind: 'director',
          source: 'manual_add',
          at: nowIso,
        }),
  };

  const upd = await sb
    .from('assets')
    .update({
      staging_path: persisted.absolutePath,
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
    title: `Bible image regenerated: ${asset.filename} → v${nextVersion}`,
    description: `Director ${user.email ?? user.id} edited prompt and rerolled (cost $${real.cost_usd.toFixed(4)})`,
    actor: user.id,
    asset_id: assetId,
    episode_id: null,
    metadata: {
      kind: 'image_prompt_reroll',
      new_version: nextVersion,
      cost_usd: real.cost_usd,
      width: real.width,
      height: real.height,
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
  });
});
