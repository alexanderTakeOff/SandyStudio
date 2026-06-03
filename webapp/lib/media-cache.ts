// ──────────────────────────────────────────────────────────────────────────────
// lib/media-cache.ts
// Stable, worktree-independent local cache for asset media served to the UI.
//
// Why: preview media used to be served from each worktree's
// `webapp/public/staging/<file>` (shared via a symlink). Deleting a worktree
// destroyed that cache and broke every preview. Per CLAUDE.md §2 the studio
// repo (Tier 1) must be separate from film media — so the cache lives OUTSIDE
// any git worktree, under the gitignored Tier-2 `FILMS/` tree. Google Drive
// (`assets.drive_file_id`) remains the source of truth; this is a lazy local
// mirror populated on first view.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { downloadFile } from './agents/providers/drive';

/**
 * Cache root. Env-overridable per CLAUDE.md §11; defaults to the gitignored
 * `FILMS/_media_cache` tree so it survives worktree deletion and stays out of
 * the studio repo. Set `MEDIA_CACHE_DIR` in `.env.local` to relocate.
 */
const CACHE_ROOT = process.env.MEDIA_CACHE_DIR?.trim() || 'C:\\SandyStudio\\FILMS\\_media_cache';

export function mediaCacheRoot(): string {
  return CACHE_ROOT;
}

/** Sanitize a filename to a safe single path segment (no traversal). */
function safeName(filename: string): string {
  return path.basename(filename).replace(/[^A-Za-z0-9._-]/g, '_');
}

/**
 * Map a canonical SS filename to a flat, human-navigable per-episode cache
 * sub-path (Director directive 2026-06-02 — supersedes the 2026-06-01
 * raw/approved/<type> 3-tier mirror; the nesting hurt findability + cleanup):
 *
 *   <SEASON>/<EPISODE>/media/<filename>
 *   e.g. `SS-S15-E01-IMG-thumbnail-v03-APPROVED.png`
 *          → `S15/E01/media/SS-S15-E01-IMG-thumbnail-v03-APPROVED.png`
 *
 * Clear one episode's cache: delete `<root>/S15/E01/`. Clear everything: delete
 * the root. Status + media type live in the filename, so no extra nesting is
 * needed. Only IMG / VID / AUD assets carry binary media; other TYPEs return
 * `null` and the caller falls back to a flat key so the cache never fails on an
 * unexpected name.
 */
export function mirroredCachePath(filename: string): string | null {
  const base = path.basename(filename);
  const m = /^SS-(S\d+|PILOT)-(E\d+|PILOT)-(IMG|VID|AUD)-.+\.[A-Za-z0-9]+$/i.exec(base);
  if (!m) return null;
  const season = m[1].toUpperCase();
  const episode = m[2].toUpperCase();
  return path.join(season, episode, 'media', safeName(base));
}

/** Absolute cache path for a filename — where persist writes and the media route reads. */
export function localCacheAbsPath(filename: string): string {
  return path.join(CACHE_ROOT, mirroredCachePath(filename) ?? safeName(filename));
}

/**
 * Absolute path for a resized thumbnail of `filename`, sized to `width` px and
 * served as WebP. Mirrors the original-file layout but drops the rendered
 * thumbnails into a sibling `.thumb/` directory so they never collide with the
 * source bytes and an episode's thumbs can be cleared independently:
 *
 *   <root>/S15/E01/media/.thumb/SS-...-v03-APPROVED.png.w64.webp
 *
 * The original keying/behaviour (`localCacheAbsPath`) is untouched; this only
 * adds a derived-artifact path next to it. Width is baked into the name so
 * different requested sizes cache separately.
 */
export function thumbnailCacheAbsPath(filename: string, width: number): string {
  const orig = localCacheAbsPath(filename);
  const dir = path.join(path.dirname(orig), '.thumb');
  return path.join(dir, `${path.basename(orig)}.w${width}.webp`);
}

/**
 * Return the cached absolute path if the file already exists locally (no Drive
 * fetch). Lets the media route serve persist-warmed files — including mock /
 * local-only assets that have no `drive_file_id` — straight from the cache.
 */
export async function cachedFileIfPresent(filename: string): Promise<string | null> {
  const abs = localCacheAbsPath(filename);
  try {
    await fs.access(abs);
    return abs;
  } catch {
    return null;
  }
}

/**
 * Return the local absolute path for an asset's media, downloading it from
 * Drive into the stable cache on a miss. The cache path mirrors the Drive /
 * 3-tier folder structure (`<season>/e<NN>/<raw|approved>/<media>/<file>`) so
 * the cache is browsable and consistent with the canonical store; filenames
 * that don't match the SS convention fall back to a flat key under the root.
 */
export async function ensureCachedMedia(args: {
  filename: string;
  driveFileId: string;
}): Promise<string> {
  const abs = localCacheAbsPath(args.filename);
  try {
    await fs.access(abs);
    return abs; // cache hit
  } catch {
    // cache miss — fall through to download
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const bytes = Buffer.from(await downloadFile(args.driveFileId));
  await fs.writeFile(abs, bytes);
  return abs;
}

/**
 * Read an asset's image bytes as base64, resolving them the same way the
 * `/api/media` route serves previews — robust to the media-no-branches
 * migration (d1a58cf). Agents that need img2img reference bytes (scene_master,
 * continuity anchors, Bible identity/style refs) used to read a `/staging/<file>`
 * browser URL straight off the filesystem. That path lives inside a git
 * worktree and breaks when the worktree is deleted OR when the asset was
 * regenerated post-migration (its bytes go to the cache/Drive, not `/staging/`).
 *
 * Resolution order:
 *   1. Warm cache hit by canonical filename (covers persist-warmed + mock).
 *   2. Drive-backed: download into the cache, then read.
 *   3. Legacy `/staging/<file>` fallback (pre-migration files still on disk).
 *
 * Returns null when no readable bytes can be found — callers turn this into a
 * descriptive agent error.
 */
export async function readAssetMediaAsBase64(args: {
  filename?: string | null;
  driveFileId?: string | null;
  stagingPath?: string | null;
}): Promise<string | null> {
  if (args.filename) {
    const hit = await cachedFileIfPresent(args.filename);
    if (hit) return (await fs.readFile(hit)).toString('base64');
  }
  if (args.filename && args.driveFileId) {
    try {
      const abs = await ensureCachedMedia({ filename: args.filename, driveFileId: args.driveFileId });
      return (await fs.readFile(abs)).toString('base64');
    } catch {
      // fall through to legacy staging path
    }
  }
  // Legacy: bytes still sitting in a worktree's public/staging.
  if (args.stagingPath && args.stagingPath.startsWith('/staging/')) {
    const abs = path.join(process.cwd(), 'public', args.stagingPath.slice(1));
    try {
      return (await fs.readFile(abs)).toString('base64');
    } catch {
      return null;
    }
  }
  return null;
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
};

export function contentTypeForFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream';
}
