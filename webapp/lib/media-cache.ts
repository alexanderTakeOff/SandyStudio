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

/** Media tier a SS asset TYPE code maps to (CLAUDE.md §2 Tier-3 layout). */
const MEDIA_DIR_BY_TYPE: Readonly<Record<string, 'video' | 'images' | 'audio'>> =
  Object.freeze({ VID: 'video', IMG: 'images', AUD: 'audio' });

/**
 * Map a canonical SS filename to the Drive-mirrored cache sub-path
 * (Director directive 2026-06-01 — findability + 3-tier §2 consistency):
 *
 *   <season>/e<NN>/<raw|approved>/<images|video|audio>/<safe filename>
 *
 * e.g. `SS-S15-E01-IMG-thumbnail-v03-APPROVED.png`
 *        → `S15/e01/approved/images/SS-S15-E01-IMG-thumbnail-v03-APPROVED.png`
 *
 * Only IMG / VID / AUD assets carry binary media; other TYPEs (text artifacts)
 * never reach this cache. `raw` vs `approved` follows the filename STATUS tail
 * (APPROVED / LOCKED → approved, everything else → raw). Returns `null` when the
 * filename does not match the SS convention — caller falls back to a flat key
 * so the cache never fails on an unexpected name.
 */
export function mirroredCachePath(filename: string): string | null {
  const base = path.basename(filename);
  const m = /^SS-(S\d+|PILOT)-(E\d+|PILOT)-(IMG|VID|AUD)-.+?(?:-(DRAFT|REVIEW|REVISION|APPROVED|LOCKED))?\.[A-Za-z0-9]+$/i.exec(
    base,
  );
  if (!m) return null;
  const season = m[1].toUpperCase();
  const episodeRaw = m[2].toUpperCase();
  const type = m[3].toUpperCase();
  const status = (m[4] ?? 'DRAFT').toUpperCase();
  const mediaDir = MEDIA_DIR_BY_TYPE[type];
  if (!mediaDir) return null;
  const episodeDir = episodeRaw === 'PILOT' ? 'pilot' : `e${episodeRaw.slice(1)}`;
  const tier = status === 'APPROVED' || status === 'LOCKED' ? 'approved' : 'raw';
  return path.join(season, episodeDir, tier, mediaDir, safeName(base));
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
  const rel = mirroredCachePath(args.filename) ?? safeName(args.filename);
  const abs = path.join(CACHE_ROOT, rel);
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
