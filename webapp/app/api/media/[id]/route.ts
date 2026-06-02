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
// Read-only and ungated: previews must load for any authenticated UI session, so
// this uses the service-role client to look up the asset.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { ensureCachedMedia, contentTypeForFilename, cachedFileIfPresent } from '@/lib/media-cache';

async function serveFile(abs: string, filename: string): Promise<Response> {
  const bytes = await fs.readFile(abs);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'content-type': contentTypeForFilename(filename),
      'cache-control': 'public, max-age=3600',
    },
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!id) return new Response('missing id', { status: 400 });
  const param = decodeURIComponent(id);
  const isFilename = /\.[A-Za-z0-9]+$/.test(param);

  const supabase = createSupabaseServiceRoleClient();
  let filename: string | null = null;
  let driveFileId: string | null = null;

  if (isFilename) {
    filename = param;
    // Persist-warmed cache hit — serves immediately, including mock/local-only
    // assets with no Drive id.
    const hit = await cachedFileIfPresent(filename);
    if (hit) return serveFile(hit, filename);
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
  if (warm) return serveFile(warm, filename);
  if (!driveFileId) return new Response('no Drive-backed media for this asset', { status: 404 });

  let abs: string;
  try {
    abs = await ensureCachedMedia({ filename, driveFileId });
  } catch (e) {
    return new Response(`media fetch failed: ${(e as Error).message}`, { status: 502 });
  }
  return serveFile(abs, filename);
}
