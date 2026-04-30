// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/content/route.ts
// Read/write the markdown body of a text asset. Backed by `assets.content`
// column (migration 0013) — not by the filesystem.
//
// Variant A decision (2026-04-30): markdown is editorial structured content,
// canonical in DB. Binary assets (image/video/audio) are NOT served here —
// they use staging_path / drive_file_id (Phase 8 step 10).
//
// Editability rule:
//   - Allowed when status ∈ { DRAFT, REVIEW, REVISION }
//   - Forbidden when status ∈ { APPROVED, LOCKED, REJECTED, NEEDS_HUMAN_TWEAK }
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEXT_FILE_TYPE_PREFIXES = ['SCR', 'STB', 'BIB', 'PRO', 'REV', 'SPC', 'STA'];
const EDITABLE_STATUSES: ReadonlySet<string> = new Set([
  'DRAFT',
  'REVIEW',
  'REVISION',
]);
const MAX_BYTES = 256 * 1024; // 256kb cap — script/storyboard markdown is usually < 20kb

const PutBody = z.object({
  content: z.string().max(MAX_BYTES, `Content exceeds ${MAX_BYTES} bytes cap`),
});

interface AssetRow {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  version: number | null;
  content: string | null;
  episode_id: string | null;
}

function isTextAsset(file_type: string): boolean {
  const code = file_type.split('-')[0] ?? '';
  return TEXT_FILE_TYPE_PREFIXES.includes(code);
}

async function loadAsset(
  supabase: Awaited<ReturnType<typeof requireDirector>>['supabase'],
  id: string,
): Promise<AssetRow> {
  const { data, error } = await supabase
    .from('assets')
    .select('id,filename,file_type,status,version,content,episode_id')
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

  if (!isTextAsset(asset.file_type)) {
    throw new ValidationError(
      `Content endpoint supports text assets only — ${asset.filename} (${asset.file_type}) is binary. Use the preview drawer instead.`,
    );
  }

  return apiOk({
    content: asset.content ?? '',
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

  if (!isTextAsset(asset.file_type)) {
    throw new ValidationError(
      `Content endpoint supports text assets only — ${asset.filename} is binary`,
    );
  }
  if (!EDITABLE_STATUSES.has(asset.status)) {
    throw new ValidationError(
      `Asset is ${asset.status} and cannot be edited. Request revision first.`,
    );
  }

  const sizeBytes = Buffer.byteLength(body.content, 'utf-8');
  const { error: updErr } = await supabase
    .from('assets')
    .update({ content: body.content } as never)
    .eq('id', id);
  if (updErr) throw new Error(`asset content update failed: ${updErr.message}`);

  await supabase.from('activity_events').insert({
    event_type: 'asset_updated',
    severity: 'info',
    title: `Asset ${asset.filename} content edited`,
    description: `Director ${user.email ?? user.id} saved edits (${sizeBytes} bytes)`,
    actor: user.id,
    asset_id: id,
    episode_id: asset.episode_id,
    metadata: { kind: 'content_edit', size_bytes: sizeBytes },
  } as never);

  return apiOk({
    asset_id: id,
    size_bytes: sizeBytes,
    saved_at: new Date().toISOString(),
  });
});
