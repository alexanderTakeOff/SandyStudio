// ──────────────────────────────────────────────────────────────────────────────
// app/api/series/[id]/themes/route.ts
// Per-theme assets surface (q9a, 2026-06-30). Replaces the single-bank editor.
//
//   GET   — list this series' themes (one row per slug, with metadata.theme_status).
//   POST  — create ONE theme asset { slug, description, content }, theme_status='draft'.
//   PATCH — set metadata.theme_status (any→any) for a theme id — the curation move.
//
// Storage model + rationale live in lib/api/series-themes.ts. Each theme is its
// own `SPC-theme_{slug}` asset (allowed prefix → no migration; not `SBL-%` → out
// of every canon-gate). Curation status lives in metadata, NOT the asset status
// enum, so a status flip never renames the file.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  buildProvenance,
  stampLastModified,
  type AssetMetadataDoc,
  type AssetProvenance,
} from '@/lib/api/series-bible';
import {
  listSeriesThemes,
  themeFilename,
  themeSlugify,
  usedEpisodesFromMetadata,
  THEME_FILE_TYPE_PREFIX,
  THEME_STATUSES,
  type ThemeEpisodeRef,
  type ThemeStatus,
} from '@/lib/api/series-themes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function loadSeries(seriesId: string) {
  const { supabase, user } = await requireDirector();
  const { data: series, error } = await supabase
    .from('series')
    .select('id,code,title')
    .eq('id', seriesId)
    .maybeSingle();
  if (error) throw new Error(`series fetch failed: ${error.message}`);
  if (!series) throw new NotFoundError(`Series ${seriesId}`);
  return { supabase, series, user };
}

// ── GET — list themes ─────────────────────────────────────────────────────────

export const GET = withApiHandler(async (_req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const seriesId = params?.id;
  if (!seriesId) throw new NotFoundError('Series');

  const { supabase, series } = await loadSeries(seriesId);
  const themes = await listSeriesThemes(supabase, seriesId);

  return apiOk({
    series: { id: series.id, code: series.code, title: series.title },
    themes,
  });
});

// ── POST — create one theme ─────────────────────────────────────────────────

const PostBody = z.object({
  slug: z.string().min(1).max(80).optional(),
  description: z.string().max(2_000).optional(),
  content: z.string().max(200_000).optional(),
  theme_status: z.enum(['approved', 'draft', 'used', 'invalidated']).optional(),
});

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const seriesId = params?.id;
  if (!seriesId) throw new NotFoundError('Series');

  const { supabase, series, user } = await loadSeries(seriesId);
  const body = await parseJson(req, PostBody);

  // Slug derives from explicit arg, else the one-liner, else timestamp-free
  // fallback. Must be non-empty after normalisation.
  const rawSlug = body.slug ?? body.description ?? '';
  const slug = themeSlugify(rawSlug);
  if (!slug) {
    throw new ValidationError('A theme needs a slug or a one-liner description to derive one from.');
  }

  // One theme per slug — refuse to clobber an existing one (use PATCH/edit instead).
  const fileType = `${THEME_FILE_TYPE_PREFIX}${slug}`;
  const { data: clash } = await supabase
    .from('assets')
    .select('id')
    .eq('series_id', seriesId)
    .eq('file_type', fileType)
    .maybeSingle();
  if (clash) {
    throw new ValidationError(`Theme "${slug}" already exists for this series.`);
  }

  const themeStatus: ThemeStatus = body.theme_status ?? 'draft';
  const filename = themeFilename(series.code, slug);
  const provenance = buildProvenance({
    by: user.email ?? user.id,
    byKind: 'director',
    source: 'manual_add',
  });
  const seedMeta: AssetMetadataDoc = { provenance, theme_status: themeStatus };

  const { data: inserted, error: ierr } = await supabase
    .from('assets')
    .insert({
      series_id: seriesId,
      episode_id: null,
      file_type: fileType,
      filename,
      description: body.description ?? null,
      content: body.content ?? null,
      staging_path: null,
      drive_file_id: null,
      drive_web_view_url: null,
      drive_path: null,
      status: 'DRAFT',
      version: 1,
      agent_id: 'Director',
      metadata: seedMeta as unknown as Record<string, unknown>,
    } as never)
    .select('*')
    .single();

  if (ierr) {
    if (ierr.code === '23514') {
      throw new ValidationError(
        'Theme asset must have series_id and no episode_id (constraint violation).',
      );
    }
    throw new Error(`theme insert failed: ${ierr.message}`);
  }

  await supabase.from('activity_events').insert({
    event_type: 'asset_created',
    severity: 'info',
    title: `Theme: created ${slug}`,
    description: `Director ${user.email ?? user.id} created theme "${slug}" (${themeStatus})`,
    actor: user.id,
    asset_id: inserted.id,
    episode_id: null,
    series_id: seriesId,
    metadata: { kind: 'theme_create', slug, theme_status: themeStatus },
  } as never);

  return apiOk(inserted);
});

// ── PATCH — set theme_status (the curation move) ─────────────────────────────
//
// `episode_id` stamps which episode consumed the theme. It is APPENDED to
// metadata.used_in_episodes (a theme can run in more than one episode) and never
// cleared by a later status flip — the stamp is a fact, the status is curation.

const PatchBody = z.object({
  themeId: z.string().uuid(),
  theme_status: z.enum(['approved', 'draft', 'used', 'invalidated']),
  episode_id: z.string().uuid().optional(),
});

export const PATCH = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const seriesId = params?.id;
  if (!seriesId) throw new NotFoundError('Series');

  const { supabase, series, user } = await loadSeries(seriesId);
  const body = await parseJson(req, PatchBody);
  if (!THEME_STATUSES.includes(body.theme_status)) {
    throw new ValidationError(`theme_status must be one of ${THEME_STATUSES.join(' | ')}.`);
  }

  // Fetch the theme, scoped to this series (no cross-series PATCH).
  const { data: theme, error: terr } = await supabase
    .from('assets')
    .select('id, metadata, file_type, series_id')
    .eq('id', body.themeId)
    .eq('series_id', seriesId)
    .maybeSingle();
  if (terr) throw new Error(`theme fetch failed: ${terr.message}`);
  if (!theme || !theme.file_type.startsWith(THEME_FILE_TYPE_PREFIX)) {
    throw new NotFoundError(`Theme ${body.themeId} for series ${series.code}`);
  }

  // Resolve the episode stamp (if any) BEFORE writing: the episode must belong
  // to this series, and "In use" without an episode carries no information.
  const prevMeta = (theme.metadata ?? {}) as AssetMetadataDoc;
  const prevUsed = usedEpisodesFromMetadata(prevMeta);
  let nextUsed: ThemeEpisodeRef[] = prevUsed;

  if (body.episode_id) {
    const { data: episode, error: eerr } = await supabase
      .from('episodes')
      .select('id, episode_code, series_id')
      .eq('id', body.episode_id)
      .maybeSingle();
    if (eerr) throw new Error(`episode fetch failed: ${eerr.message}`);
    if (!episode || episode.series_id !== seriesId) {
      throw new ValidationError(`Episode ${body.episode_id} does not belong to series ${series.code}.`);
    }
    nextUsed = prevUsed.some((r) => r.id === episode.id)
      ? prevUsed
      : [...prevUsed, { id: episode.id, code: episode.episode_code }];
  }

  if (body.theme_status === 'used' && nextUsed.length === 0) {
    throw new ValidationError('Marking a theme "In use" needs the episode it went into.');
  }

  const prevProvenance = prevMeta.provenance;
  const nextProvenance: AssetProvenance | undefined = prevProvenance
    ? stampLastModified(prevProvenance, user.email ?? user.id, 'director')
    : undefined;
  const nextMeta: AssetMetadataDoc = {
    ...prevMeta,
    theme_status: body.theme_status,
    ...(nextUsed.length > 0 ? { used_in_episodes: nextUsed } : {}),
    ...(nextProvenance ? { provenance: nextProvenance } : {}),
  };

  const { data: updated, error: uerr } = await supabase
    .from('assets')
    .update({ metadata: nextMeta as unknown as Record<string, unknown> } as never)
    .eq('id', body.themeId)
    .select('*')
    .single();
  if (uerr) throw new Error(`theme status update failed: ${uerr.message}`);

  const stamp = nextUsed.length > 0 ? ` (in ${nextUsed.map((r) => r.code).join(', ')})` : '';
  await supabase.from('activity_events').insert({
    event_type: 'asset_updated',
    severity: 'info',
    title: `Theme: status → ${body.theme_status}`,
    description: `Director ${user.email ?? user.id} moved a theme to ${body.theme_status}${stamp}`,
    actor: user.id,
    asset_id: body.themeId,
    episode_id: body.episode_id ?? null,
    series_id: seriesId,
    metadata: {
      kind: 'theme_status_change',
      theme_status: body.theme_status,
      used_in_episodes: nextUsed,
    },
  } as never);

  return apiOk(updated);
});
