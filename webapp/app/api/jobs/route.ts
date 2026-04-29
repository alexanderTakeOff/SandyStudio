// ──────────────────────────────────────────────────────────────────────────────
// app/api/jobs/route.ts
// Jobs list. Filters: episode_id, agent_id, status. Cursor pagination.
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
  agent_id:   z.string().optional(),
  status:     z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT']).optional(),
  cursor:     z.string().optional(),
  limit:      z.coerce.number().int().positive().max(200).optional().default(50),
});

export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireDirector();
  const q = parseSearchParams(req.url, ListQuery);

  let query = supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(q.limit);
  if (q.episode_id) query = query.eq('episode_id', q.episode_id);
  if (q.agent_id)   query = query.eq('agent_id', q.agent_id);
  if (q.status)     query = query.eq('status', q.status);
  if (q.cursor)     query = query.lt('created_at', q.cursor);

  const { data, error } = await query;
  if (error) throw new Error(`jobs list failed: ${error.message}`);
  const rows = data ?? [];
  const nextCursor = rows.length === q.limit ? rows[rows.length - 1]!.created_at : null;
  return apiOk(rows, { cursor: nextCursor, limit: q.limit });
});
