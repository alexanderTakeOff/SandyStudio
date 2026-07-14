// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/upload-music/route.ts
// Director uploads a .mp3 (or .wav) music track for a `VID-animatic` asset.
// The file is staged locally and `metadata.animatic_v1.music_url` is updated
// so the in-drawer AnimaticPlayer can sync image playback to the audio.
//
// This is a focused sibling to /upload — that endpoint manages
// metadata.image_prompt.history; here we only touch metadata.animatic_v1.
// Refusing to dual-purpose the existing route keeps both code paths simple
// and keeps `image_prompt.history` reserved for visual rerolls.
//
// Mode gate: Category C (UPLOAD_ASSET) — always allowed; we still pass
// through enforceMode() for audit / mode_at_time stamping.
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
import {
  isAnimaticV1,
  replaceMusicLayer,
  type AnimaticContract,
} from '@/lib/api/animatic-shotlist';
import { localCacheAbsPath } from '@/lib/media-cache';
import { uploadCacheFilename } from '@/lib/api/upload-cache';
import { ingestUploadedMusic } from '@/lib/api/ingest-music';

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
    if (mode === 1 || mode === 2 || mode === 3) return mode;
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
  if (!asset.file_type.startsWith('VID-animatic')) {
    throw new ValidationError(
      `Music upload is only valid for VID-animatic assets (got ${asset.file_type})`,
    );
  }
  if (!isAnimaticV1(asset.metadata)) {
    throw new ValidationError(
      'Asset is not a v1 animatic (legacy markdown-only). Re-trigger Animatic stage to upgrade.',
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

  // Persist into the worktree-independent media cache — same convention as
  // /upload (no media in branches — 2026-06-02). Served via /api/media/<file>.
  const buf = Buffer.from(await blob.arrayBuffer());
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const cacheFilename = uploadCacheFilename(asset.filename, hash, ext);
  const absolutePath = localCacheAbsPath(cacheFilename);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buf);
  const browserUrl = `/api/media/${encodeURIComponent(cacheFilename)}`;
  const originalFilename = blob.name ?? `music.${ext}`;

  // Replace the canonical music layer. CANONICAL READER = getAudioTracks(),
  // which PREFERS `audio_tracks[]` over `music_url` (animatic-shotlist.ts). The
  // pre-2026-06-09 path patched ONLY music_url, so a stale non-empty
  // audio_tracks[music] (e.g. the mock wav written at animatic build) shadowed
  // the fresh upload → player + EXEC-STITCH both played the old track and the
  // Director's Replace silently "did nothing" (SS-S15-E03 v03 regression). Fix:
  // atomically rewrite the music-layer track in audio_tracks AND keep the
  // legacy music_url/music_filename in sync. Non-music layers (voice/sfx/
  // ambience) are preserved. Shaping (fade/trim) is intentionally reset — a new
  // source file; Director re-shapes via /animatic-timing afterward.
  const metaRaw = (asset.metadata ?? {}) as Record<string, unknown>;
  const v1 = (metaRaw.animatic_v1 ?? {}) as AnimaticContract;
  const newV1 = replaceMusicLayer(v1, { url: browserUrl, filename: originalFilename });
  const newMeta = { ...metaRaw, animatic_v1: newV1 };

  const { error: updateErr } = await sb
    .from('assets')
    .update({ metadata: newMeta as unknown as Record<string, unknown> } as never)
    .eq('id', assetId);
  if (updateErr) {
    throw new Error(`metadata update failed: ${updateErr.message}`);
  }

  // D3b/D14/D15 (2026-07-09): the contract now carries the track, but the stitch
  // music gate keys off an APPROVED AUD-music ROW. Upsert one via the shared
  // ingest path (skipBake — we already patched the contract above, preserving
  // non-music layers) so the manual timeline upload advances the pipeline instead
  // of stalling on "no APPROVED music".
  if (asset.episode_id) {
    await ingestUploadedMusic(sb, {
      episodeId: asset.episode_id,
      browserUrl,
      ext,
      originalFilename,
      bytes: blob.size,
      mime,
      uploaderId: user.id,
      skipBake: true,
    });
  }

  await sb.from('activity_events').insert({
    event_type: 'asset_updated',
    severity: 'info',
    title: `Music uploaded for ${asset.filename}`,
    description: `Director uploaded ${originalFilename} (${Math.round(blob.size / 1024)}KB ${ext}) for animatic`,
    actor: user.id,
    asset_id: assetId,
    episode_id: asset.episode_id,
    metadata: {
      kind: 'animatic_music_upload',
      music_url: browserUrl,
      music_filename: originalFilename,
      mode_at_time: decision.modeAtTime,
    },
  } as never);

  return apiOk({
    asset_id: assetId,
    music_url: browserUrl,
    music_filename: originalFilename,
    bytes: blob.size,
    mode_at_time: decision.modeAtTime,
  });
});
