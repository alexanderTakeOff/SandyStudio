// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/upload-music/route.ts
//
// Директор кладёт трек на станцию музыки, когда строки `AUD-music` ЕЩЁ НЕТ.
//
// Почему роут уровня ЭПИЗОДА, а не ассета: композитор ничего не генерит
// (`case 'EXEC-MGEN'` в раннере возвращает mock), поэтому строки на станции не
// появляется вовсе — и оба существующих загрузчика оказались недостижимы: они
// адресуются id ассета (`/api/assets/[id]/upload-music-direct` требует
// существующую `AUD-music`, `/upload-music` — существующий `VID-animatic`).
// Станция показывала «No artifact produced yet» и не имела ветки загрузки
// (прогон E06, 10.08).
//
// Работу делает та же общая функция, что и у ассетного пути:
// `ingestUploadedMusic` БЕЗ `targetAudMusicId` — она сама вставляет строку,
// ставит APPROVED и запекает трек в аниматик. Здесь только приём файла.
//
// Mode gate: Category C (UPLOAD_ASSET) — всегда разрешено; enforceMode зовётся
// ради аудита и штампа `mode_at_time`, как в соседнем роуте.
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
import { localCacheAbsPath } from '@/lib/media-cache';
import { uploadCacheFilename } from '@/lib/api/upload-cache';
import { ingestUploadedMusic } from '@/lib/api/ingest-music';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_AUDIO = new Map<string, string>([
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/wave', 'wav'],
]);

const MAX_BYTES = 20 * 1024 * 1024; // те же 20МБ, что у ассетного загрузчика

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { user } = await requireDirector();
  const sb = createSupabaseServiceRoleClient();

  const { data: epRaw, error } = await sb
    .from('episodes')
    .select('id,episode_code,governance_mode')
    .eq('id', episodeId)
    .maybeSingle();
  if (error) throw new Error(`episode fetch: ${error.message}`);
  if (!epRaw) throw new NotFoundError(`Episode ${episodeId}`);
  const ep = epRaw as unknown as { id: string; episode_code: string | null; governance_mode: number | null };

  const mode = ep.governance_mode === 2 || ep.governance_mode === 3 ? ep.governance_mode : 1;
  const decision = enforceMode(
    'UPLOAD_ASSET',
    { id: episodeId, governance_mode: mode },
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

  // Медиа-кэш, не ветка (директива 2026-06-02). Имя строим от КОДА ЭПИЗОДА:
  // строки ассета может ещё не существовать, а её имя выберет `ingestUploadedMusic`.
  const buf = Buffer.from(await blob.arrayBuffer());
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const nameBase = `${ep.episode_code ?? 'SS-unknown'}-AUD-music-v01-APPROVED.${ext}`;
  const cacheFilename = uploadCacheFilename(nameBase, hash, ext);
  const absolutePath = localCacheAbsPath(cacheFilename);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buf);
  const browserUrl = `/api/media/${encodeURIComponent(cacheFilename)}`;
  const originalFilename = blob.name ?? `music.${ext}`;

  // Строка есть — обновится, строки нет — создастся; APPROVED и запекание в
  // аниматик делает та же функция, что и у ассетного пути (один закон на два входа).
  const { audMusicId } = await ingestUploadedMusic(sb, {
    episodeId,
    browserUrl,
    ext,
    originalFilename,
    bytes: blob.size,
    mime,
    uploaderId: user.id,
  });

  await logEvent(sb, {
    event_type: 'asset_updated',
    severity: 'info',
    title: `Director uploaded + approved music for ${ep.episode_code ?? episodeId}`,
    description: `${originalFilename} (${Math.round(blob.size / 1024)}KB ${ext}) — episode-level AUD-music upload`,
    actor: user.id,
    asset_id: audMusicId,
    episode_id: episodeId,
    metadata: {
      kind: 'aud_music_episode_upload',
      drive_path: browserUrl,
      original_filename: originalFilename,
      bytes: blob.size,
      mime,
      mode_at_time: decision.modeAtTime,
    },
  });

  return apiOk({
    asset_id: audMusicId,
    episode_id: episodeId,
    drive_path: browserUrl,
    original_filename: originalFilename,
    bytes: blob.size,
    mime,
    mode_at_time: decision.modeAtTime,
  });
});
