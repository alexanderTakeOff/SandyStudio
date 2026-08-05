// @not-a-tool: общий каркас — заводит строку `assets` и кладёт байты в медиа-кэш; сам не запускается
//
// Один способ оставить след в студии. До 2026-08-05 его знал ровно один из семи
// инструментов прямого вызова (`register-canon`), поэтому три эпизода подряд —
// E35, E36, E37 — произвели 195 кадров и 87 клипов, из которых студия не увидела
// НИ ОДНОГО: файлы лежали на диске, строк в базе не было.
//
// Два поля, без которых след не виден, и оба легко забыть руками:
//   • `drive_path = /api/media/<filename>` — резолвер превью строит ссылку только
//     по признаку Drive, а роут `/api/media/[id]` при этом прекрасно отдаёт из
//     тёплого локального кэша. Без этого поля карточка пишет «no preview» над
//     файлом, который лежит рядом (симптом четырёх канон-плит).
//   • свежесть превью — при замене байтов под тем же именем браузер держит старую
//     картинку (DRAFT кэшируется на час, APPROVED/LOCKED — на год как immutable).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sb } from './_env';
import { localCacheAbsPath } from '../../lib/media-cache';
import { bumpPreviewFreshness } from '../../lib/asset-preview-resolver';

export interface PersistAssetArgs {
  /**
   * Каноническое имя по CLAUDE.md §3 — оно же ключ медиа-кэша. Можно опустить,
   * когда строка уже существует: тогда берётся её имя, и починка старой записи
   * не переименовывает файл, который уже лежит в кэше.
   */
  filename?: string;
  /** `SBL-<slug>` для канона серии, `IMG-…` / `VID-…` для материалов эпизода. */
  fileType: string;
  /** Откуда взять байты. Пусто — строка обновляется без замены файла. */
  srcPath?: string;
  /** Материал эпизода. Взаимоисключимо с `seriesId` — так устроены рабочие строки. */
  episodeId?: string | null;
  /** Канон серии. */
  seriesId?: string | null;
  status?: string;
  description?: string;
  /** Тело документа. Для STB именно отсюда лента читает список кадров. */
  content?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface PersistAssetResult {
  id: string;
  filename: string;
  created: boolean;
  cachedAt: string | null;
}

/**
 * Кладёт байты в медиа-кэш и заводит (или обновляет) строку `assets`.
 * Идемпотентна: повторный вызов с тем же `fileType` в той же области обновляет
 * строку, а не плодит дубль.
 */
export async function persistAsset(a: PersistAssetArgs): Promise<PersistAssetResult> {
  if (!a.episodeId && !a.seriesId) {
    throw new Error(`persistAsset(${a.fileType}): нужен episodeId или seriesId — без области ассет не найдётся`);
  }

  const scope = a.episodeId
    ? { column: 'episode_id' as const, value: a.episodeId }
    : { column: 'series_id' as const, value: a.seriesId! };

  const { data: existing, error: findErr } = await sb
    .from('assets')
    .select('id,version,metadata,filename')
    .eq('file_type', a.fileType)
    .eq(scope.column, scope.value)
    .maybeSingle();
  if (findErr) throw new Error(`assets lookup failed: ${findErr.message}`);

  const filename = a.filename ?? existing?.filename;
  if (!filename) throw new Error(`persistAsset(${a.fileType}): новой строке нужно имя файла`);

  let cachedAt: string | null = null;
  if (a.srcPath) {
    const src = resolve(process.cwd(), a.srcPath);
    if (!existsSync(src)) throw new Error(`source not found: ${src}`);
    cachedAt = localCacheAbsPath(filename);
    mkdirSync(dirname(cachedAt), { recursive: true });
    copyFileSync(src, cachedAt);
  }

  // Без этого поля карточка молча пишет «no preview» — см. шапку.
  const drivePath = `/api/media/${filename}`;

  if (existing) {
    const patch: Record<string, unknown> = {
      filename,
      drive_path: drivePath,
      // Байты могли смениться под тем же именем — двигаем ключ обхода кэша.
      metadata: bumpPreviewFreshness({ ...(existing.metadata as object), ...(a.metadata ?? {}) }, existing.version),
    };
    if (a.status) patch.status = a.status;
    if (a.description) patch.description = a.description;
    if (a.content ?? a.description) patch.content = a.content ?? a.description;

    const { error } = await sb.from('assets').update(patch).eq('id', existing.id);
    if (error) throw new Error(`asset update failed: ${error.message}`);
    return { id: existing.id, filename, created: false, cachedAt };
  }

  const { data, error } = await sb
    .from('assets')
    .insert({
      episode_id: a.episodeId ?? null,
      series_id: a.seriesId ?? null,
      file_type: a.fileType,
      filename,
      drive_path: drivePath,
      status: a.status ?? 'APPROVED',
      description: a.description ?? null,
      content: a.content ?? a.description ?? null,
      agent_id: a.agentId ?? 'DIRECT-RUN',
      version: 1,
      metadata: a.metadata ?? {},
    })
    .select('id')
    .single();
  if (error) throw new Error(`asset insert failed: ${error.message}`);

  return { id: data.id, filename, created: true, cachedAt };
}

/** Код эпизода из базы — никогда не хардкодится (уроки D49, D58). */
export async function episodeCode(episodeId: string): Promise<string> {
  const { data, error } = await sb.from('episodes').select('episode_code').eq('id', episodeId).single();
  if (error || !data?.episode_code) {
    throw new Error(`episode ${episodeId} not found — RUN_EPISODE_ID указывает в никуда`);
  }
  return data.episode_code;
}
