// ──────────────────────────────────────────────────────────────────────────────
// app/api/series/bible-suggestions/route.ts
// Cross-series Bible suggestions for the Add-asset modal's name combobox.
// Returns LOCKED canonical assets across all series the Director has access
// to (in MVP — single-Director auth — that's all series).
//
// Query: ?section=character|location|object|style
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SectionSchema = z.enum(['character', 'location', 'object', 'style']);

interface AssetWithSeries {
  filename: string;
  file_type: string;
  description: string | null;
  drive_file_id: string | null;
  drive_web_view_url: string | null;
  drive_path: string | null;
  staging_path: string | null;
  series_id: string | null;
}

export const GET = withApiHandler(async (req) => {
  const url = new URL(req.url);
  const sectionRaw = url.searchParams.get('section') ?? '';
  const parsed = SectionSchema.safeParse(sectionRaw);
  if (!parsed.success) {
    throw new ValidationError(
      `Invalid section: ${sectionRaw}. Allowed: character | location | object | style`,
    );
  }
  const section = parsed.data;

  const { supabase } = await requireDirector();

  // Pull LOCKED Bible assets for this section across all series.
  const { data, error } = await supabase
    .from('assets')
    .select('filename,file_type,description,drive_file_id,drive_web_view_url,drive_path,staging_path,series_id')
    .eq('status', 'LOCKED')
    .like('file_type', `SBL-${section}%`)
    .order('filename', { ascending: true })
    .limit(40);

  if (error) {
    throw new Error(`bible-suggestions fetch: ${error.message}`);
  }

  const rows = (data ?? []) as AssetWithSeries[];
  const seriesIds = Array.from(
    new Set(rows.map((r) => r.series_id).filter((s): s is string => Boolean(s))),
  );

  // Look up series codes in one go.
  const seriesMap = new Map<string, string>();
  if (seriesIds.length > 0) {
    const { data: seriesRows } = await supabase
      .from('series')
      .select('id,code')
      .in('id', seriesIds);
    for (const s of seriesRows ?? []) {
      seriesMap.set(s.id as string, s.code as string);
    }
  }

  return apiOk(
    rows.map((r) => ({
      filename: r.filename,
      description: r.description,
      series_code: r.series_id ? seriesMap.get(r.series_id) ?? null : null,
      preview_url: r.staging_path || r.drive_web_view_url || r.drive_path,
      drive_file_id: r.drive_file_id,
    })),
  );
});
