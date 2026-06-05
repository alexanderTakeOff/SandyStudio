// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/route.ts
// Assets list. Filters: episode_id, file_type, status.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseSearchParams } from '@/lib/api/zod-helpers';
import { buildFileTypePrefixOr } from '@/lib/api/asset-filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ListQuery = z.object({
  episode_id: z.string().uuid().optional(),
  file_type: z.string().optional(),
  // Comma-separated file_type prefixes — lets a caller fetch ONLY its category
  // (e.g. "IMG-episode_ref,IMG-anchor") server-side instead of pulling all
  // asset types and filtering on the client, which silently truncated older
  // rows once an episode exceeded the list cap.
  file_type_prefix: z.string().optional(),
  status: z.string().optional(),
  // Backstop only — scoped (prefix) queries return ≪200 rows; 500 leaves margin
  // for a large single-category episode without inviting an unbounded fetch.
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireDirector();
  const q = parseSearchParams(req.url, ListQuery);

  let query = supabase
    .from('assets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(q.limit);
  if (q.episode_id) query = query.eq('episode_id', q.episode_id);
  if (q.file_type)  query = query.eq('file_type', q.file_type);
  if (q.file_type_prefix) {
    const orExpr = buildFileTypePrefixOr(q.file_type_prefix);
    if (orExpr) query = query.or(orExpr);
  }
  if (q.status)     query = query.eq('status', q.status as never);

  const { data, error } = await query;
  if (error) throw new Error(`assets list failed: ${error.message}`);
  return apiOk(data ?? [], { total: (data ?? []).length });
});
