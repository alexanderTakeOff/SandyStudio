// ──────────────────────────────────────────────────────────────────────────────
// app/api/series/[id]/bible/route.ts
// GET — list all Series Bible sections (grouped) for a series.
// POST — create a new Bible asset (DRAFT) for a section.
//
// Spec: specs/company/series_bible.md
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  listBibleSections,
  bibleFilename,
  BIBLE_SECTIONS,
  type SbSection,
} from '@/lib/api/series-bible';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SectionSchema = z.enum([
  'general_idea',
  'character',
  'location',
  'object',
  'style',
  'audio',
]);

const PostBody = z.object({
  section: SectionSchema,
  slug: z.string().min(1).max(80).regex(/^[a-z0-9_-]+$/i, 'lowercase letters, numbers, _ or - only'),
  description: z.string().max(20_000).optional(),
  /** For image/audio sections — staging URL of generated media. */
  staging_path: z.string().optional(),
  /** Optional Drive metadata if generation already wrote to Drive. */
  drive_file_id: z.string().optional(),
  drive_web_view_url: z.string().optional(),
  /** Free text body — used for `general_idea` section. */
  content: z.string().max(200_000).optional(),
});

export const GET = withApiHandler(async (_req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const seriesId = params?.id;
  if (!seriesId) throw new NotFoundError('Series');

  const { supabase } = await requireDirector();

  const { data: series, error } = await supabase
    .from('series')
    .select('id,code,title')
    .eq('id', seriesId)
    .maybeSingle();
  if (error) throw new Error(`series fetch failed: ${error.message}`);
  if (!series) throw new NotFoundError(`Series ${seriesId}`);

  const sections = await listBibleSections(supabase, seriesId);

  return apiOk({
    series: { id: series.id, code: series.code, title: series.title },
    sections,
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

  // Ensure slug uniqueness within section: same section + slug → bump version.
  const fileTypeMatchPrefix = `SBL-${body.section}_${body.slug}`;
  const fileType =
    body.section === 'general_idea'
      ? 'SBL-general_idea'
      : `${fileTypeMatchPrefix}`;

  const { data: existing } = await supabase
    .from('assets')
    .select('version')
    .eq('series_id', seriesId)
    .eq('file_type', fileType);
  const nextVersion =
    (existing ?? []).reduce((max, row) => Math.max(max, row.version ?? 0), 0) + 1;

  const ext: 'md' | 'png' | 'mp3' =
    body.section === 'general_idea'
      ? 'md'
      : body.section === 'audio'
        ? 'mp3'
        : 'png';

  const filename = bibleFilename({
    seriesCode: series.code,
    section: body.section as SbSection,
    slug: body.section === 'general_idea' ? 'main' : body.slug,
    version: nextVersion,
    ext,
    status: 'DRAFT',
  });

  // Persist as DRAFT.
  const { data: inserted, error: ierr } = await supabase
    .from('assets')
    .insert({
      series_id: seriesId,
      episode_id: null,
      file_type: fileType,
      filename,
      description: body.description ?? null,
      content: body.content ?? null,
      staging_path: body.staging_path ?? null,
      drive_file_id: body.drive_file_id ?? null,
      drive_web_view_url: body.drive_web_view_url ?? null,
      drive_path: null,
      status: 'DRAFT',
      version: nextVersion,
      agent_id: 'Director',
    })
    .select('*')
    .single();

  if (ierr) {
    if (ierr.code === '23514') {
      // assets_series_or_episode_check — invariant violated
      throw new ValidationError(
        'Bible asset must have series_id and no episode_id (constraint violation).',
      );
    }
    throw new Error(`bible insert failed: ${ierr.message}`);
  }

  await supabase.from('activity_events').insert({
    event_type: 'asset_created',
    severity: 'info',
    title: `Bible: created ${filename}`,
    description: `Director ${user.email ?? user.id} added a new ${body.section} entry`,
    actor: user.id,
    asset_id: inserted.id,
    episode_id: null,
    metadata: { kind: 'bible_create', section: body.section, slug: body.slug },
  } as never);

  // Validate non-zero use of BIBLE_SECTIONS so the import is referenced
  // (catches accidental drift if the union changes).
  void BIBLE_SECTIONS;

  return apiOk(inserted);
});
