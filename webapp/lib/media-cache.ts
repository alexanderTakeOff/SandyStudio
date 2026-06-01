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
 * Return the local absolute path for an asset's media, downloading it from
 * Drive into the stable cache on a miss. The cache file is keyed by the asset
 * filename (which already encodes `SS-<S>-<E>-<TYPE>-…`), so it is human-readable
 * and collision-free across versions.
 */
export async function ensureCachedMedia(args: {
  filename: string;
  driveFileId: string;
}): Promise<string> {
  const abs = path.join(CACHE_ROOT, safeName(args.filename));
  try {
    await fs.access(abs);
    return abs; // cache hit
  } catch {
    // cache miss — fall through to download
  }
  await fs.mkdir(CACHE_ROOT, { recursive: true });
  const bytes = Buffer.from(await downloadFile(args.driveFileId));
  await fs.writeFile(abs, bytes);
  return abs;
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
