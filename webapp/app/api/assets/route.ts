// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/route.ts
// Assets list. Filters: episode_id, file_type, status.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseSearchParams } from '@/lib/api/zod-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ListQuery = z.object({
  episode_id: z.string().uuid().optional(),
  file_type: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
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
  if (q.status)     query = query.eq('status', q.status as never);

  const { data, error } = await query;
  if (error) throw new Error(`assets list failed: ${error.message}`);
  return apiOk(data ?? [], { total: (data ?? []).length });
});
