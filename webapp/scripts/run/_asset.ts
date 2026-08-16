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
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { sb } from './_env';
import { bumpPreviewFreshness, resolvePreviewSrc } from '../../lib/asset-preview-resolver';
import { assertStoryboardApprovable } from '../../lib/api/animatic-shotlist';
import { assertCastApprovable } from '../../lib/agents/episode-cast';
// Ф1 миграции (R1-R23): медиа пишется В ФОРМАХ КОНВЕЙЕРА, теми же функциями.
import { persistBinary, type BinaryExt } from '../../lib/persist-binary';
import { SHOT_REFERENCE_CONTRACT, isShotReferenceV2 } from '../../lib/api/shot-reference';
import { resolveSlotDescriptor, demoteSiblingApproved } from '../../lib/api/single-approved';
import { logEvent } from '../../lib/api/events';

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
/**
 * Байты изделия — В КЭШ И НА DRIVE, одним путём для канона и для материалов.
 *
 * Здесь стоял голый `copyFileSync` в локальный кэш, и это тихо ломало ЛЮБУЮ плиту
 * канона: `drive_file_id` оставался null, а гейт финализации отказывается ставить
 * LOCKED без резервной копии на Drive — «media lives only in the local cache and
 * would be lost on the next cache clear». То есть плиту, заведённую `register-canon`,
 * невозможно было залочить в принципе, и узнавал об этом Директор — на кнопке.
 * `registerEpisodeMedia` рядом всё это время звал `persistBinary` и получал Drive;
 * две дороги к одному хранилищу разошлись, и одна из них вела в тупик.
 */
async function storeBytes(
  srcPath: string,
  filename: string,
  seriesId: string | null,
  episodeId: string | null,
): Promise<{ cachedAt: string; driveFileId: string | null }> {
  const src = resolve(process.cwd(), srcPath);
  if (!existsSync(src)) throw new Error(`source not found: ${src}`);

  // Канон серии живёт в корзине BIBLE, материалы эпизода — в корзине эпизода
  // (её `persistBinary` выводит из кода эпизода сам).
  let seriesCode: string | undefined;
  if (seriesId) {
    const { data } = await sb.from('series').select('series_code').eq('id', seriesId).maybeSingle();
    seriesCode = (data as { series_code?: string } | null)?.series_code;
  }
  const episode = episodeId ? await episodeCode(episodeId) : undefined;

  const persisted = await persistBinary({
    base64: readFileSync(src).toString('base64'),
    ext: extname(filename).slice(1).toLowerCase() as BinaryExt,
    driveFilename: filename,
    ...(seriesCode ? { seriesCode, bucket: 'BIBLE', assetType: 'images' } : {}),
    ...(episode ? { episodeCode: episode } : {}),
    supabase: sb as never,
  });
  if (persisted.driveUploadFailed) {
    // ГРОМКО: молчаливый провал здесь и есть та ловушка, из-за которой плита
    // доходила до кнопки Директора негодной.
    console.warn(`⚠ ${filename}: Drive не принял байты — строка останется без резервной копии и её нельзя будет залочить.`);
  }
  return { cachedAt: persisted.absolutePath, driveFileId: persisted.driveFileId };
}

/** Версия, названная вызывающим в имени файла (`…-v03-REVIEW.md` → 3). */
export function versionFromFilename(filename?: string): number | null {
  const m = filename ? /-v(\d+)-/.exec(filename) : null;
  return m ? Number(m[1]) : null;
}

/**
 * Заводить ли СОСЕДА вместо правки строки на месте. Вынесено отдельно, потому что
 * три условия сложились из трёх разных инцидентов и читались как одно выражение:
 *
 *  · `contentChanged && status !== DRAFT` — правка после выхода из черновика
 *    обязана сохранять историю (Директор, 09.08);
 *  · `touchesLocked` — залоченную строку не правит никто, кроме Директора (11.08);
 *  · `versionNamed` — названная версия ЕСТЬ приказ завести соседа (12.08, п.8
 *    очереди Полины: `--version v02` поверх `v01-DRAFT` переименовал строку, и v01
 *    исчез вместе с возможностью сравнить автора с критиком).
 */
export function shouldForkNewVersion(a: {
  existingVersion: number | null;
  existingStatus: string | null;
  askedVersion: number | null;
  contentChanged: boolean;
  touchesLocked: boolean;
}): boolean {
  const versionNamedAndDifferent =
    a.askedVersion !== null && a.askedVersion !== (a.existingVersion ?? 1);
  return (
    (a.contentChanged && a.existingStatus !== 'DRAFT') || a.touchesLocked || versionNamedAndDifferent
  );
}

export async function persistAsset(a: PersistAssetArgs): Promise<PersistAssetResult> {
  if (!a.episodeId && !a.seriesId) {
    throw new Error(`persistAsset(${a.fileType}): нужен episodeId или seriesId — без области ассет не найдётся`);
  }

  const scope = a.episodeId
    ? { column: 'episode_id' as const, value: a.episodeId }
    : { column: 'series_id' as const, value: a.seriesId! };

  // D75: та же неоднозначность, что чинили в gen-frame — плита с историей версий
  // (INVALIDATED-хвост + свежая DRAFT) даёт две строки на file_type;
  // `.maybeSingle()` без сортировки падает на «multiple rows». Свежая версия
  // побеждает — так уже отвечает show-asset/gen-frame на тот же вопрос.
  const { data: existingRows, error: findErr } = await sb
    .from('assets')
    .select('id,version,metadata,filename,status,content')
    .eq('file_type', a.fileType)
    .eq(scope.column, scope.value)
    .order('version', { ascending: false })
    .limit(1);
  if (findErr) throw new Error(`assets lookup failed: ${findErr.message}`);
  const existing = existingRows?.[0];

  const filename = a.filename ?? existing?.filename;
  if (!filename) throw new Error(`persistAsset(${a.fileType}): новой строке нужно имя файла`);

  let cachedAt: string | null = null;
  let driveFileId: string | null = null;
  if (a.srcPath) {
    const stored = await storeBytes(a.srcPath, filename, a.seriesId ?? null, a.episodeId ?? null);
    cachedAt = stored.cachedAt;
    driveFileId = stored.driveFileId;
  }

  // Без этого поля карточка молча пишет «no preview» — см. шапку.
  const drivePath = `/api/media/${filename}`;

  // Правка через ревью = ОТДЕЛЬНАЯ версия (Директор, 09.08): документ, чьё
  // содержимое меняется ПОСЛЕ выхода из DRAFT, получает новую строку `max+1`,
  // а не переписывает слот — история правок обязана сохраняться (паттерн
  // `nextVersionFor`, lib/api/series-bible.ts). DRAFT итерируется на месте.
  //
  // ЗАМОК (11.08). Тот же слот, но другая причина: строку в LOCKED не правит
  // НИКТО, кроме Директора. До этой ветки `register-canon --slug … --file …`
  // спокойно переписывал байты и статус утверждённой плиты — замок слетал молча,
  // а имя файла пересобиралось в `-APPROVED.png`. Любое касание LOCKED уходит в
  // версию max+1 со статусом REVIEW: правка живёт, замок цел, решение — за
  // Директором (та же формулировка, что в `set-status.ts`).
  // НАЗВАННАЯ ВЕРСИЯ — ЭТО ПРИКАЗ ЗАВЕСТИ СОСЕДА (12.08, очередь Полины п.8).
  //
  // Контракт `write-asset` печатал дословно: «новая версия заводит соседа, не затирает
  // историю». Но правило выше пропускает DRAFT «итерироваться на месте» — и вызов
  // `--type SCR-script --version v02` поверх живого `v01-DRAFT` вернул тот же uuid,
  // ПЕРЕИМЕНОВАВ строку: v01 в эпизоде не осталось. Сравнить работу автора с работой
  // критика стало нечем. Итерация DRAFT на месте — разумное умолчание, но только пока
  // версию НЕ НАЗВАЛИ: назвал версию — значит просишь историю, а не правку.
  const askedVersion = versionFromFilename(a.filename);
  const locked = existing?.status === 'LOCKED';
  const contentChanged = Boolean(existing) && a.content !== undefined && a.content !== existing!.content;
  const touchesLocked =
    locked && (Boolean(a.srcPath) || contentChanged || a.description !== undefined || Boolean(a.status));
  const fork =
    existing !== undefined &&
    shouldForkNewVersion({
      existingVersion: (existing.version as number | null) ?? null,
      existingStatus: (existing.status as string | null) ?? null,
      askedVersion,
      contentChanged,
      touchesLocked,
    });
  if (existing && fork) {
    // Названную версию уважаем, но назад не откатываемся: сосед всегда СТАРШЕ
    // существующей строки, иначе история читалась бы в обратном порядке.
    const nextVersion = Math.max(((existing.version as number | null) ?? 1) + 1, askedVersion ?? 0);
    const nextTag = `v${String(nextVersion).padStart(2, '0')}`;
    const status = touchesLocked ? 'REVIEW' : (a.status ?? 'REVIEW');
    if (touchesLocked) {
      console.warn(
        `⚠ ${existing.filename} — LOCKED. Замок снимает только Директор; правка ушла в ${nextTag} (REVIEW).`,
      );
    }
    const newFilename = (a.filename ?? existing.filename)
      .replace(/-v\d+-/, `-${nextTag}-`)
      .replace(/-(DRAFT|REVIEW|REVISION|APPROVED|LOCKED)(\.[^.]+)$/, `-${status}$2`);
    if (a.srcPath) {
      // Имя новой версии другое — байты укладываются ПОД НИМ, вместе с Drive.
      const stored = await storeBytes(a.srcPath, newFilename, a.seriesId ?? null, a.episodeId ?? null);
      cachedAt = stored.cachedAt;
      driveFileId = stored.driveFileId;
    }
    assertStoryboardApprovable(a.fileType, status, a.content, newFilename);
    assertCastApprovable(a.fileType, status, a.content, a.metadata ?? {});
    const { data: created, error: verErr } = await sb
      .from('assets')
      .insert({
        episode_id: a.episodeId ?? null,
        series_id: a.seriesId ?? null,
        file_type: a.fileType,
        filename: newFilename,
        drive_path: `/api/media/${newFilename}`,
        drive_file_id: driveFileId,
        status,
        description: a.description ?? null,
        // Текст плиты НЕ теряется, когда меняют одни байты: новая версия
        // наследует содержимое старой, если своего ей не передали.
        content: a.content ?? existing.content,
        agent_id: a.agentId ?? 'DIRECT-RUN',
        version: nextVersion,
        metadata: { ...(existing.metadata as object), ...(a.metadata ?? {}) },
      })
      .select('id')
      .single();
    if (verErr) throw new Error(`asset new-version insert failed: ${verErr.message}`);
    await logEvent(sb as never, {
      event_type: 'asset_created',
      title: `${a.fileType} ${nextTag} · ${status}`,
      actor: a.agentId ?? 'DIRECT-RUN',
      episode_id: a.episodeId ?? null,
      series_id: a.seriesId ?? null,
      asset_id: created.id,
      metadata: { file_type: a.fileType, filename: newFilename, supersedes_version: existing.version },
    });
    return { id: created.id, filename: newFilename, created: true, cachedAt };
  }

  if (existing) {
    const patch: Record<string, unknown> = {
      filename,
      drive_path: drivePath,
      // Резервная копия появляется только вместе с новыми байтами; починка строки
      // без файла не должна затирать существующий `drive_file_id`.
      ...(driveFileId ? { drive_file_id: driveFileId } : {}),
      // Байты могли смениться под тем же именем — двигаем ключ обхода кэша.
      metadata: bumpPreviewFreshness({ ...(existing.metadata as object), ...(a.metadata ?? {}) }, existing.version),
    };
    if (a.status) patch.status = a.status;
    if (a.description) patch.description = a.description;
    // ОПИСАНИЕ И СОДЕРЖИМОЕ — РАЗНЫЕ ПОЛЯ (11.08). Здесь стоял fallback
    // `content = content ?? description`, и `register-canon --desc «одна строка»`
    // клал эту строку в `content`, затирая текст плиты целиком: инструмент
    // содержимое не шлёт НИКОГДА, так что fallback работал исключительно как
    // разрушитель. Описание живёт в `description`, тело — в `content`.
    if (a.content !== undefined) patch.content = a.content;

    // D76/D84: не пустить STB в APPROVED/LOCKED без машиночитаемого списка кадров
    // и с shot_id не по канону — резолвим статус/контент так же, как патч выше.
    assertStoryboardApprovable(
      a.fileType,
      (patch.status as string | undefined) ?? existing.status,
      (patch.content as string | undefined) ?? existing.content,
      filename,
    );
    assertCastApprovable(
      a.fileType,
      (patch.status as string | undefined) ?? existing.status,
      (patch.content as string | undefined) ?? existing.content,
      patch.metadata,
    );

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

  const insertStatus = a.status ?? 'APPROVED';
  const insertContent = a.content ?? a.description ?? null;
  // D76: same gate as the update branch — a NEW STB row can be born straight
  // into APPROVED (persistAsset defaults status to APPROVED when unset).
  assertStoryboardApprovable(a.fileType, insertStatus, insertContent, filename);
  assertCastApprovable(a.fileType, insertStatus, insertContent, a.metadata ?? {});

  const { data, error } = await sb
    .from('assets')
    .insert({
      episode_id: a.episodeId ?? null,
      series_id: a.seriesId ?? null,
      file_type: a.fileType,
      filename,
      drive_path: drivePath,
      drive_file_id: driveFileId,
      status: insertStatus,
      description: a.description ?? null,
      content: insertContent,
      agent_id: a.agentId ?? 'DIRECT-RUN',
      version: 1,
      metadata: a.metadata ?? {},
    })
    .select('id')
    .single();
  if (error) throw new Error(`asset insert failed: ${error.message}`);

  return { id: data.id, filename, created: true, cachedAt };
}

/**
 * ГЕЙТ ДЕНЕГ для прямого пути (D90, 2026-08-09).
 *
 * Правило Директора от 2026-07-01: после брифа НИКАКАЯ работа не идёт, пока не
 * утверждены настройки эпизода и потолок. Оно было реализовано — но только в
 * `lib/agents/gate.ts:544`, то есть на АГЕНТСКОМ пути (Inngest). Прямые
 * инструменты, которыми теперь работает единый ум, этот гейт не проходят вовсе:
 * `gen-frame`/`gen-video` тратили бы деньги на эпизоде без утверждённого бюджета
 * и без настроек, и никто бы не остановил.
 *
 * На E03/E04 правило не нарушилось только потому, что Директор выставил флаг
 * рукой — то есть держалось его вниманием, а не механикой. Директор: «это
 * must-have до того, как двигаться дальше… не факт, что инструментарий сейчас
 * блокирует отсутствие утверждения автоматически. А это должно быть».
 *
 * Проверяется ДВОЕ, потому что Директор назвал двоих: утверждение бюджета и
 * наличие настроек эпизода (`generation_config` — то, что он выставляет в UI и
 * что с D74 реально управляет инструментом).
 */
export async function assertEpisodeReadyToSpend(episodeId: string): Promise<void> {
  const { data, error } = await sb
    .from('episodes')
    .select('episode_code,budget_ceiling,metadata')
    .eq('id', episodeId)
    .maybeSingle();
  if (error) throw new Error(`проверка бюджета эпизода: ${error.message}`);
  if (!data) throw new Error(`эпизода ${episodeId} нет — RUN_EPISODE_ID указывает в никуда`);

  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const missing: string[] = [];
  if (meta.budget_approved !== true) missing.push('бюджет не утверждён Директором');
  if (data.budget_ceiling === null || data.budget_ceiling === undefined) missing.push('не задан потолок');
  if (!meta.generation_config) missing.push('не заданы настройки эпизода (generation_config)');

  if (missing.length > 0) {
    throw new Error(
      `${data.episode_code}: тратить нельзя — ${missing.join('; ')}. ` +
        'Правило Директора: после брифа работа не идёт, пока не утверждены настройки эпизода ' +
        'и потолок. Их ставит ДИРЕКТОР в Episode Settings — попроси и жди, обойти нечем.',
    );
  }
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

export type MediaKind = 'frame' | 'clip' | 'cut' | 'music' | 'thumb';

/** Тип-префикс — единственное, что связывает изделие со стадией конвейера. */
const MEDIA_AGENT: Readonly<Record<MediaKind, { kindTag: string; agent: string }>> = {
  frame: { kindTag: 'IMG', agent: 'EXEC-EREF' },
  clip: { kindTag: 'VID', agent: 'EXEC-VGEN' },
  cut: { kindTag: 'VID', agent: 'EXEC-STITCH' },
  music: { kindTag: 'AUD', agent: 'EXEC-MGEN' },
  // 2026-08-16: у станции Key Art Artist рук не было вовсе — обложку сгенерировать
  // можно было, а завести в студию нечем. `publish.ts:143` ищет ровно APPROVED
  // `IMG-thumbnail`, не находил и печатал «обложки нет»: работа станции до канала
  // не доезжала так же, как упаковка до правки 13.08.
  thumb: { kindTag: 'IMG', agent: 'EXEC-THUMB' },
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

/**
 * Рецепт изделия — промпт и параметры генерации. Раскладывается в ЭТАЛОННЫЕ
 * формы конвейера (D89/D101/D102 закрыты этой правкой):
 *   кадр → `image_prompt.history[]` + `shot_reference.generation_history[]`
 *          (то, что читают дровер и select_attempt);
 *   клип → плоские поля metadata по образцу exec-vgen (`prompt`, `provider_id`…).
 * Ключа `metadata.recipe` больше НЕТ — четвёртая форма хранения промпта была
 * невидима всему существующему UI.
 */
export interface MediaRecipe {
  /** Промпт дословно, НЕ обрезается — усечённый образец нельзя повторить. */
  prompt: string;
  provider?: string;
  model?: string;
  quality?: string;
  size?: string;
  tier?: string;
  resolution?: string;
  aspect_ratio?: string;
  seed?: number;
  cost_usd?: number;
  references?: Array<{ slug: string; kind: string; asset_id: string; filename: string }>;
}

export interface RegisterMediaArgs {
  episodeId: string;
  kind: MediaKind;
  /** Путь к файлу-изделию. */
  file: string;
  /** `sh01` — обязателен для кадра и клипа; для ката и музыки не нужен. */
  shot?: string;
  /**
   * Статус рождения. По умолчанию REVIEW (R13): изделие ПРЕДЪЯВЛЯЕТСЯ, а не
   * самоутверждается — APPROVED мимо ревью было дырой прямого пути.
   */
  status?: string;
  description?: string;
  origin?: string;
  recipe?: MediaRecipe;
}

/**
 * Эталонный след изделия (Ф1 миграции, R1-R23). Правила, выстраданные E05:
 *
 *  · ВСЕГДА INSERT новой строки `version = max+1` (R1/R2). Перегенерация 09.08
 *    ЗАТЁРЛА четыре одобренных кадра — байты, промпты и историю разом; сравнить
 *    «до/после» стало нечем. Версии — не украшение, а возможность отката.
 *  · Байты через `persistBinary` (R4/R5/R6): кэш + Drive, строка получает
 *    `drive_file_id`/`staging_path` — без них превью не резолвится и ячейка
 *    таймлайна пуста при живом файле.
 *  · Кадр несёт `shot_reference.contract` (R8) — без него демоушен возвращает
 *    null, а уникальный индекс `assets_one_approved_per_shot` бьёт duplicate key
 *    на втором утверждении.
 *  · `logEvent('asset_created')` — realtime-подписки UI заведены от
 *    `activity_events`; изделие без события невидимо до следующего опроса
 *    (жалоба Директора: «фид какие-то вещи не выдавал»).
 */
export async function registerEpisodeMedia(a: RegisterMediaArgs): Promise<PersistAssetResult> {
  const kind = a.kind;
  const shot = (a.shot ?? '').toLowerCase();
  const perShot = kind === 'frame' || kind === 'clip';
  if (perShot && !shot) throw new Error(`registerEpisodeMedia(${kind}): нужен shot, например sh01`);

  const code = await episodeCode(a.episodeId);
  const stem = code.replace(/^SS-/, '').toLowerCase();
  const sid = perShot ? shotIdFor(code, shot) : null;
  const spec = MEDIA_AGENT[kind];
  const status = a.status ?? 'REVIEW';
  const nowIso = new Date().toISOString();

  const fileType =
    kind === 'frame' ? `IMG-episode_ref_${stem.replace(/-/g, '_')}_${shot}`
    : kind === 'clip' ? `VID-shot-${stem}-${shot}`
    : kind === 'cut' ? 'VID-final_cut'
    : kind === 'thumb' ? 'IMG-thumbnail'
    : 'AUD-music-main';
  const slug = perShot
    ? `shot_${shot}`
    : kind === 'cut' ? 'final_cut'
    : kind === 'thumb' ? 'thumbnail'
    : 'music_main';

  // R1/R2: версия = max по (episode, file_type) + 1 — паттерн эталона
  // (`episode-references.ts:2200`). Имя файла выводится ИЗ версии (R3), поэтому
  // старые байты в кэше живут рядом с новыми, а не затираются.
  const { data: verRows, error: verErr } = await sb
    .from('assets')
    .select('version')
    .eq('episode_id', a.episodeId)
    .eq('file_type', fileType)
    .order('version', { ascending: false })
    .limit(1);
  if (verErr) throw new Error(`registerEpisodeMedia(${fileType}): чтение версий — ${verErr.message}`);
  const nextVersion = ((verRows?.[0]?.version as number | undefined) ?? 0) + 1;
  const versionTag = `v${String(nextVersion).padStart(2, '0')}`;
  const filename = `${code}-${spec.kindTag}-${slug}-${versionTag}-${status}${extname(a.file)}`;

  // R4/R5/R6: байты — через тот же persistBinary, что у агентского пути:
  // локальный кэш по каноническому имени + Drive (когда storage=drive_native).
  const src = resolve(process.cwd(), a.file);
  if (!existsSync(src)) throw new Error(`registerEpisodeMedia: файла нет — ${src}`);
  const ext = extname(a.file).slice(1).toLowerCase() as BinaryExt;
  const persisted = await persistBinary({
    base64: readFileSync(src).toString('base64'),
    ext,
    driveFilename: filename,
    episodeCode: code,
    supabase: sb as never,
  });

  const r = a.recipe;
  const metadata: Record<string, unknown> = {
    origin: a.origin ?? 'direct-run',
    source_file: a.file,
  };

  if (kind === 'frame') {
    // R8: контракт эталона — без него ассет невидим демоушену и select_attempt.
    metadata.shot_reference = {
      contract: SHOT_REFERENCE_CONTRACT,
      shot_id: sid,
      generation_history: r
        ? [
            {
              version: nextVersion,
              provider_id: r.provider ?? 'unknown',
              model: r.model ?? 'gen',
              prompt: r.prompt,
              references_used: (r.references ?? []).map((x) => ({
                kind: x.kind,
                bible_asset_id: x.asset_id,
              })),
              strength: null,
              cost_usd: r.cost_usd ?? 0,
              image_url: persisted.browserUrl,
              drive_file_id: persisted.driveFileId,
              drive_web_view_url: persisted.driveWebViewUrl,
              is_4k: false,
              at: nowIso,
              triggered_by: 'director_edit',
              mode_at_time: 3,
            },
          ]
        : [],
      review: null,
      retry_count: 0,
      retry_history: [],
    };
    // D101/D102: промпт живёт там, где его читает дровер, — image_prompt.history.
    if (r) {
      metadata.image_prompt = {
        current_version: nextVersion,
        history: [
          {
            version: nextVersion,
            prompt: r.prompt,
            source: 'director_edit',
            at: nowIso,
            cost_usd: r.cost_usd ?? 0,
            staging_path: persisted.browserUrl,
            drive_file_id: persisted.driveFileId,
            drive_web_view_url: persisted.driveWebViewUrl,
            quality: r.quality ?? null,
            mode_at_time: 3,
          },
        ],
      };
    }
    if (!isShotReferenceV2({ ...metadata })) {
      throw new Error('registerEpisodeMedia: собранный кадр не проходит isShotReferenceV2 — форма разъехалась с контрактом');
    }
  }

  if (kind === 'clip') {
    // Эталон VID — плоские поля (exec-vgen.ts:586): промпт клипа больше не
    // теряется (R22 был: «чем сделан клип, проверить нечем»).
    metadata.shot_id = sid;
    const seconds = mediaDurationSeconds(a.file);
    if (seconds) metadata.duration_seconds = seconds;
    if (r) {
      metadata.prompt = r.prompt;
      if (r.provider) metadata.provider_id = r.provider;
      if (r.model) metadata.model_id = r.model;
      if (r.tier) metadata.quality_tier = r.tier;
      if (r.resolution) metadata.resolution = r.resolution;
      if (r.aspect_ratio) metadata.aspect_ratio = r.aspect_ratio;
      if (r.seed !== undefined) metadata.seed = r.seed;
    }
  }

  if ((kind === 'cut' || kind === 'music') && r) {
    metadata.prompt = r.prompt;
    if (r.provider) metadata.provider_id = r.provider;
  }

  // Демоушен ПЕРЕД вставкой APPROVED: слот «один утверждённый на кадр» держит
  // уникальный индекс; прежний победитель уходит в INVALIDATED тем же кодом,
  // что у кнопки аппрува (`single-approved.ts`). currentId — заглушка: новой
  // строки ещё нет, а демоушен исключает по id.
  if (status === 'APPROVED' || status === 'LOCKED') {
    const slot = resolveSlotDescriptor({
      file_type: fileType,
      episode_id: a.episodeId,
      series_id: null,
      metadata,
      content: null,
    } as never);
    if (slot) {
      await demoteSiblingApproved(sb as never, { slot, currentId: '00000000-0000-0000-0000-000000000000' });
    }
  }

  const { data: inserted, error: insErr } = await sb
    .from('assets')
    .insert({
      episode_id: a.episodeId,
      series_id: null,
      file_type: fileType,
      filename,
      drive_path: persisted.browserUrl,
      staging_path: persisted.browserUrl,
      drive_file_id: persisted.driveFileId,
      drive_web_view_url: persisted.driveWebViewUrl,
      status,
      description: a.description ?? `${kind} ${sid ?? code} · прямой вызов`,
      content: null,
      agent_id: spec.agent,
      version: nextVersion,
      metadata,
    })
    .select('id')
    .single();
  if (insErr) throw new Error(`registerEpisodeMedia insert: ${insErr.message}`);

  // Самопроверка «увидит ли лента» (Ф1.8): те же чистые функции, которыми ячейка
  // резолвит изделие. Строка уже вставлена — отказ громкий, но изделие цело.
  const visible = resolvePreviewSrc({
    id: inserted.id,
    drive_file_id: persisted.driveFileId,
    drive_web_view_url: persisted.driveWebViewUrl,
    drive_path: persisted.browserUrl,
    staging_path: persisted.browserUrl,
    version: nextVersion,
    metadata,
  } as never);
  if (!visible) {
    console.error(
      `ЛЕНТА НЕ УВИДИТ ${filename}: resolvePreviewSrc вернул null — проверь drive/staging поля строки ${inserted.id}`,
    );
  }

  // Событие — то, от чего живут realtime-подписки UI и лента чата (жалоба
  // Директора 09.08: «activity feed какие-то вещи не выдавал»). asset_created
  // есть в whitelist DB-триггера → пузырь в треде; не actionable → платного
  // пробуждения нет.
  await logEvent(sb as never, {
    event_type: 'asset_created',
    title: `${kind} ${sid ?? code} ${versionTag} · ${status}`,
    description: a.description ?? null,
    actor: spec.agent,
    episode_id: a.episodeId,
    asset_id: inserted.id,
    metadata: { file_type: fileType, filename, shot_id: sid, origin: a.origin ?? 'direct-run' },
  });

  return { id: inserted.id, filename, created: true, cachedAt: persisted.absolutePath };
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
