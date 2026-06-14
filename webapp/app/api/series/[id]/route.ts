// ──────────────────────────────────────────────────────────────────────────────
// app/api/series/[id]/route.ts
// GET single series + episode count + authority matrix.
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
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
