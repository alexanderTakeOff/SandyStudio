// Сторож правила «названная версия заводит СОСЕДА, а не переименовывает строку».
//
// Очередь Полины п.8 (12.08): контракт `write-asset` печатал «новая версия заводит
// соседа, не затирает историю», а вызов `--type SCR-script --version v02` поверх
// живого `v01-DRAFT` вернул тот же uuid — строка была ПЕРЕИМЕНОВАНА, v01 исчез.
// Сравнить работу автора с работой критика стало нечем.
//
// Итерация DRAFT на месте остаётся умолчанием — но только пока версию не назвали.

import { describe, it, expect } from 'vitest';
import { shouldForkNewVersion, versionFromFilename } from '../../scripts/run/_asset';

describe('версия из имени файла', () => {
  it('читается из канонического имени', () => {
    expect(versionFromFilename('SS-S20-E07-SCR-script-v02-REVIEW.md')).toBe(2);
    expect(versionFromFilename('SS-S20-SBL-character_x-v11-LOCKED.png')).toBe(11);
  });

  it('отсутствует, когда имени нет вовсе (починка существующей строки)', () => {
    expect(versionFromFilename(undefined)).toBeNull();
  });
});

describe('когда заводится соседняя версия', () => {
  const base = {
    existingVersion: 1,
    existingStatus: 'DRAFT',
    askedVersion: null as number | null,
    contentChanged: true,
    touchesLocked: false,
  };

  it('НАЗВАННАЯ версия заводит соседа даже поверх DRAFT — это и был п.8', () => {
    expect(shouldForkNewVersion({ ...base, askedVersion: 2 })).toBe(true);
  });

  it('без названной версии DRAFT по-прежнему итерируется НА МЕСТЕ', () => {
    expect(shouldForkNewVersion({ ...base, askedVersion: null })).toBe(false);
  });

  it('та же версия, что у строки, — обычное обновление, не соседа', () => {
    expect(shouldForkNewVersion({ ...base, askedVersion: 1 })).toBe(false);
  });

  it('правка после выхода из черновика заводит соседа и без имени', () => {
    expect(
      shouldForkNewVersion({ ...base, existingStatus: 'APPROVED', askedVersion: null }),
    ).toBe(true);
  });

  it('касание LOCKED заводит соседа всегда', () => {
    expect(
      shouldForkNewVersion({
        ...base,
        existingStatus: 'LOCKED',
        contentChanged: false,
        touchesLocked: true,
        askedVersion: null,
      }),
    ).toBe(true);
  });
});
