// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/state-matrix/route.ts
// GET the Episode State Matrix (Фаза 1) — the one canonical projection of
// "where everything is now". Returns both the structured matrix (for the UI)
// and its markdown render (the same truth the conductor reads).
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import {
  getEpisodeStateMatrix,
  renderStateMatrixMarkdown,
} from '@/lib/agents/state-matrix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiHandler(async (_req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Episode');

  const { supabase } = await requireDirector();

  const matrix = await getEpisodeStateMatrix(supabase, id);
  return apiOk({ matrix, markdown: renderStateMatrixMarkdown(matrix) });
});
