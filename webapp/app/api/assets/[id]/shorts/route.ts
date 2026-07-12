// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/shorts/route.ts
// "Video → Shorts" slicer. Director-initiated: take an approved (or any) final
// cut, center-crop it to 9:16 with an optional "SANDY the HOURGLASS" overlay and
// an optional start/end trim, then upload it to YouTube at the chosen privacy.
//
// Reuses the SAME server-side ffmpeg helper as the batch (`makeShort`) and the
// SAME upload path as EXEC-PUB (`uploadVideo`) — no parallel machinery. Runs
// synchronously in the Node runtime (self-hosted `next start` has no serverless
// timeout); a short encode + upload is ~1–2 min.
//
// Companion to the deferred UI backlog `backlog_shorts_ui_slicer` and the batch
// script `scripts/dist-shorts.ts`.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { ensureCachedMedia, cachedFileIfPresent, mediaCacheRoot } from '@/lib/media-cache';
import { makeShort } from '@/lib/agents/providers/ffmpeg-shorts';
import { uploadVideo } from '@/lib/agents/providers/youtube';
import { parseVideoMetadata } from '@/lib/agents/publish-metadata';
import { appendParentBacklink, readParentVideoId, persistShortId } from '@/lib/agents/providers/short-linkage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_OVERLAY = 'SANDY the HOURGLASS';
const DEFAULT_DESCRIPTION =
  '⏳ Sandy the Hourglass — silent physical comedy. Life is short. Flip yourself. #Shorts';

const ShortsBody = z
  .object({
    startSec: z.number().min(0).optional(),
    endSec: z.number().min(0).optional(),
    overlay: z.boolean().default(true),
    overlayText: z.string().max(120).optional(),
    privacyStatus: z.enum(['private', 'unlisted', 'public']).default('unlisted'),
  })
  .refine((b) => b.endSec == null || b.startSec == null || b.endSec > b.startSec, {
    message: 'endSec must be greater than startSec',
    path: ['endSec'],
  });

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Asset');

  const { supabase } = await requireDirector();
  const body = await parseJson(req, ShortsBody);

  // 1. Resolve the source final-cut asset.
  const { data: asset, error: aerr } = await supabase
    .from('assets')
    .select('id, filename, file_type, drive_file_id, episode_id')
    .eq('id', id)
    .maybeSingle();
  if (aerr) throw new Error(`asset fetch failed: ${aerr.message}`);
  if (!asset) throw new NotFoundError(`Asset ${id}`);
  if (!/^VID-/.test(asset.file_type)) {
    throw new ValidationError(`Shorts can only be made from a VID asset (got ${asset.file_type})`);
  }

  // 2. Get the mp4 onto local disk for ffmpeg (cache hit, else Drive fetch).
  let srcPath: string | null = null;
  if (asset.drive_file_id) {
    srcPath = await ensureCachedMedia({ filename: asset.filename, driveFileId: asset.drive_file_id });
  } else {
    srcPath = await cachedFileIfPresent(asset.filename);
  }
  if (!srcPath) {
    throw new ValidationError('Source video bytes are not available locally or on Drive.');
  }

  // 3. Derive a YouTube title/description. Reuse the Publicist's SPC-metadata the
  //    same way EXEC-PUB does, so shorts titles match the landscape uploads;
  //    fall back to the episode title/code.
  let baseTitle = asset.filename.replace(/\.[^.]+$/, '');
  let description = DEFAULT_DESCRIPTION;
  if (asset.episode_id) {
    const { data: ep } = await supabase
      .from('episodes')
      .select('episode_code')
      .eq('id', asset.episode_id)
      .maybeSingle();
    if (ep?.episode_code) baseTitle = ep.episode_code;

    const { data: meta } = await supabase
      .from('assets')
      .select('content')
      .eq('episode_id', asset.episode_id)
      .eq('file_type', 'SPC-metadata')
      .eq('status', 'APPROVED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (meta?.content) {
      const parsed = parseVideoMetadata(meta.content, baseTitle);
      if (parsed.title) baseTitle = parsed.title;
      if (parsed.description) description = parsed.description;
    }

    // The funnel bridge: link this Short back to the parent episode's landscape
    // video. YouTube has no "related video" API field — the parent watch-URL in
    // the description is the only programmable bridge. No-op if not yet published.
    const parentVideoId = await readParentVideoId(supabase, asset.episode_id);
    description = appendParentBacklink(description, parentVideoId);
  }
  const title = `${baseTitle} #Shorts`.slice(0, 100);

  // 4. Render the short with the shared ffmpeg helper.
  const outDir = path.join(mediaCacheRoot(), '_shorts');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${path.basename(asset.filename).replace(/\.[^.]+$/, '')}-SHORT.mp4`);
  await makeShort(srcPath, outPath, {
    overlayText: body.overlay ? (body.overlayText?.trim() || DEFAULT_OVERLAY) : null,
    startSec: body.startSec ?? null,
    endSec: body.endSec ?? null,
  });

  // 5. Upload to YouTube at the chosen privacy.
  const bytes = new Uint8Array(await fs.readFile(outPath));
  const r = await uploadVideo({
    bytes,
    title,
    description,
    tags: ['Shorts', 'Sandy the Hourglass', 'animation', 'comedy'],
    privacyStatus: body.privacyStatus,
  });

  // Record the reverse Short→episode link (thin ledger in episodes.metadata).
  if (asset.episode_id) {
    await persistShortId(supabase, asset.episode_id, r.id, r.url);
  }

  return apiOk({
    videoId: r.id,
    url: r.url,
    title: r.title,
    privacyStatus: r.privacyStatus,
    localPath: outPath,
  });
});
