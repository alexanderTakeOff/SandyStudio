// ──────────────────────────────────────────────────────────────────────────────
// lib/api/stitch-edl.ts
//
// ОДИН монтажный лист (EDL) на оба сборщика финального ката.
//
// Сборщиков было два и они считали РАЗНОЕ. Агентский путь (EXEC-STITCH в
// lib/agents/runner.ts) читал `VID-animatic.metadata.animatic_v1`, применял
// `director_overrides` и отдавал ffmpeg `inpoint`/`outpoint`. Прямой инструмент
// `scripts/run/stitch.ts` в базу не ходил вовсе — клеил файлы целиком по `--order`.
// Итог 10.08: Директор подрезал кадры в аниматике, ум собрал кат прямым путём, и
// хронометраж разошёлся — накопленная сумма необрезанных хвостов вылезла на
// седьмом кадре.
//
// Здесь живёт ОБЩЕЕ правило «что и сколько играет». Арифметику не изобретаем —
// её держат чистые функции `lib/api/animatic-shotlist.ts`; этот модуль лишь
// собирает данные из базы и прикладывает их к правилу.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  clipLengthsFromVidShotRows,
  computeEffectivePlayback,
  excludedShotIdsFromEpisodeMeta,
  getAudioTracks,
  isAnimaticV1,
  isDeletedShot,
  type AnimaticContract,
  type AudioTrack,
} from './animatic-shotlist';

/** Один кадр монтажного листа — ровно то, что понимает ffmpeg-stitch. */
export interface OrderedShot {
  shotId: string;
  assetId: string;
  /** Абсолютный путь на диске — читать дешевле и без middleware. */
  stagingPath: string | null;
  /** Запасной путь: Drive / браузерный URL. */
  url: string | null;
  /** Сколько кадр РЕАЛЬНО играет после правок Директора и клампа по длине клипа. */
  durationSeconds: number;
  /** Обрезка головы → concat-демуксер `inpoint`. */
  inpointSeconds: number;
}

export interface StitchEdl {
  orderedShots: OrderedShot[];
  /** Кадры, которые Директор удалил (флагом или обрезкой в ноль). */
  excludedShots: string[];
  /** Кадры из аниматика, у которых нет APPROVED-клипа. Вызывающий решает, падать ли. */
  missing: string[];
  musicTrack: AudioTrack | null;
  animaticAssetId: string;
  animaticVersion: number;
}

interface VidShotRow {
  id: string;
  version?: number | null;
  created_at: string;
  drive_path: string | null;
  staging_path: string | null;
  drive_web_view_url: string | null;
  metadata?: unknown;
}

/**
 * Собрать монтажный лист эпизода из аниматика и APPROVED-клипов.
 *
 * `animaticAsset` и `episodeMetadata` можно передать снаружи — агентский путь уже
 * держит их в загруженных входах, и повторный запрос менял бы его поведение.
 * Не переданы — читаем из базы (прямой путь).
 */
export async function buildStitchEdl(
  supabase: SupabaseClient,
  episodeId: string,
  opts?: {
    animaticAsset?: { id: string; version?: number | null; metadata?: unknown } | null;
    episodeMetadata?: unknown;
  },
): Promise<StitchEdl> {
  let animatic = opts?.animaticAsset ?? null;
  if (!animatic) {
    const { data, error } = await supabase
      .from('assets')
      .select('id,version,metadata,status,file_type')
      .eq('episode_id', episodeId)
      .like('file_type', 'VID-animatic%')
      .eq('status', 'APPROVED')
      .order('version', { ascending: false });
    if (error) throw new Error(`монтажный лист: не прочитать аниматик — ${error.message}`);
    animatic = (data ?? []).find((a) => isAnimaticV1((a as { metadata?: unknown }).metadata)) ?? null;
  }
  if (!animatic || !isAnimaticV1(animatic.metadata)) {
    throw new Error(
      'монтажный лист: нет APPROVED VID-animatic с контрактом animatic@v1 — обрезки Директора взять неоткуда',
    );
  }
  const v1 = (animatic.metadata as { animatic_v1: AnimaticContract }).animatic_v1;
  const shotList = v1.shot_list ?? [];
  if (shotList.length === 0) throw new Error('монтажный лист: shot_list аниматика пуст');

  const { data: vidShotRows, error: rowsErr } = await supabase
    .from('assets')
    .select('id,file_type,status,version,created_at,drive_path,staging_path,drive_web_view_url,metadata')
    .eq('episode_id', episodeId)
    .like('file_type', 'VID-shot%')
    .eq('status', 'APPROVED')
    // Свежая версия первой — `clipLengthsFromVidShotRows` берёт длину последнего клипа,
    // ровно как таймлайн в интерфейсе.
    .order('version', { ascending: false });
  if (rowsErr) throw new Error(`монтажный лист: не прочитать клипы — ${rowsErr.message}`);

  const clipLengths = clipLengthsFromVidShotRows((vidShotRows ?? []) as never[]);

  // По кадру — самый свежий APPROVED клип (версия, затем время создания).
  const byShotId = new Map<
    string,
    { id: string; version: number; created_at: string; stagingPath: string | null; url: string | null }
  >();
  for (const row of (vidShotRows ?? []) as VidShotRow[]) {
    const meta = (row.metadata as { shot_id?: unknown; staging_path?: unknown } | null) ?? {};
    const sid = typeof meta.shot_id === 'string' ? meta.shot_id : null;
    if (!sid) continue;
    // staging_path живёт то в колонке, то в метаданных — пишут разные руки.
    const stagingPath =
      row.staging_path ?? (typeof meta.staging_path === 'string' ? meta.staging_path : null);
    const candidate = {
      id: row.id,
      version: row.version ?? 0,
      created_at: row.created_at,
      stagingPath,
      url: row.drive_path ?? row.drive_web_view_url ?? null,
    };
    const existing = byShotId.get(sid);
    if (
      !existing ||
      candidate.version > existing.version ||
      (candidate.version === existing.version && candidate.created_at > existing.created_at)
    ) {
      byShotId.set(sid, candidate);
    }
  }

  let episodeMeta = opts?.episodeMetadata;
  if (episodeMeta === undefined) {
    const { data: ep } = await supabase
      .from('episodes')
      .select('metadata')
      .eq('id', episodeId)
      .maybeSingle();
    episodeMeta = (ep as { metadata?: unknown } | null)?.metadata;
  }

  const overrides = v1.director_overrides ?? {};
  const excludedShotIds = excludedShotIdsFromEpisodeMeta(episodeMeta);
  const orderedShots: OrderedShot[] = [];
  const excludedShots: string[] = [];
  const missing: string[] = [];

  for (const shot of shotList) {
    // Удалённые Директором — первыми, ДО проверки медиа: у выброшенного кадра
    // клипа может не быть вовсе, и это не повод падать.
    if (isDeletedShot(shot, overrides, excludedShotIds)) {
      excludedShots.push(shot.shot_id);
      continue;
    }
    const found = byShotId.get(shot.shot_id);
    if (!found || (!found.stagingPath && !found.url)) {
      missing.push(shot.shot_id);
      continue;
    }
    // Единственный источник правды о длине: правка Директора + обрезка головы +
    // кламп по реальной длине клипа — то же, что показывает таймлайн.
    const playable = computeEffectivePlayback(shot, overrides, clipLengths);
    if (playable <= 0.5) {
      excludedShots.push(shot.shot_id);
      continue;
    }
    const trimStart = overrides[shot.shot_id]?.trim_start_seconds;
    orderedShots.push({
      shotId: shot.shot_id,
      assetId: found.id,
      stagingPath: found.stagingPath,
      url: found.url,
      durationSeconds: playable,
      inpointSeconds: typeof trimStart === 'number' && trimStart > 0 ? trimStart : 0,
    });
  }

  const musicTrack = getAudioTracks(v1).find((t) => t.layer === 'music') ?? null;

  return {
    orderedShots,
    excludedShots,
    missing,
    musicTrack,
    animaticAssetId: animatic.id,
    animaticVersion: animatic.version ?? 0,
  };
}
