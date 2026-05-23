// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/upload-music-direct/route.ts
//
// Director uploads a .mp3 / .wav directly for an AUD-music asset.
// Sibling to /upload-music (which targets VID-animatic.metadata.music_url) —
// this one writes the binary AS the asset's primary content, updating
// drive_path + staging_path columns so any downstream consumer
// (animatic-slideshow runner, /upload-music gate, AnimaticPlayer) picks it up.
//
// Why a separate route:
//   The old /upload-music expects a VID-animatic asset id and patches
//   metadata.animatic_v1.music_url. After the Phase A.2 audio reorg (LT-04,
//   2026-05-08), MGEN now produces an AUD-music asset BEFORE any animatic
//   exists, so Director's "upload my own track" affordance was unreachable
//   (the UI lived only inside AnimaticPlayer). This route + matching button
//   in AssetPreview close the regression — Director can upload from the
//   composer preview directly.
//
// Mode gate: Category C (UPLOAD_ASSET) — always allowed; we still pass
// through enforceMode() for audit / mode_at_time stamping.
// Refuses on LOCKED.
// ──────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { requireDirector } from '@/lib/api/auth';
import { logEvent } from '@/lib/api/events';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { enforceMode } from '@/lib/governance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AssetRow {
  id: string;
  episode_id: string | null;
  filename: string;
  file_type: string;
  status: string;
  metadata: unknown;
}

const SUPPORTED_AUDIO = new Map<string, string>([
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/wave', 'wav'],
]);

const MAX_BYTES = 20 * 1024 * 1024; // 20MB cap — typical 5-min mp3 at 256kbps ~10MB

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
    throw new ValidationError('Asset is LOCKED — cannot replace music');
  }
  if (!asset.file_type.startsWith('AUD-music')) {
    throw new ValidationError(
      `Direct music upload is only valid for AUD-music assets (got ${asset.file_type}). ` +
        `For VID-animatic assets use /api/assets/[id]/upload-music (legacy path).`,
    );
  }

  // Mode gate (C — defensive).
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
  const ext = SUPPORTED_AUDIO.get(mime);
  if (!ext) {
    throw new ValidationError(
      `Unsupported audio MIME type: ${mime}. Supported: ${[...SUPPORTED_AUDIO.keys()].join(', ')}`,
    );
  }
  if (blob.size > MAX_BYTES) {
    throw new ValidationError(`File too large: ${blob.size} bytes; max ${MAX_BYTES}`);
  }

  // Persist locally — same staging convention as /upload-music.
  const buf = Buffer.from(await blob.arrayBuffer());
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const dir = path.join(process.cwd(), 'public', 'staging', 'music');
  await fs.mkdir(dir, { recursive: true });
  const filename = `${hash}.${ext}`;
  const absolutePath = path.join(dir, filename);
  await fs.writeFile(absolutePath, buf);
  const browserUrl = `/staging/music/${filename}`;
  const originalFilename = blob.name ?? `music.${ext}`;

  // Update the asset row's binary columns + flag the metadata so downstream
  // consumers (animatic-slideshow runner, activity feed) can tell this came
  // from a Director upload, not from EXEC-MGEN.
  //
  // We KEEP status as-is (typically REVIEW from the mock MGEN output) so
  // Director still has to APPROVE explicitly — uploading the file is not
  // implicit approval. The "uploaded_by_director" flag is informational only.
  const metaRaw = (asset.metadata ?? {}) as Record<string, unknown>;
  const newMeta = {
    ...metaRaw,
    uploaded_by_director: true,
    uploaded_at: new Date().toISOString(),
    original_filename: originalFilename,
    bytes: blob.size,
    mime,
  };

  const { error: updateErr } = await sb
    .from('assets')
    .update({
      drive_path: browserUrl,
      staging_path: absolutePath,
      drive_file_id: null, // local-only — no Drive id
      drive_web_view_url: null,
      metadata: newMeta as unknown as Record<string, unknown>,
    } as never)
    .eq('id', assetId);
  if (updateErr) {
    throw new Error(`asset update failed: ${updateErr.message}`);
  }

  // TD-29.5 (2026-05-21): route through logEvent so the row consistently
  // emits pa/notify-needed when the event_type is actionable.
  await logEvent(sb, {
    event_type: 'asset_updated',
    severity: 'info',
    title: `Director uploaded music for ${asset.filename}`,
    description: `${originalFilename} (${Math.round(blob.size / 1024)}KB ${ext}) — direct AUD-music upload`,
    actor: user.id,
    asset_id: assetId,
    episode_id: asset.episode_id,
    metadata: {
      kind: 'aud_music_direct_upload',
      drive_path: browserUrl,
      original_filename: originalFilename,
      bytes: blob.size,
      mime,
      mode_at_time: decision.modeAtTime,
    },
  });

  return apiOk({
    asset_id: assetId,
    drive_path: browserUrl,
    staging_path: absolutePath,
    original_filename: originalFilename,
    bytes: blob.size,
    mime,
    mode_at_time: decision.modeAtTime,
  });
});
