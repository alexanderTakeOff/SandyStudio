// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/shorts/route.ts
// "Video → Shorts" slicer — TWO explicit steps, never one auto-upload.
//
//   action: 'generate' ([id] = source VID-final_cut) — the "Cut a short" step
//     Center-crop the widescreen final cut to 9:16 (+ optional overlay / trim),
//     then MATERIALIZE it as a `VID-short` asset (status REVIEW) via persistBinary
//     — it appears in the episode with a player. NOTHING is uploaded.
//
//   action: 'upload'   ([id] = the VID-short asset) — the "Upload short" step
//     Take the previewed short and upload it to the Shorts channel at the chosen
//     privacy. Records the id on the short asset AND appends to the episode's
//     durable short-ledger list.
//
// Why the split (2026-07-24, E15 «Автомойка» incident): the old single POST did
// makeShort + uploadVideo in one shot, so a 2s broken re-cut flew straight to the
// channel unlisted with no preview and was never saved anywhere. Now the cut is a
// visible VID-short asset and the upload is a separate click — the preview between
// them is the check that a broken cut can't reach the channel unseen. This is the
// MANUAL repurposing tool; auto-distribution of shorts-configured episodes is a
// different path (EXEC-PUB publishes their final cut on approval) and is untouched.
//
// Reuses the SAME server helpers as the batch — `makeShort` (ffmpeg-shorts),
// `persistBinary` (cache + Drive backup), `uploadVideo` (EXEC-PUB path) — no
// parallel machinery. Runs synchronously in the Node runtime (self-hosted
// `next start` has no serverless timeout).
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
import { persistBinary } from '@/lib/agents/persist-binary';
import { parseVideoMetadata } from '@/lib/agents/publish-metadata';
import { loadShortBrandingForEpisode } from '@/lib/agents/branding';
import {
  assertChannelIdentity,
  decideYouTubePathway,
  publishDefaultsOf,
} from '@/lib/agents/providers/channel-resolver';
import {
  appendParentBacklink,
  readParentVideoId,
  persistShortId,
  resolveSeriesPlaylistId,
  recutWindowMarker,
} from '@/lib/agents/providers/short-linkage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Overlay/description/tags defaults now come from data, not code:
// series/channels.metadata.branding via lib/agents/branding.ts (multi-channel
// Phase 2; Sandy's former literals are seeded there by migration 0050).

const ShortsBody = z
  .object({
    // Two explicit steps — default 'generate' so an old caller can't upload.
    action: z.enum(['generate', 'upload']).default('generate'),
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

type ShortsInput = z.infer<typeof ShortsBody>;

type AssetRow = {
  id: string;
  filename: string;
  file_type: string;
  status: string | null;
  drive_file_id: string | null;
  episode_id: string | null;
  metadata: Record<string, unknown> | null;
};

/** Resolve local mp4 bytes for an asset (warm cache, else Drive fetch). */
async function resolveSrcPath(asset: Pick<AssetRow, 'filename' | 'drive_file_id'>): Promise<string> {
  const srcPath = asset.drive_file_id
    ? await ensureCachedMedia({ filename: asset.filename, driveFileId: asset.drive_file_id })
    : await cachedFileIfPresent(asset.filename);
  if (!srcPath) {
    throw new ValidationError('Source video bytes are not available locally or on Drive.');
  }
  return srcPath;
}

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Asset');

  const { supabase } = await requireDirector();
  const body = await parseJson(req, ShortsBody);

  const { data: asset, error: aerr } = await supabase
    .from('assets')
    .select('id, filename, file_type, status, drive_file_id, episode_id, metadata')
    .eq('id', id)
    .maybeSingle();
  if (aerr) throw new Error(`asset fetch failed: ${aerr.message}`);
  if (!asset) throw new NotFoundError(`Asset ${id}`);

  return body.action === 'upload'
    ? handleUpload(supabase, asset as AssetRow, body)
    : handleGenerate(supabase, asset as AssetRow, body);
});

// ── GENERATE — render the short and store it as a VID-short asset (no upload) ──
async function handleGenerate(
  supabase: Awaited<ReturnType<typeof requireDirector>>['supabase'],
  asset: AssetRow,
  body: ShortsInput,
) {
  if (!/^VID-/.test(asset.file_type)) {
    throw new ValidationError(`Shorts can only be made from a VID asset (got ${asset.file_type})`);
  }
  // A short of a short is never what's wanted — the source is a full cut.
  if (asset.file_type.startsWith('VID-short')) {
    throw new ValidationError('Pick a final cut as the source, not another short.');
  }

  const srcPath = await resolveSrcPath(asset);

  // Channel/series branding defaults (overlay, description, tags) — data, not code.
  const branding = await loadShortBrandingForEpisode(supabase, asset.episode_id);

  // Derive a YouTube title/description now (stored on the short) so the upload
  // step re-derives nothing. Reuse the Publicist's SPC-metadata like EXEC-PUB.
  let baseTitle = asset.filename.replace(/\.[^.]+$/, '');
  let description = branding.description;
  let tags = branding.tags;
  let episodeCode: string | null = null;
  if (asset.episode_id) {
    const { data: ep } = await supabase
      .from('episodes')
      .select('episode_code')
      .eq('id', asset.episode_id)
      .maybeSingle();
    if (ep?.episode_code) {
      baseTitle = ep.episode_code;
      episodeCode = ep.episode_code;
    }

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
      if (parsed.tags.length > 0) tags = parsed.tags;
    }

    // Funnel bridge: link back to the parent episode's landscape video (no-op
    // until it's published). Baked into the stored description now.
    const parentVideoId = await readParentVideoId(supabase, asset.episode_id);
    const playlistId = await resolveSeriesPlaylistId(supabase, asset.episode_id);
    description = appendParentBacklink(description, parentVideoId, playlistId);
  }
  const title = `${baseTitle} #Shorts`.slice(0, 100);

  // Render with the shared ffmpeg helper into a scratch path.
  const outDir = path.join(mediaCacheRoot(), '_shorts');
  await fs.mkdir(outDir, { recursive: true });
  const scratch = path.join(
    outDir,
    `${path.basename(asset.filename).replace(/\.[^.]+$/, '')}-SHORT.mp4`,
  );
  await makeShort(srcPath, scratch, {
    overlayText: body.overlay ? (body.overlayText?.trim() || branding.overlayText) : null,
    startSec: body.startSec ?? null,
    endSec: body.endSec ?? null,
  });

  // Materialize as a VID-short asset (persistBinary → cache + Drive backup, then
  // an assets row mirroring the thumbnail-renderer pattern).
  const nextV = await nextShortVersion(supabase, asset.episode_id);
  const windowSlug =
    body.startSec != null || body.endSec != null
      ? recutWindowMarker(body.startSec ?? 0, body.endSec ?? 0).toLowerCase()
      : 'full';
  const base = episodeCode ?? asset.filename.replace(/\.[^.]+$/, '').slice(0, 40);
  const filename = `${base}-VID-short_${windowSlug}-v${String(nextV).padStart(2, '0')}-REVIEW.mp4`;

  const base64 = (await fs.readFile(scratch)).toString('base64');
  const persisted = await persistBinary({
    base64,
    ext: 'mp4',
    driveFilename: filename,
    localHint: `short-${asset.id.slice(-8)}-v${nextV}`,
    episodeCode: episodeCode ?? undefined,
    supabase,
  });

  const { data: inserted, error: ierr } = await supabase
    .from('assets')
    .insert({
      episode_id: asset.episode_id,
      series_id: null,
      agent_id: 'EXEC-PUB',
      file_type: 'VID-short',
      filename,
      description: `Short (9:16) from ${asset.filename} · window=${windowSlug} · ${
        body.overlay ? 'overlay' : 'no-overlay'
      }`,
      staging_path: persisted.browserUrl,
      drive_path: persisted.browserUrl,
      drive_file_id: persisted.driveFileId,
      drive_web_view_url: persisted.driveWebViewUrl,
      status: 'REVIEW',
      version: nextV,
      content: null,
      metadata: {
        source_asset_id: asset.id,
        start_sec: body.startSec ?? null,
        end_sec: body.endSec ?? null,
        overlay: body.overlay,
        overlay_text: body.overlay ? (body.overlayText?.trim() || branding.overlayText) : null,
        privacy_intent: body.privacyStatus,
        // Frozen at generate time so upload re-derives nothing.
        youtube_title: title,
        youtube_description: description,
        youtube_tags: tags,
        drive_upload_failed: persisted.driveUploadFailed,
      },
    } as never)
    .select('id')
    .single();
  if (ierr) throw new Error(`VID-short insert failed: ${ierr.message}`);

  return apiOk({
    shortAssetId: (inserted as { id: string }).id,
    filename,
    browserUrl: persisted.browserUrl,
    status: 'REVIEW',
  });
}

// ── UPLOAD — send an APPROVED VID-short to the channel ────────────────────────
async function handleUpload(
  supabase: Awaited<ReturnType<typeof requireDirector>>['supabase'],
  asset: AssetRow,
  body: ShortsInput,
) {
  if (asset.file_type !== 'VID-short') {
    throw new ValidationError(
      `Upload targets a VID-short asset (got ${asset.file_type}). Cut the short first.`,
    );
  }

  const meta = asset.metadata ?? {};
  // Branding fallback covers legacy shorts cut before youtube_* was frozen at
  // generate time (and the tags bug: parsed SPC tags used to be ignored here).
  const branding = await loadShortBrandingForEpisode(supabase, asset.episode_id);
  const title =
    typeof meta.youtube_title === 'string' && meta.youtube_title.trim()
      ? meta.youtube_title
      : `${asset.filename.replace(/\.[^.]+$/, '')} #Shorts`.slice(0, 100);
  const description =
    typeof meta.youtube_description === 'string' && meta.youtube_description.trim()
      ? meta.youtube_description
      : branding.description;
  const storedTags = Array.isArray(meta.youtube_tags)
    ? (meta.youtube_tags as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    : [];
  const tags = Array.from(new Set(['Shorts', ...(storedTags.length > 0 ? storedTags : branding.tags)]));
  // Body privacy overrides the stored intent if the Director changed it at upload.
  const privacyStatus =
    body.privacyStatus ??
    (typeof meta.privacy_intent === 'string'
      ? (meta.privacy_intent as 'private' | 'unlisted' | 'public')
      : 'unlisted');

  // Multi-channel gate (multi-channel.md §4/§5): the manual shorts upload used
  // to call uploadVideo with NO auth — i.e. the legacy global token — which
  // would silently drop a series-B short onto the Sandy channel. Resolve the
  // channel via the episode cascade and verify token identity, same as EXEC-PUB.
  if (!asset.episode_id) {
    throw new ValidationError('Short has no episode — cannot resolve its channel for upload.');
  }
  const pathway = await decideYouTubePathway(supabase, asset.episode_id);
  if (pathway.mode === 'mock') {
    throw new ValidationError(
      'No YouTube credentials configured — cannot upload. Provision the channel token first.',
    );
  }
  await assertChannelIdentity(pathway.passport, pathway.refreshToken);
  const ytAuth = { refreshToken: pathway.refreshToken };

  const srcPath = await resolveSrcPath(asset);
  const bytes = new Uint8Array(await fs.readFile(srcPath));
  const r = await uploadVideo(
    {
      bytes,
      title,
      description,
      tags,
      privacyStatus,
      ...publishDefaultsOf(pathway.passport),
    },
    ytAuth,
  );

  // Durable record: stamp the id on the short asset itself (never clobbered),
  // AND append to the episode's short-ledger list (A3 fix).
  const uploadedAt = new Date().toISOString();
  await supabase
    .from('assets')
    .update({
      metadata: {
        ...meta,
        youtube_video_id: r.id,
        youtube_url: r.url,
        youtube_privacy: r.privacyStatus,
        youtube_uploaded_at: uploadedAt,
      },
    } as never)
    .eq('id', asset.id);
  if (asset.episode_id) {
    await persistShortId(supabase, asset.episode_id, r.id, r.url);
  }

  return apiOk({
    videoId: r.id,
    url: r.url,
    title: r.title,
    privacyStatus: r.privacyStatus,
  });
}

/** Next version number for this episode's VID-short assets (1-based). */
async function nextShortVersion(
  supabase: Awaited<ReturnType<typeof requireDirector>>['supabase'],
  episodeId: string | null,
): Promise<number> {
  if (!episodeId) return 1;
  const { data } = await supabase
    .from('assets')
    .select('version')
    .eq('episode_id', episodeId)
    .eq('file_type', 'VID-short')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const latest = (data as { version?: number } | null)?.version ?? 0;
  return latest + 1;
}
