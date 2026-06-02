// ──────────────────────────────────────────────────────────────────────────────
// app/api/media/[id]/route.ts
// Stable, Drive-backed media serving for asset previews. Replaces the fragile
// `/staging/<file>` path (which lived inside a git worktree and broke when a
// worktree was deleted). Streams bytes from the worktree-independent local
// cache (lib/media-cache.ts), downloading from Google Drive on a miss.
//
// Read-only and ungated: previews must load for any authenticated UI session,
// so this uses the service-role client to look up the asset by id. It only
// ever serves binary media that already has a drive_file_id.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { ensureCachedMedia, contentTypeForFilename } from '@/lib/media-cache';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!id) return new Response('missing id', { status: 400 });

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('assets')
    .select('filename,drive_file_id')
    .eq('id', id)
    .maybeSingle();

  if (error) return new Response(`lookup failed: ${error.message}`, { status: 500 });
  const row = data as { filename?: string; drive_file_id?: string | null } | null;
  if (!row || !row.drive_file_id || !row.filename) {
    return new Response('no Drive-backed media for this asset', { status: 404 });
  }

  let abs: string;
  try {
    abs = await ensureCachedMedia({ filename: row.filename, driveFileId: row.drive_file_id });
  } catch (e) {
    return new Response(`media fetch failed: ${(e as Error).message}`, { status: 502 });
  }

  const bytes = await fs.readFile(abs);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'content-type': contentTypeForFilename(row.filename),
      'cache-control': 'public, max-age=3600',
    },
  });
}
