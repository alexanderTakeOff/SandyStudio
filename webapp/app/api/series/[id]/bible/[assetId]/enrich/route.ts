// ──────────────────────────────────────────────────────────────────────────────
// app/api/series/[id]/bible/[assetId]/enrich/route.ts
// Director-triggered enrichment of an existing Bible DRAFT.
//
// Use case: legacy DRAFTs (created before EXEC-BIBLE-AUTHOR) or DRAFTs whose
// auto-enrichment failed at extension-approval time. Director clicks
// "Generate description + image" in the Drawer and we run the same
// runBibleAuthor pipeline as the canon-extension approval.
//
// Refuses to run when:
//   - asset.status === 'LOCKED'
//   - metadata.image_prompt already exists (use /regenerate-image instead)
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { runBibleAuthor, BibleAuthorError, type BibleSection } from '@/lib/agents/runners/bible-author';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { sectionFromFileType, type AssetMetadataDoc } from '@/lib/api/series-bible';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AssetRow {
  id: string;
  series_id: string | null;
  filename: string;
  file_type: string;
  status: string;
  description: string | null;
  metadata: AssetMetadataDoc | null;
}

export const POST = withApiHandler(async (_req, ctx) => {
  const params = (await ctx?.params) as { id: string; assetId: string } | undefined;
  const seriesId = params?.id;
  const assetId = params?.assetId;
  if (!seriesId || !assetId) throw new NotFoundError('Asset');

  await requireDirector();
  const sb = createSupabaseServiceRoleClient();

  const { data: assetRaw, error } = await sb
    .from('assets')
    .select('id,series_id,filename,file_type,status,description,metadata')
    .eq('id', assetId)
    .maybeSingle();
  if (error) throw new Error(`asset fetch: ${error.message}`);
  if (!assetRaw) throw new NotFoundError(`Asset ${assetId}`);
  const asset = assetRaw as unknown as AssetRow;

  if (asset.series_id !== seriesId) {
    throw new ValidationError('Asset does not belong to this series');
  }
  if (asset.status === 'LOCKED') {
    throw new ValidationError('Asset is LOCKED — cannot enrich');
  }
  if (asset.metadata?.image_prompt && asset.metadata.image_prompt.history.length > 0) {
    throw new ValidationError(
      'Asset already enriched — use /regenerate-image to reroll the image',
    );
  }

  const section = sectionFromFileType(asset.file_type);
  if (!section || section === 'general_idea' || section === 'audio') {
    throw new ValidationError(
      `Cannot enrich ${asset.file_type} — only character/location/object/style supported`,
    );
  }

  // Slug = part after `SBL-{section}_` prefix.
  const prefix = `SBL-${section}_`;
  const slug = asset.file_type.startsWith(prefix)
    ? asset.file_type.slice(prefix.length)
    : asset.file_type.slice('SBL-'.length).replace(/^[^_]+_/, '');

  try {
    const r = await runBibleAuthor({
      supabase: sb,
      assetId,
      seriesId,
      section: section as BibleSection,
      slug,
      seedDescription: asset.description ?? '',
      filename: asset.filename,
      source: 'manual_add',
    });
    return apiOk({
      asset_id: assetId,
      cost_usd: r.costUsd,
      width: r.imageWidth,
      height: r.imageHeight,
      style_anchor_asset_id: r.styleAnchorAssetId,
    });
  } catch (err: unknown) {
    if (err instanceof BibleAuthorError) {
      throw new ValidationError(`Enrichment failed: ${err.message}`);
    }
    throw err;
  }
});
