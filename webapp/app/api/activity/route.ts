// ──────────────────────────────────────────────────────────────────────────────
// app/api/activity/route.ts
// Global activity feed — Dashboard Zone 3 source.
// Per dashboard_cockpit.md §5.
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
  severity: z.enum(['info', 'warning', 'error']).optional(),
  event_type: z.string().optional(),
  // Backbone v2: caller can scope feed to a single asset (CanonExtensionsPanel)
  asset_id: z.string().uuid().optional(),
  type: z.string().optional(),       // alias for event_type
  unresolved: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireDirector();
  const q = parseSearchParams(req.url, ListQuery);

  let query = supabase
    .from('activity_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(q.limit);
  if (q.episode_id) query = query.eq('episode_id', q.episode_id);
  if (q.severity)   query = query.eq('severity', q.severity);
  if (q.asset_id)   query = query.eq('asset_id', q.asset_id);
  const evType = q.event_type ?? q.type;
  if (evType)       query = query.eq('event_type', evType);
  if (q.unresolved) query = query.is('resolved_at', null);
  if (q.cursor)     query = query.lt('created_at', q.cursor);

  const { data, error } = await query;
  if (error) throw new Error(`activity feed failed: ${error.message}`);

  const rows = data ?? [];
  const nextCursor = rows.length === q.limit ? rows[rows.length - 1]!.created_at : null;

  return apiOk(rows, { cursor: nextCursor, limit: q.limit });
});
