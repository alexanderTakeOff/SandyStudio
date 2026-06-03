// ──────────────────────────────────────────────────────────────────────────────
// app/api/media/[id]/route.ts
// Stable media serving for asset previews. Replaces the fragile `/staging/<file>`
// path (which lived inside a git worktree and broke when a worktree was deleted).
// Streams bytes from the worktree-independent local cache (lib/media-cache.ts),
// downloading from Google Drive on a miss.
//
// The `[id]` param is EITHER an asset UUID (used by the UI display resolvers,
// which have the asset row) OR a canonical SS filename (used by persist-binary's
// `browserUrl`, emitted before the asset row exists). A filename carries a file
// extension; an id does not. Persist-warmed cache files are served directly —
// which also covers mock / local-only assets that have no `drive_file_id`.
//
// Thumbnail mode (`?w=<px>` or `?thumb=1`): grid tiles request a small WebP so
// the gallery doesn't ship full-resolution PNGs into a 32px box. The resized
// WebP is cached on disk under a `.thumb/` sibling dir and reused. Any sharp
// failure falls back to serving the original — a tile must never 500.
//
// Read-only and ungated: previews must load for any authenticated UI session, so
// this uses the service-role client to look up the asset.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  ensureCachedMedia,
  contentTypeForFilename,
  cachedFileIfPresent,
  thumbnailCacheAbsPath,
} from '@/lib/media-cache';

// Default thumbnail width when `?thumb=1` is passed without an explicit `?w=`.
// Tiles render at ~32px (1× / 2× DPR ⇒ 64px is crisp without shipping full-res).
const DEFAULT_THUMB_WIDTH = 64;
// Clamp requested widths to a sane band so a hostile/typo query can't ask sharp
// to render a 50000px "thumbnail".
const MIN_THUMB_WIDTH = 16;
const MAX_THUMB_WIDTH = 512;

// A canonical SS filename carries a `-v<NN>-` version token, so its bytes are
// immutable for that name — safe to cache for a year. Anything else gets a short
// revalidating TTL.
const VERSION_TOKEN = /-v\d+-/i;
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
const REVALIDATE_CACHE = 'public, max-age=3600';

function cacheControlForFilename(filename: string): string {
  return VERSION_TOKEN.test(filename) ? IMMUTABLE_CACHE : REVALIDATE_CACHE;
}

/** Weak-ish strong ETag from identity bytes (filename + size + mtime). */
function etagFor(filename: string, size: number, mtimeMs: number): string {
  const hash = createHash('sha1')
    .update(`${filename}:${size}:${Math.round(mtimeMs)}`)
    .digest('hex')
    .slice(0, 16);
  return `"${hash}"`;
}

/**
 * Build a 200 (or 304) response for a file on disk. Adds an ETag + strong
 * cache-control so conditional GETs can short-circuit. `contentType` overrides
 * the filename-derived type (used when serving a WebP thumbnail of a PNG).
 */
async function serveFile(
  abs: string,
  filename: string,
  req: Request,
  contentType?: string,
): Promise<Response> {
  const stat = await fs.stat(abs);
  const etag = etagFor(abs, stat.size, stat.mtimeMs);
  const cacheControl = cacheControlForFilename(filename);

  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: { etag, 'cache-control': cacheControl },
    });
  }

  const bytes = await fs.readFile(abs);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'content-type': contentType ?? contentTypeForFilename(filename),
      'cache-control': cacheControl,
      etag,
    },
  });
}

/** Parse the requested thumbnail width, or null when full-res is wanted. */
function requestedThumbWidth(url: URL): number | null {
  const w = url.searchParams.get('w');
  if (w != null) {
    const n = Number.parseInt(w, 10);
    if (Number.isFinite(n) && n > 0) {
      return Math.min(MAX_THUMB_WIDTH, Math.max(MIN_THUMB_WIDTH, n));
    }
    return null;
  }
  if (url.searchParams.get('thumb') === '1') return DEFAULT_THUMB_WIDTH;
  return null;
}

/**
 * Serve a resized WebP thumbnail for `origAbs`, caching it on disk. On ANY
 * failure (unsupported source, sharp error, disk error) fall back to serving
 * the original full-res file so a tile is never broken by the thumbnail path.
 */
async function serveThumbnail(
  origAbs: string,
  filename: string,
  width: number,
  req: Request,
): Promise<Response> {
  const thumbAbs = thumbnailCacheAbsPath(filename, width);
  try {
    const cached = await cachedThumbIfPresent(thumbAbs);
    if (cached) return serveFile(thumbAbs, filename, req, 'image/webp');

    const resized = await sharp(origAbs)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    await fs.mkdir(path.dirname(thumbAbs), { recursive: true });
    await fs.writeFile(thumbAbs, resized);
    return serveFile(thumbAbs, filename, req, 'image/webp');
  } catch {
    // Thumbnail generation must never break the tile — serve the original.
    return serveFile(origAbs, filename, req);
  }
}

async function cachedThumbIfPresent(thumbAbs: string): Promise<boolean> {
  try {
    await fs.access(thumbAbs);
    return true;
  } catch {
    return false;
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!id) return new Response('missing id', { status: 400 });
  const param = decodeURIComponent(id);
  const isFilename = /\.[A-Za-z0-9]+$/.test(param);
  const thumbWidth = requestedThumbWidth(new URL(req.url));

  // Serve a file either as a thumbnail (when requested + image) or full-res.
  const serve = (abs: string, fname: string): Promise<Response> =>
    thumbWidth != null && contentTypeForFilename(fname).startsWith('image/')
      ? serveThumbnail(abs, fname, thumbWidth, req)
      : serveFile(abs, fname, req);

  const supabase = createSupabaseServiceRoleClient();
  let filename: string | null = null;
  let driveFileId: string | null = null;

  if (isFilename) {
    filename = param;
    // Persist-warmed cache hit — serves immediately, including mock/local-only
    // assets with no Drive id.
    const hit = await cachedFileIfPresent(filename);
    if (hit) return serve(hit, filename);
    const { data } = await supabase
      .from('assets')
      .select('drive_file_id')
      .eq('filename', filename)
      .maybeSingle();
    driveFileId = (data as { drive_file_id?: string | null } | null)?.drive_file_id ?? null;
  } else {
    const { data, error } = await supabase
      .from('assets')
      .select('filename,drive_file_id')
      .eq('id', param)
      .maybeSingle();
    if (error) return new Response(`lookup failed: ${error.message}`, { status: 500 });
    const row = data as { filename?: string; drive_file_id?: string | null } | null;
    filename = row?.filename ?? null;
    driveFileId = row?.drive_file_id ?? null;
  }

  if (!filename) return new Response('asset not found', { status: 404 });
  // Even on the id path, prefer a warm cache hit over a Drive round-trip.
  const warm = await cachedFileIfPresent(filename);
  if (warm) return serve(warm, filename);
  if (!driveFileId) return new Response('no Drive-backed media for this asset', { status: 404 });

  let abs: string;
  try {
    abs = await ensureCachedMedia({ filename, driveFileId });
  } catch (e) {
    return new Response(`media fetch failed: ${(e as Error).message}`, { status: 502 });
  }
  return serve(abs, filename);
}
