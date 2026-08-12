// ──────────────────────────────────────────────────────────────────────────────
// lib/api/canon-stages.ts
//
// СОСТОЯНИЕ КАНОНА СЕРИИ — ось `ассет × стадия`, которой не существовало.
//
// Канон был единственной сущностью студии без состояния НИГДЕ: матрица кадров
// начинается уже после него (`state-matrix.ts` стартует с `ref_plan`), а гейт
// автора Библии объявлен информационным (`required: []`, «no Inngest function»).
// При этом от канона зависят шесть строк конвейера, и его отказ диагностируется
// как отказ ЭПИЗОДА: пустой канон роняет Reference Artist на префлайте, пустой
// жанр красит раскадровку красным. Директор видит красный эпизод там, где болен
// сериал (решение 20, 2026-08-06).
//
// Форма та же, что у кадра: не один светофор, а ЯЧЕЙКИ. У кадра ось
// `кадр × стадия`, у канона — `ассет × стадия`, стадии свои:
//
//   text → image → verdict → LOCK
//
// Модуль ЧИСТЫЙ: никакого I/O. Вызывающий приносит строки, здесь считается
// состояние — так же, как `buildPipelineSnapshot` считает конвейер.
// ──────────────────────────────────────────────────────────────────────────────

/** Стадии канон-ассета, в порядке прохождения. */
export const CANON_STAGES = ['text', 'image', 'verdict', 'locked'] as const;
export type CanonStage = (typeof CANON_STAGES)[number];

/** Род канон-плиты. Гейт производства требует персонажа И стиль. */
export type CanonKind = 'character' | 'style' | 'location' | 'object' | 'other';

export interface CanonAssetLike {
  id: string;
  file_type: string;
  status: string;
  filename?: string | null;
  content?: string | null;
  description?: string | null;
  drive_path?: string | null;
  drive_file_id?: string | null;
  staging_path?: string | null;
}

export interface CanonPlateState {
  id: string;
  /** Слаг без префикса `SBL-`: `character_sandy_hourglass`. */
  slug: string;
  kind: CanonKind;
  status: string;
  /** Есть непустой текст — описание, которое приёмщик читает ДОСЛОВНО. */
  hasText: boolean;
  /** Есть носитель картинки: адрес в записи или файл. */
  hasImage: boolean;
  /** Вердикт критика, если он вообще выносился. */
  verdict: 'PASS' | 'REVISE' | 'FAIL' | null;
  /** Докуда плита дошла. `locked` — конец пути. */
  stage: CanonStage;
  /** Стадия, на которой плита стоит, или null если пройдена целиком. */
  blockedAt: CanonStage | null;
}

export interface CanonSnapshot {
  plates: CanonPlateState[];
  /** Сколько плит закрыто до LOCK — числитель ячеек этой оси. */
  locked: number;
  total: number;
  /** Гейт производства: хотя бы один LOCKED персонаж И один LOCKED стиль. */
  productionReady: boolean;
  /**
   * Почему производство не поедет — на языке СЕРИИ, а не эпизода. Пусто, когда
   * канон готов. Это ровно та строка, которой не хватало: без неё Директор
   * читал «эпизод сломан» вместо «у сериала нет запертого стиля».
   */
  blockers: string[];
}

const KIND_BY_PREFIX: ReadonlyArray<[string, CanonKind]> = [
  ['character_', 'character'],
  ['style_', 'style'],
  ['location_', 'location'],
  ['object_', 'object'],
];

function kindOf(slug: string): CanonKind {
  for (const [prefix, kind] of KIND_BY_PREFIX) if (slug.startsWith(prefix)) return kind;
  return 'other';
}

/** Вердикт критика из текста — та же форма, что читает конвейер. */
function verdictOf(a: CanonAssetLike): CanonPlateState['verdict'] {
  const haystack = `${a.description ?? ''}\n${a.content ?? ''}`;
  const m = /verdict\s+(PASS_WITH_UNCERTAINTY|PASS|REVISE|FAIL)/i.exec(haystack)
    ?? /"verdict"\s*:\s*"(PASS_WITH_UNCERTAINTY|PASS|REVISE|FAIL)"/i.exec(haystack);
  if (!m) return null;
  const v = m[1].toUpperCase();
  if (v === 'REVISE') return 'REVISE';
  if (v === 'FAIL') return 'FAIL';
  return 'PASS';
}

function hasImage(a: CanonAssetLike): boolean {
  return Boolean(a.drive_path || a.drive_file_id || a.staging_path);
}

function hasText(a: CanonAssetLike): boolean {
  return Boolean((a.content ?? a.description ?? '').trim());
}

/**
 * Состояние одной плиты. Стадии проходятся по порядку: нет текста — нечего
 * рисовать; нет картинки — нечего судить; нет вердикта — нечего запирать.
 */
export function canonPlateState(a: CanonAssetLike): CanonPlateState {
  const slug = a.file_type.replace(/^SBL-/, '');
  const text = hasText(a);
  const image = hasImage(a);
  const verdict = verdictOf(a);
  const locked = a.status === 'LOCKED';

  let stage: CanonStage = 'text';
  let blockedAt: CanonStage | null = 'text';
  if (locked) {
    stage = 'locked';
    blockedAt = null;
  } else if (verdict === 'PASS' || a.status === 'APPROVED') {
    // Принята, но не заперта: путь пройден до последней двери.
    stage = 'verdict';
    blockedAt = 'locked';
  } else if (image) {
    stage = 'image';
    blockedAt = 'verdict';
  } else if (text) {
    stage = 'text';
    blockedAt = 'image';
  }

  return { id: a.id, slug, kind: kindOf(slug), status: a.status, hasText: text, hasImage: image, verdict, stage, blockedAt };
}

/**
 * Снимок канона серии. Принимает ВСЕ ассеты серии; отбирает `SBL-*` сам, чтобы
 * вызывающему не приходилось знать префикс — знание о том, что такое канон,
 * живёт здесь.
 */
export function buildCanonSnapshot(assets: readonly CanonAssetLike[]): CanonSnapshot {
  const plates = assets
    .filter((a) => a.file_type.startsWith('SBL-'))
    .map(canonPlateState)
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const lockedOf = (kind: CanonKind) => plates.filter((p) => p.kind === kind && p.stage === 'locked').length;
  const lockedCharacters = lockedOf('character');
  const lockedStyles = lockedOf('style');

  const blockers: string[] = [];
  if (plates.length === 0) {
    blockers.push('канона нет вовсе — у серии не заведено ни одной плиты');
  } else {
    // Тот же порог, что уже стоит в префлайте генерации референсов: без запертого
    // персонажа и стиля эпизодным кадрам не на чём стоять.
    if (lockedCharacters === 0) blockers.push('нет ни одного LOCKED персонажа');
    if (lockedStyles === 0) blockers.push('нет ни одного LOCKED стиля');
    const stuck = plates.filter((p) => p.blockedAt && p.blockedAt !== 'locked');
    if (stuck.length > 0) {
      blockers.push(
        `не доведены до конца: ${stuck.map((p) => `${p.slug} (ждёт ${p.blockedAt})`).join(', ')}`,
      );
    }
  }

  return {
    plates,
    locked: plates.filter((p) => p.stage === 'locked').length,
    total: plates.length,
    productionReady: lockedCharacters > 0 && lockedStyles > 0,
    blockers,
  };
}
