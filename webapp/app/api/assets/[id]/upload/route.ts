// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/upload/route.ts
// Director uploads their own image / audio / video for an asset, replacing
// (or first-populating) the current preview.
//
// Behaviour:
//   - Multipart POST (Content-Type: multipart/form-data) with a single 'file' field.
//   - File saved into the worktree-independent media cache (lib/media-cache),
//     keyed by a canonical-prefixed name; served via /api/media/<filename>
//     (Director directive 2026-06-02 — no media in branches).
//   - metadata.image_prompt.history gets a new entry with source='director_upload',
//     prompt = "(uploaded by Director)", upload_original_filename = original name.
//   - Asset row's staging_path / drive_path point at the new uploaded URL.
//   - When the asset has NO image_prompt history yet, this also creates a
//     fresh image_prompt doc (current_version=1) — i.e. upload is a valid
//     first generation.
//
// Mode gating: Category C (UPLOAD_ASSET) — always allowed regardless of Mode.
// Director's own file is direct input; we never auto-fire uploads.
//
// Refuses on LOCKED.
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
import { localCacheAbsPath } from '@/lib/media-cache';
import { uploadCacheFilename } from '@/lib/api/upload-cache';
import {
  type AssetMetadataDoc,
  type ImagePromptHistoryEntry,
  type GovernanceModeNum,
  stampLastModified,
  buildProvenance,
} from '@/lib/api/series-bible';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AssetRow {
  id: string;
  series_id: string | null;
  episode_id: string | null;
  filename: string;
  file_type: string;
  status: string;
  staging_path: string | null;
  drive_file_id: string | null;
  drive_web_view_url: string | null;
  drive_path: string | null;
  metadata: AssetMetadataDoc | null;
}

const SUPPORTED_MIME = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['video/mp4', 'mp4'],
  ['video/quicktime', 'mov'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/wave', 'wav'],
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
]);
const MAX_BYTES = 32 * 1024 * 1024; // 32MB cap — generous for medium-quality refs

async function resolveMode(
  sb: ReturnType<typeof createSupabaseServiceRoleClient>,
  asset: AssetRow,
): Promise<GovernanceModeNum> {
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
    .select('*')
    .eq('id', assetId)
    .maybeSingle();
  if (error) throw new Error(`asset fetch: ${error.message}`);
  if (!assetRaw) throw new NotFoundError(`Asset ${assetId}`);
  const asset = assetRaw as unknown as AssetRow;

  if (asset.status === 'LOCKED') {
    throw new ValidationError('Asset is LOCKED — cannot upload over it');
  }

  // Mode gate (C — always allowed in practice; we still go through enforceMode for audit / mode_at_time stamp).
  const mode = await resolveMode(sb, asset);
  const decision = enforceMode(
    'UPLOAD_ASSET',
    { id: asset.episode_id ?? asset.id, governance_mode: mode },
    { directorConfirm: true, confirmedBy: user.email ?? user.id, actor: 'director' },
  );
  if (!decision.allowed) {
    // Should never hit (C is always allowed) but defence in depth:
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
  const ext = SUPPORTED_MIME.get(mime);
  if (!ext) {
    throw new ValidationError(
      `Unsupported MIME type: ${mime}. Supported: ${[...SUPPORTED_MIME.keys()].join(', ')}`,
    );
  }
  if (blob.size > MAX_BYTES) {
    throw new ValidationError(`File too large: ${blob.size} bytes; max ${MAX_BYTES}`);
  }

  // Persist into the worktree-independent media cache, keyed by a
  // canonical-prefixed name (no media in branches — 2026-06-02). Served via
  // /api/media/<filename>, which reads this same cache as a warm hit.
  const buf = Buffer.from(await blob.arrayBuffer());
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const cacheFilename = uploadCacheFilename(asset.filename, hash, ext);
  const absolutePath = localCacheAbsPath(cacheFilename);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buf);
  const browserUrl = `/api/media/${encodeURIComponent(cacheFilename)}`;

  // ── Update metadata ───────────────────────────────────────────────────────
  const meta: AssetMetadataDoc = (asset.metadata ?? {}) as AssetMetadataDoc;
  const existingHistory = meta.image_prompt?.history ?? [];
  const nextVersion = (meta.image_prompt?.current_version ?? 0) + 1;
  const nowIso = new Date().toISOString();

  const newEntry: ImagePromptHistoryEntry = {
    version: nextVersion,
    prompt: `(uploaded by Director — ${(blob as File).name ?? 'unnamed file'})`,
    source: 'director_upload',
    at: nowIso,
    cost_usd: 0,
    staging_path: browserUrl,
    drive_file_id: null,
    drive_web_view_url: null,
    width: null,
    height: null,
    quality: null,
    mode_at_time: decision.modeAtTime,
    upload_original_filename: (blob as File).name ?? undefined,
  };

  const newMeta: AssetMetadataDoc = {
    ...meta,
    image_prompt: {
      current_version: nextVersion,
      style_anchor_asset_id: meta.image_prompt?.style_anchor_asset_id ?? null,
      history: [...existingHistory, newEntry],
    },
    provenance: meta.provenance
      ? stampLastModified(meta.provenance, user.email ?? user.id, 'director', nowIso, decision.modeAtTime)
      : buildProvenance({
          by: user.email ?? user.id,
          byKind: 'director',
          source: 'manual_add',
          at: nowIso,
          modeAtTime: decision.modeAtTime,
        }),
  };

  const upd = await sb
    .from('assets')
    .update({
      staging_path: browserUrl,
      drive_path: browserUrl,
      drive_file_id: null,
      drive_web_view_url: null,
      metadata: newMeta as unknown as Record<string, unknown>,
    } as never)
    .eq('id', assetId);
  if (upd.error) throw new Error(`asset update failed: ${upd.error.message}`);

  // TD-20.B 2026-05-20 — write through logEvent + agent_completed so the
  // event lands in the actionable whitelist of migration 0030's trigger
  // (mirrors into concierge_turns) AND triggers pa/notify-needed → Polina
  // auto-react. Was 'asset_updated' (not actionable) → Director observed
  // 'Polina never reacts to my uploads'. Director attribution preserved
  // in metadata.director_id.
  await logEvent(sb, {
    event_type: 'agent_completed',
    severity: 'info',
    title: `File uploaded: ${asset.filename} → v${nextVersion}`,
    description: `Direct upload (${(blob as File).name ?? 'file'}, ${Math.round(blob.size / 1024)}KB ${mime})`,
    actor: 'EXEC-BIBLE-AUTHOR',
    asset_id: assetId,
    episode_id: asset.episode_id,
    metadata: {
      kind: 'director_upload',
      new_version: nextVersion,
      mime,
      bytes: blob.size,
      original_filename: (blob as File).name ?? null,
      mode_at_time: decision.modeAtTime,
      director_id: user.id,
    },
  });

  return apiOk({
    asset_id: assetId,
    action: 'upload',
    new_version: nextVersion,
    staging_url: browserUrl,
    mime,
    bytes: blob.size,
    mode_at_time: decision.modeAtTime,
  });
});
