// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/upload-image-direct/route.ts
//
// TD-20.B follow-up 2026-05-20 — Director requested a "Upload image manually"
// affordance for image asset previews (SBL-*, IMG-*). Sibling to the
// upload-music-direct route: writes the binary AS the asset's primary
// content, updates drive_path + staging_path so AssetPreview / Bible UI
// pick it up immediately. Use when Director has a hand-made reference
// (e.g. a final character ref exported from a design tool) and wants to
// skip gpt-image-2 generation entirely.
//
// Mode gate: Category C (UPLOAD_ASSET) — administrative, no spend.
// Refuses on LOCKED.
//
// Append to metadata.image_prompt.history as a 'director_upload' entry so
// the rollback ladder in /regenerate-image still works.
//
// Side effect: fires agent_completed via logEvent so Polina auto-reacts.
// ──────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { enforceMode } from '@/lib/governance';
import { logEvent } from '@/lib/api/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AssetRow {
  id: string;
  episode_id: string | null;
  filename: string;
  file_type: string;
  status: string;
  metadata: Record<string, unknown> | null;
}

const SUPPORTED_IMAGE = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/webp', 'webp'],
]);

const MAX_BYTES = 15 * 1024 * 1024; // 15MB cap

const IMAGE_FILE_TYPE_PREFIXES = ['SBL-', 'IMG-'];

async function resolveMode(
  sb: ReturnType<typeof createSupabaseServiceRoleClient>,
  asset: AssetRow,
): Promise<1 | 2 | 3 | 4> {
  if (asset.episode_id) {
    const { data } = await sb
      .from('episodes')
      .select('governance_mode')
      .eq('id', asset.episode_id)
      .maybeSingle();
    const mode = (data as { governance_mode?: number } | null)?.governance_mode;
    if (mode === 1 || mode === 2 || mode === 3 || mode === 4) return mode;
  }
  return 1;
}

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const assetId = params?.id;
  if (!assetId) throw new NotFoundError('Asset');

  const { user } = await requireDirector();
  const sb = createSupabaseServiceRoleClient();

  const { data: assetRaw, error } = await sb
    .from('assets')
    .select('id,episode_id,filename,file_type,status,metadata')
    .eq('id', assetId)
    .maybeSingle();
  if (error) throw new Error(`asset fetch: ${error.message}`);
  if (!assetRaw) throw new NotFoundError(`Asset ${assetId}`);
  const asset = assetRaw as unknown as AssetRow;

  if (asset.status === 'LOCKED') {
    throw new ValidationError('Asset is LOCKED — cannot replace image');
  }
  if (!IMAGE_FILE_TYPE_PREFIXES.some((p) => asset.file_type.startsWith(p))) {
    throw new ValidationError(
      `Direct image upload is only valid for image assets (SBL-*, IMG-*). Got ${asset.file_type}.`,
    );
  }

  const mode = await resolveMode(sb, asset);
  const decision = enforceMode(
    'UPLOAD_ASSET',
    { id: asset.episode_id ?? asset.id, governance_mode: mode },
    { directorConfirm: true, confirmedBy: user.email ?? user.id, actor: 'director' },
  );
  if (!decision.allowed) {
    return apiOk(
      { action_blocked: true, reason: decision.reason ?? 'Upload not allowed' },
      undefined,
      { status: 403 },
    );
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    throw new ValidationError("Missing 'file' field in multipart form data");
  }
  const blob = file as File;
  const mime = blob.type;
  const ext = SUPPORTED_IMAGE.get(mime);
  if (!ext) {
    throw new ValidationError(
      `Unsupported image MIME type: ${mime}. Supported: ${[...SUPPORTED_IMAGE.keys()].join(', ')}`,
    );
  }
  if (blob.size > MAX_BYTES) {
    throw new ValidationError(`File too large: ${blob.size} bytes; max ${MAX_BYTES}`);
  }

  const buf = Buffer.from(await blob.arrayBuffer());
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const dir = path.join(process.cwd(), 'public', 'staging', 'uploads');
  await fs.mkdir(dir, { recursive: true });
  const filename = `${hash}.${ext}`;
  const absolutePath = path.join(dir, filename);
  await fs.writeFile(absolutePath, buf);
  const browserUrl = `/staging/uploads/${filename}`;
  const originalFilename = blob.name ?? `upload.${ext}`;
  const nowIso = new Date().toISOString();

  const metaRaw = (asset.metadata ?? {}) as Record<string, unknown>;
  const existingPromptDoc = (metaRaw.image_prompt ?? null) as
    | { current_version?: number; style_anchor_asset_id?: string | null; history?: Array<Record<string, unknown>> }
    | null;
  const existingHistory = existingPromptDoc?.history ?? [];
  const nextVersion = (existingPromptDoc?.current_version ?? existingHistory.length) + 1;
  const newPromptEntry = {
    version: nextVersion,
    prompt: '[director_upload — no prompt]',
    source: 'director_upload',
    at: nowIso,
    cost_usd: 0,
    staging_path: browserUrl,
    drive_file_id: null,
    drive_web_view_url: null,
    width: null,
    height: null,
    original_filename: originalFilename,
    bytes: blob.size,
    mime,
  };

  const newMeta = {
    ...metaRaw,
    uploaded_by_director: true,
    uploaded_at: nowIso,
    original_filename: originalFilename,
    bytes: blob.size,
    mime,
    image_prompt: {
      current_version: nextVersion,
      style_anchor_asset_id: existingPromptDoc?.style_anchor_asset_id ?? null,
      history: [...existingHistory, newPromptEntry],
    },
  };

  const { error: updateErr } = await sb
    .from('assets')
    .update({
      drive_path: browserUrl,
      staging_path: absolutePath,
      drive_file_id: null,
      drive_web_view_url: null,
      metadata: newMeta as unknown as Record<string, unknown>,
    } as never)
    .eq('id', assetId);
  if (updateErr) {
    throw new Error(`asset update failed: ${updateErr.message}`);
  }

  // TD-20.B autonomy — Polina auto-reacts to the upload.
  await logEvent(sb, {
    event_type: 'agent_completed',
    severity: 'info',
    title: `Director uploaded image for ${asset.filename}`,
    description: `${originalFilename} (${Math.round(blob.size / 1024)}KB ${ext}) — direct image upload`,
    actor: 'EXEC-BIBLE-AUTHOR',
    asset_id: assetId,
    episode_id: asset.episode_id,
    metadata: {
      kind: 'image_direct_upload',
      drive_path: browserUrl,
      original_filename: originalFilename,
      bytes: blob.size,
      mime,
      mode_at_time: decision.modeAtTime,
      director_id: user.id,
      new_version: nextVersion,
    },
  });

  return apiOk({
    asset_id: assetId,
    drive_path: browserUrl,
    staging_path: absolutePath,
    original_filename: originalFilename,
    bytes: blob.size,
    mime,
    new_version: nextVersion,
    mode_at_time: decision.modeAtTime,
  });
});
