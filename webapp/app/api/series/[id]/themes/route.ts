// ──────────────────────────────────────────────────────────────────────────────
// app/api/series/[id]/themes/route.ts
// GET  — fetch the series' episode-themes bank (single THM-bank markdown asset).
// POST — create the bank doc (DRAFT) if it doesn't exist.
//
// Episode themes are a SEPARATE surface from the Series Bible. We store the bank
// as one series-scoped markdown asset.
//
// file_type = `SPC-theme_bank` (a series-level spec doc). Two reasons it is NOT a
// new `THM-*` prefix:
//   1. assets.file_type has a CHECK constraint (migration 0017) limited to
//      SCR|STB|IMG|VID|AUD|BIB|PRO|REV|SPC|STA|SBL — `THM` would be rejected at
//      insert. Reusing an allowed prefix avoids a schema migration.
//   2. `SPC-theme_bank` is NOT `SBL-%`, so the bank is invisible to the EREF
//      canon-gate (countLockedBibleSections / validateCanonExists filter `SBL-%`),
//      and it does not match the `SPC-shot_plan%` / `SPC-ref_plan%` pipeline
//      filters. Series-scoped (episode_id null) → episode loaders ignore it.
// The theme *entities* inside the content still carry `THEME-*` ids (Identifier
// Convention) — that is a separate layer from this storage file_type.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { buildProvenance, type AssetMetadataDoc } from '@/lib/api/series-bible';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Single bank doc per series; allowed prefix, outside the `SBL-%` bible namespace. */
const THEMES_FILE_TYPE = 'SPC-theme_bank';

const PostBody = z.object({
  content: z.string().max(200_000).optional(),
});

export const GET = withApiHandler(async (_req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const seriesId = params?.id;
  if (!seriesId) throw new NotFoundError('Series');

  const { supabase } = await requireDirector();

  const { data: series, error: serr } = await supabase
    .from('series')
    .select('id,code,title')
    .eq('id', seriesId)
    .maybeSingle();
  if (serr) throw new Error(`series fetch failed: ${serr.message}`);
  if (!series) throw new NotFoundError(`Series ${seriesId}`);

  const { data: assets, error } = await supabase
    .from('assets')
    .select('*')
    .eq('series_id', seriesId)
    .eq('file_type', THEMES_FILE_TYPE)
    .order('version', { ascending: false });
  if (error) throw new Error(`themes fetch failed: ${error.message}`);

  return apiOk({
    series: { id: series.id, code: series.code, title: series.title },
    assets: assets ?? [],
  });
});

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const seriesId = params?.id;
  if (!seriesId) throw new NotFoundError('Series');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, PostBody);

  const { data: series, error: serr } = await supabase
    .from('series')
    .select('id,code')
    .eq('id', seriesId)
    .maybeSingle();
  if (serr) throw new Error(`series fetch failed: ${serr.message}`);
  if (!series) throw new NotFoundError(`Series ${seriesId}`);

  // Same series + file_type → bump version (one logical bank, versioned).
  const { data: existing } = await supabase
    .from('assets')
    .select('version')
    .eq('series_id', seriesId)
    .eq('file_type', THEMES_FILE_TYPE);
  const nextVersion =
    (existing ?? []).reduce((max, row) => Math.max(max, row.version ?? 0), 0) + 1;

  const v = `v${String(nextVersion).padStart(2, '0')}`;
  const filename = `${series.code}-SPC-theme_bank_main-${v}-DRAFT.md`;

  // Provenance — Director-driven manual add (mirrors the Bible create path).
  const provenance = buildProvenance({
    by: user.email ?? user.id,
    byKind: 'director',
    source: 'manual_add',
  });
  const seedMeta: AssetMetadataDoc = { provenance };

  const { data: inserted, error: ierr } = await supabase
    .from('assets')
    .insert({
      series_id: seriesId,
      episode_id: null,
      file_type: THEMES_FILE_TYPE,
      filename,
      description: null,
      content: body.content ?? null,
      staging_path: null,
      drive_file_id: null,
      drive_web_view_url: null,
      drive_path: null,
      status: 'DRAFT',
      version: nextVersion,
      agent_id: 'Director',
      metadata: seedMeta as unknown as Record<string, unknown>,
    } as never)
    .select('*')
    .single();

  if (ierr) {
    if (ierr.code === '23514') {
      throw new ValidationError(
        'Themes asset must have series_id and no episode_id (constraint violation).',
      );
    }
    throw new Error(`themes insert failed: ${ierr.message}`);
  }

  await supabase.from('activity_events').insert({
    event_type: 'asset_created',
    severity: 'info',
    title: `Themes: created ${filename}`,
    description: `Director ${user.email ?? user.id} created the episode-themes bank`,
    actor: user.id,
    asset_id: inserted.id,
    episode_id: null,
    metadata: { kind: 'themes_create' },
  } as never);

  return apiOk(inserted);
});
