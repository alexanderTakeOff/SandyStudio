// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/content/route.ts
// Read/write the content of a markdown asset — used by the kebab "Edit"
// editor modal (Phase 5d step 2). Binary assets (images, video, audio) are
// not editable here — they'll surface in the preview drawer (step 3) read-only.
//
// Editability rule:
//   - Allowed when status ∈ { DRAFT, REVIEW, REVISION }
//   - Forbidden when status ∈ { APPROVED, LOCKED, REJECTED }
//
// File path comes from assets.staging_path. If absent, we fall back to a
// deterministic location under the configured project_root (handled later
// by Drive native in Phase 8 step 10 — for now: local fs only).
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml']);
const EDITABLE_STATUSES: ReadonlySet<string> = new Set([
  'DRAFT',
  'REVIEW',
  'REVISION',
]);
const MAX_BYTES = 256 * 1024; // 256kb cap — script/storyboard markdown is usually <20kb

const PutBody = z.object({
  content: z.string().max(MAX_BYTES, `Content exceeds ${MAX_BYTES} bytes cap`),
});

interface AssetRow {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  version: number | null;
  staging_path: string | null;
  episode_id: string | null;
}

function isTextExtension(filename: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

async function loadAsset(
  supabase: Awaited<ReturnType<typeof requireDirector>>['supabase'],
  id: string,
): Promise<AssetRow> {
  const { data, error } = await supabase
    .from('assets')
    .select('id,filename,file_type,status,version,staging_path,episode_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`asset fetch failed: ${error.message}`);
  if (!data) throw new NotFoundError(`Asset ${id}`);
  return data as AssetRow;
}

export const GET = withApiHandler(async (_req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Asset');

  const { supabase } = await requireDirector();
  const asset = await loadAsset(supabase, id);

  if (!isTextExtension(asset.filename)) {
    throw new ValidationError(
      `Content endpoint supports text files only — asset ${asset.filename} is binary`,
    );
  }
  if (!asset.staging_path) {
    throw new ValidationError(
      `Asset ${asset.filename} has no staging_path on disk yet`,
    );
  }

  let content = '';
  try {
    content = await fs.readFile(asset.staging_path, 'utf-8');
  } catch (err) {
    const msg = (err as NodeJS.ErrnoException).code === 'ENOENT'
      ? `File not found at ${asset.staging_path}`
      : `Read failed: ${(err as Error).message}`;
    throw new ValidationError(msg);
  }

  return apiOk({
    content,
    asset: {
      id: asset.id,
      filename: asset.filename,
      file_type: asset.file_type,
      status: asset.status,
      version: asset.version,
    },
    editable: EDITABLE_STATUSES.has(asset.status),
  });
});

export const PUT = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Asset');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, PutBody);
  const asset = await loadAsset(supabase, id);

  if (!isTextExtension(asset.filename)) {
    throw new ValidationError(
      `Content endpoint supports text files only — asset ${asset.filename} is binary`,
    );
  }
  if (!EDITABLE_STATUSES.has(asset.status)) {
    throw new ValidationError(
      `Asset is ${asset.status} and cannot be edited. Request revision first.`,
    );
  }
  if (!asset.staging_path) {
    throw new ValidationError(
      `Asset ${asset.filename} has no staging_path on disk`,
    );
  }

  try {
    await fs.writeFile(asset.staging_path, body.content, 'utf-8');
  } catch (err) {
    throw new Error(`Write failed: ${(err as Error).message}`);
  }

  const stat = await fs.stat(asset.staging_path);
  await supabase
    .from('assets')
    .update({ size_bytes: stat.size } as never)
    .eq('id', id);

  await supabase.from('activity_events').insert({
    event_type: 'asset_updated',
    severity: 'info',
    title: `Asset ${asset.filename} content edited`,
    description: `Director ${user.email ?? user.id} saved edits (${stat.size} bytes)`,
    actor: user.id,
    asset_id: id,
    episode_id: asset.episode_id,
    metadata: { kind: 'content_edit', size_bytes: stat.size },
  } as never);

  return apiOk({
    asset_id: id,
    size_bytes: stat.size,
    saved_at: new Date().toISOString(),
  });
});
