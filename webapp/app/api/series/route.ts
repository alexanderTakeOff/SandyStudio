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
import { withEffectiveStatus } from '@/lib/api/series-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ListQuery = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

const CreateBody = z.object({
  // Must match assets.filename CHECK pattern (^SS-(S\d{2}|PILOT)...). Without
  // the dash, the brief asset filename fails CHECK and episode is orphaned.
  code: z
    .string()
    .regex(/^SS-(S\d{2}|PILOT)$/, 'Series code must be SS-S01..SS-S99 or SS-PILOT'),
  title: z.string().min(1).max(80),
  audience: z.enum(['adult', 'kids', 'mixed', 'other']).optional(),
  genre: z.enum(['comedy', 'drama', 'doc', 'sci_fi', 'other']).optional(),
  logline: z.string().max(200).optional(),
  episode_budget_ceiling: z.number().positive().optional(),
  // Owning channel at birth (multi-channel Phase 2). Optional by design —
  // a series lives channel-less until publish/analytics need one.
  channel_id: z.string().uuid().optional(),
});

export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireDirector();
  const q = parseSearchParams(req.url, ListQuery);

  // Series ACTIVE is DERIVED from a LOCKED general_idea (lib/api/series-status) —
  // never stored. Fetch all, compute effective status, then filter on it; the
  // stored column only ever holds DRAFT or ARCHIVED.
  const { data, error } = await supabase
    .from('series' as never)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`series list failed: ${error.message}`);
  const rows = await withEffectiveStatus(supabase, (data as unknown as SeriesRow[]) ?? []);
  const filtered = (q.status ? rows.filter((r) => r.status === q.status) : rows).slice(0, q.limit);
  return apiOk(filtered as unknown as SeriesRow[], { total: filtered.length });
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
    channel_id: body.channel_id ?? null,
    status: 'DRAFT' as const,
    created_by: user.id,
  };
  const { data: row, error: insErr } = await supabase
    .from('series' as never)
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
    .from('approval_authority_matrix' as never)
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
      series_id: seriesRow.id,
      metadata: { series_id: seriesRow.id },
    } as never);
  }

  await supabase.from('activity_events').insert({
    event_type: 'series_created',
    severity: 'info',
    title: `Series ${body.code} "${body.title}" created`,
    description: `Created by ${user.email ?? user.id}`,
    actor: user.id,
    series_id: seriesRow.id,
    metadata: { series_id: seriesRow.id },
  } as never);

  return apiCreated(seriesRow);
});
