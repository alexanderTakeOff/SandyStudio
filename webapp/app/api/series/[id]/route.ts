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

// Attach / detach the channel. Deliberately the ONLY editable field here —
// full series editing stays deferred to Phase 7. Detaching (channel_id: null)
// puts the series back behind the publish/analytics HALT gate (multi-channel.md §4).
const PatchBody = z.object({
  channel_id: z.string().uuid().nullable(),
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

  const { data: updated, error } = await supabase
    .from('series' as never)
    .update({ channel_id: body.channel_id } as never)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`series update failed: ${error.message}`);
  if (!updated) throw new NotFoundError(`Series ${id}`);

  return apiOk(updated as unknown as SeriesRow);
});
