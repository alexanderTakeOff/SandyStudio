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
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
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

  // D72: новая строка канона под слагом без категории (`eyelid_shutter` вместо
  // `object_eyelid_shutter`) молча заводит ВТОРУЮ плиту рядом с первой — ни
  // один из тулов, что пишут SBL-, не знал о существовании другого. Ищем
  // БЛИЗКИЙ file_type в том же скопе ДО вставки — в обе стороны (новый может
  // быть и короче, и длиннее существующего), а не только точное совпадение,
  // которое `existing` выше уже проверил и не нашёл.
  if (a.fileType.startsWith('SBL-')) {
    const newTail = a.fileType.slice('SBL-'.length);
    const { data: siblings } = await sb
      .from('assets')
      .select('file_type')
      .eq(scope.column, scope.value)
      .like('file_type', 'SBL-%');
    const near = (siblings ?? []).find((s) => {
      if (s.file_type === a.fileType) return false;
      const otherTail = s.file_type.slice('SBL-'.length);
      return s.file_type.endsWith(newTail) || a.fileType.endsWith(otherTail);
    });
    if (near) {
      throw new Error(
        `persistAsset(${a.fileType}): рядом уже есть похожий канон «${near.file_type}» — ` +
          `не забыта ли категория в слаге (object_/character_/location_/style_/…)? ` +
          `Если это действительно ДРУГАЯ плита — назови слаг так, чтобы хвост не совпадал.`,
      );
    }
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

// ── След в студии для изделия эпизода ─────────────────────────────────────────
//
// Один способ завести кадр, клип, кат или музыку. Зовётся И вручную
// (`register-media`), И самими генераторами сразу после записи файла: регистрация
// становится частью ТОГО ЖЕ движения, а не отдельным шагом, который забудут.
// Именно потому, что шаг был отдельным, три эпизода подряд остались невидимыми.

export type MediaKind = 'frame' | 'clip' | 'cut' | 'music';

/** Тип-префикс — единственное, что связывает изделие со стадией конвейера. */
const MEDIA_AGENT: Readonly<Record<MediaKind, { kindTag: string; agent: string }>> = {
  frame: { kindTag: 'IMG', agent: 'EXEC-EREF' },
  clip: { kindTag: 'VID', agent: 'EXEC-VGEN' },
  cut: { kindTag: 'VID', agent: 'EXEC-STITCH' },
  music: { kindTag: 'AUD', agent: 'EXEC-MGEN' },
};

/** `SS-S15-E36` + `sh01` → `S15-E36-SH01` — канонический id кадра by-position. */
export function shotIdFor(code: string, shot: string): string {
  return `${code.replace(/^SS-/, '')}-${shot.toUpperCase()}`;
}

/**
 * Номер кадра из имени файла: `sh01-v02.png`, `clips/sh04c.mp4`, `sh09-v03.png`.
 * Буквенный суффикс пересъёмки (`sh04c`) отбрасывается — это другая ВЕРСИЯ того
 * же кадра, а не другой кадр; счёт по ячейкам иначе задвоится.
 */
export function shotFromFilename(file: string): string | null {
  const base = file.split(/[\\/]/).pop() ?? '';
  const m = /(?:^|[^a-z0-9])(sh\d{1,3})[a-z]?(?:[^a-z0-9]|$)/i.exec(base);
  return m ? m[1].toLowerCase() : null;
}

/** Длительность медиафайла; по ней лента считает ширину ячейки. */
export function mediaDurationSeconds(file: string): number | undefined {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', resolve(process.cwd(), file)],
      { encoding: 'utf8' },
    );
    const n = Number(out.trim());
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

export interface RegisterMediaArgs {
  episodeId: string;
  kind: MediaKind;
  /** Путь к файлу-изделию. */
  file: string;
  /** `sh01` — обязателен для кадра и клипа; для ката и музыки не нужен. */
  shot?: string;
  version?: string;
  status?: string;
  description?: string;
  origin?: string;
}

export async function registerEpisodeMedia(a: RegisterMediaArgs): Promise<PersistAssetResult> {
  const kind = a.kind;
  const shot = (a.shot ?? '').toLowerCase();
  const perShot = kind === 'frame' || kind === 'clip';
  if (perShot && !shot) throw new Error(`registerEpisodeMedia(${kind}): нужен shot, например sh01`);

  const code = await episodeCode(a.episodeId);
  const stem = code.replace(/^SS-/, '').toLowerCase();
  const sid = perShot ? shotIdFor(code, shot) : null;
  const spec = MEDIA_AGENT[kind];
  const version = a.version ?? 'v01';
  const status = a.status ?? 'APPROVED';

  const fileType =
    kind === 'frame' ? `IMG-episode_ref_${stem.replace(/-/g, '_')}_${shot}`
    : kind === 'clip' ? `VID-shot-${stem}-${shot}`
    : kind === 'cut' ? 'VID-final_cut'
    : 'AUD-music-main';
  const slug = perShot ? `shot_${shot}` : kind === 'cut' ? 'final_cut' : 'music_main';

  // Лента связывает ячейку с изделием через эти поля; без них тип верен, а
  // ячейка пуста.
  const metadata: Record<string, unknown> = {
    origin: a.origin ?? 'direct-run',
    source_file: a.file,
  };
  if (kind === 'frame') metadata.shot_reference = { shot_id: sid };
  if (kind === 'clip') {
    metadata.shot_id = sid;
    const seconds = mediaDurationSeconds(a.file);
    if (seconds) metadata.duration_seconds = seconds;
  }

  return persistAsset({
    filename: `${code}-${spec.kindTag}-${slug}-${version}-${status}${extname(a.file)}`,
    fileType,
    srcPath: a.file,
    episodeId: a.episodeId,
    status,
    description: a.description ?? `${kind} ${sid ?? code} · прямой вызов`,
    agentId: spec.agent,
    metadata,
  });
}

/**
 * Оставить след, НЕ уронив работу. Изделие уже произведено и оплачено; если
 * регистрация не удалась, потерять надо запись, а не результат. Но потерять
 * ТИХО нельзя — молчание здесь и есть тот дефект, который мы чиним, поэтому
 * отказ печатается громко и с указанием, чем починить вручную.
 */
export async function traceInStudio(a: RegisterMediaArgs): Promise<void> {
  try {
    const res = await registerEpisodeMedia(a);
    console.log(`студия: ${res.created ? 'заведено' : 'обновлено'} ${res.filename}`);
  } catch (e) {
    console.error(
      `СЛЕД НЕ ОСТАВЛЕН (изделие цело, студия его не видит): ${e instanceof Error ? e.message : e}`,
    );
    console.error(
      `почини вручную: npx tsx scripts/run/register-media.ts --file ${a.file} --kind ${a.kind}` +
        (a.shot ? ` --shot ${a.shot}` : ''),
    );
  }
}
