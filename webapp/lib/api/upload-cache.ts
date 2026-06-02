// ──────────────────────────────────────────────────────────────────────────────
// lib/api/upload-cache.ts
// Shared helper for the Director-upload routes (upload, upload-music,
// upload-music-direct). Derives the cache filename used when a Director-uploaded
// binary is written into the worktree-independent media cache (lib/media-cache)
// instead of webapp/public/staging/ (Director directive 2026-06-02 — no media
// in branches).
//
// The cache filename is the asset's canonical SS filename base, suffixed with a
// content hash and the uploaded extension:
//   SS-S15-E01-IMG-thumbnail-v03-APPROVED + "a1b2…" + ".png"
//     → SS-S15-E01-IMG-thumbnail-v03-APPROVED-a1b2c3d4e5f6a7b8.png
//
// Keeping the canonical SS prefix lets media-cache's mirroredCachePath() route
// the file into the navigable <SEASON>/<EPISODE>/media/ tree; the hash suffix
// keeps re-uploads from colliding and matches the old hash-of-bytes uniqueness.
// If the asset filename is unusable, we fall back to the bare hash name (which
// media-cache stores flat under the cache root — still served correctly).
// ──────────────────────────────────────────────────────────────────────────────

import path from 'node:path';

/**
 * Build the cache filename for a Director-uploaded binary.
 *
 * @param assetFilename canonical SS filename of the target asset row
 * @param hash short content hash (hex) of the uploaded bytes
 * @param ext uploaded file extension (no leading dot), e.g. 'png' | 'mp3'
 */
export function uploadCacheFilename(assetFilename: string | null | undefined, hash: string, ext: string): string {
  const base = (assetFilename ?? '').trim();
  if (!base) return `${hash}.${ext}`;
  // Strip any existing extension from the canonical filename so the served
  // file carries the uploaded media's real extension (an .md/.png asset row
  // may receive an uploaded .mp3, etc.).
  const stem = base.replace(/\.[A-Za-z0-9]+$/, '');
  return `${stem}-${hash}.${ext}`;
}

/** Re-exported for callers that only need basename safety in tests. */
export function uploadCacheBasename(filename: string): string {
  return path.basename(filename);
}
