// ──────────────────────────────────────────────────────────────────────────────
// app/api/series/route.ts
// Series CRUD (list + create). Update/delete deferred to Phase 7.
// Per onboarding.md §5 + webapp.md §5.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk, apiCreated } from '@/lib/api/response';
import { parseJson, parseSearchParams } from '@/lib/api/zod-helpers';
import { ConflictError } from '@/lib/api/errors';
import type { SeriesRow, AuthorityCategory, AuthorityApprover } from '@/lib/supabase/types-phase5b';
import { HARD_LOCKED_CATEGORIES } from '@/lib/supabase/types-phase5b';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ListQuery = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

const CreateBody = z.object({
  code: z
    .string()
    .regex(/^[A-Z]{2,6}[0-9]{0,2}$/, 'Series code must match ^[A-Z]{2,6}[0-9]{0,2}$'),
  title: z.string().min(1).max(80),
  audience: z.enum(['adult', 'kids', 'mixed', 'other']).optional(),
  genre: z.enum(['comedy', 'drama', 'doc', 'sci_fi', 'other']).optional(),
  logline: z.string().max(200).optional(),
  episode_budget_ceiling: z.number().positive().optional(),
});

export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireDirector();
  const q = parseSearchParams(req.url, ListQuery);

  let query = supabase
    .from('series')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(q.limit);
  if (q.status) query = query.eq('status', q.status);

  const { data, error } = await query;
  if (error) throw new Error(`series list failed: ${error.message}`);
  return apiOk(data as unknown as SeriesRow[], { total: (data ?? []).length });
});

export const POST = withApiHandler(async (req) => {
  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, CreateBody);

  // Insert series
  const insertPayload = {
    code: body.code,
    title: body.title,
    audience: body.audience ?? null,
    genre: body.genre ?? null,
    logline: body.logline ?? null,
    episode_budget_ceiling: body.episode_budget_ceiling ?? null,
    status: 'DRAFT' as const,
    created_by: user.id,
  };
  const { data: row, error: insErr } = await supabase
    .from('series')
    .insert(insertPayload as never)
    .select('*')
    .single();
  if (insErr) {
    if (insErr.code === '23505') {
      throw new ConflictError(`Series code ${body.code} already exists`);
    }
    throw new Error(`series insert failed: ${insErr.message}`);
  }

  // Seed default Approval Authority Matrix per onboarding.md §6.4
  const seriesRow = row as unknown as SeriesRow;
  const aamRows: Array<{
    series_id: string;
    category: AuthorityCategory;
    approver: AuthorityApprover;
    is_locked: boolean;
  }> = [
    { series_id: seriesRow.id, category: 'character_visual',  approver: 'director',     is_locked: true },
    { series_id: seriesRow.id, category: 'location_ref',      approver: 'director',     is_locked: true },
    { series_id: seriesRow.id, category: 'generated_shots',   approver: 'director',     is_locked: true },
    { series_id: seriesRow.id, category: 'thumbnail',         approver: 'director',     is_locked: true },
    { series_id: seriesRow.id, category: 'publish',           approver: 'director',     is_locked: true },
    { series_id: seriesRow.id, category: 'script',            approver: 'exec_dir_ai',  is_locked: false },
    { series_id: seriesRow.id, category: 'storyboard',        approver: 'exec_dir_ai',  is_locked: false },
    { series_id: seriesRow.id, category: 'music',             approver: 'exec_dir_ai',  is_locked: false },
    { series_id: seriesRow.id, category: 'metadata',          approver: 'exec_dir_ai',  is_locked: false },
  ];
  // Sanity: every hard-locked category must be set to director.
  for (const r of aamRows) {
    if (HARD_LOCKED_CATEGORIES.has(r.category) && r.approver !== 'director') {
      throw new Error(`Authority seed bug: ${r.category} must be director`);
    }
  }
  const { error: aamErr } = await supabase
    .from('approval_authority_matrix')
    .insert(aamRows as never);
  if (aamErr) {
    // Don't roll back the series — log and surface a warning. The matrix can
    // be re-seeded from /api/series/[id]/approval-matrix in Phase 7.
    await supabase.from('activity_events').insert({
      event_type: 'series_created',
      severity: 'warning',
      title: `Series ${body.code} created with partial authority matrix`,
      description: `Authority seed failed: ${aamErr.message}`,
      actor: user.id,
      metadata: { series_id: seriesRow.id },
    });
  }

  await supabase.from('activity_events').insert({
    event_type: 'series_created',
    severity: 'info',
    title: `Series ${body.code} "${body.title}" created`,
    description: `Created by ${user.email ?? user.id}`,
    actor: user.id,
    metadata: { series_id: seriesRow.id },
  });

  return apiCreated(seriesRow);
});
