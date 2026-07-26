// ──────────────────────────────────────────────────────────────────────────────
// app/api/series/[id]/route.ts
// GET single series + episode count + authority matrix.
// PATCH — attach/detach the series' channel (multi-channel.md Phase 2).
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { applyPatch, mergeSectionPatch, metaObject } from '@/lib/api/metadata-merge';
import type { SeriesRow, AuthorityMatrixRow } from '@/lib/supabase/types-phase5b';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiHandler(async (_req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Series');

  const { supabase } = await requireDirector();
  const { data: series, error } = await supabase
    .from('series' as never)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`series fetch failed: ${error.message}`);
  if (!series) throw new NotFoundError(`Series ${id}`);

  const seriesRow = series as unknown as SeriesRow;

  const [matrixRes, epCountRes] = await Promise.all([
    supabase
      .from('approval_authority_matrix' as never)
      .select('*')
      .eq('series_id', id),
    supabase
      .from('episodes')
      .select('id', { count: 'exact', head: true })
      // 0038: episodes.series_id is the series UUID FK now (was series.code).
      .eq('series_id', id),
  ]);

  return apiOk({
    series: seriesRow,
    authority_matrix: ((matrixRes.data as unknown) as AuthorityMatrixRow[]) ?? [],
    episode_count: epCountRes.count ?? 0,
  });
});

// PATCH surface (multi-channel Phase 4c widened it from channel_id-only):
// channel attach/detach + the distribution/production metadata the agents read
// (branding cascade, playlist, delivery targets, gag taxonomy). Full series
// editing (title/logline/…) stays deferred to Phase 7. Detaching
// (channel_id: null) puts the series back behind the publish/analytics HALT
// gate (multi-channel.md §4).
const BrandingPatch = z.object({
  short_overlay_text: z.string().min(1).max(80).nullable().optional(),
  short_description: z.string().min(1).max(5000).nullable().optional(),
  short_tags: z.array(z.string().min(1).max(30)).max(30).nullable().optional(),
  subscribe_cta: z.string().min(1).max(200).nullable().optional(),
  long_description_boilerplate: z.string().min(1).max(1000).nullable().optional(),
});

const PatchBody = z.object({
  channel_id: z.string().uuid().nullable().optional(),
  youtube_playlist_id: z.string().min(1).max(60).nullable().optional(),
  delivery_targets: z.array(z.string().min(1).max(40)).max(8).nullable().optional(),
  gag_taxonomy: z.array(z.string().min(1).max(40)).max(30).nullable().optional(),
  branding: BrandingPatch.optional(),
});

export const PATCH = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Series');

  const { supabase } = await requireDirector();
  const body = await parseJson(req, PatchBody);

  if (body.channel_id) {
    const { data: ch } = await supabase
      .from('channels')
      .select('id')
      .eq('id', body.channel_id)
      .maybeSingle();
    if (!ch) throw new ValidationError(`Channel ${body.channel_id} does not exist`);
  }

  const update: Record<string, unknown> = {};
  if (body.channel_id !== undefined) update.channel_id = body.channel_id;

  const wantsMetadata =
    body.youtube_playlist_id !== undefined ||
    body.delivery_targets !== undefined ||
    body.gag_taxonomy !== undefined ||
    body.branding !== undefined;
  if (wantsMetadata) {
    const { data: current, error: readErr } = await supabase
      .from('series' as never)
      .select('metadata')
      .eq('id', id)
      .maybeSingle();
    if (readErr) throw new Error(`series read failed: ${readErr.message}`);
    if (!current) throw new NotFoundError(`Series ${id}`);
    let meta = metaObject((current as { metadata?: unknown }).metadata);
    meta = applyPatch(meta, {
      youtube_playlist_id: body.youtube_playlist_id,
      delivery_targets: body.delivery_targets,
      gag_taxonomy: body.gag_taxonomy,
    });
    if (body.branding !== undefined) meta = mergeSectionPatch(meta, 'branding', body.branding);
    update.metadata = meta;
  }

  const { data: updated, error } = await supabase
    .from('series' as never)
    .update(update as never)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`series update failed: ${error.message}`);
  if (!updated) throw new NotFoundError(`Series ${id}`);

  return apiOk(updated as unknown as SeriesRow);
});
