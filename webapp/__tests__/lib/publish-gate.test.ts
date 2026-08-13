// Сторож гейта упаковки: изделие не уезжает на канал недооформленным.
//
// Инцидент E07 (13.08): `SPC-metadata` был написан русскими заголовками
// («## Заголовок» вместо «## Title»), разбор вернул пустоту по всем трём полям,
// пустой заголовок молча подменился кодом эпизода — на канал уехало бы
// «SS-S20-E07» с пустым описанием и без тегов.
//
// Два независимых свойства, два набора тестов:
//   (а) секции не найдены → сырые поля пусты → отказ;
//   (б) секции найдены, тело кириллицей при английском канале → отказ.
// Их нельзя проверять одним кейсом: в (а) кириллицы в полях НЕТ вовсе — поля пусты.

import { describe, it, expect } from 'vitest';
import { assertPublishable, extractRawMetadata, parseVideoMetadata } from '@/lib/publish-metadata';

const RUSSIAN_HEADERS = `# SS-S20-E07 — упаковка

## Заголовок
NOTHING LARGE IS ONE

## Описание
Немой этюд о расстоянии.

## Теги
deep sea, abyss
`;

const ENGLISH = `# SS-S20-E07 — packaging

## Title
NOTHING LARGE IS ONE — a silent essay on the distance that makes a colony look like a beast

## Description
A bathyscaphe drifts past something too large to be seen at once.

## Tags
deep sea, abyss, silent film, bioluminescence
`;

const ENGLISH_HEADERS_RUSSIAN_BODY = `## Title
НИЧТО БОЛЬШОЕ НЕ ЕДИНО

## Description
Немой этюд о расстоянии.

## Tags
глубина, бездна
`;

describe('(а) секции не найдены — сырой разбор пуст, гейт отказывает', () => {
  it('русские заголовки не находятся и дают пустоту по всем трём полям', () => {
    const raw = extractRawMetadata(RUSSIAN_HEADERS);
    expect(raw.title).toBe('');
    expect(raw.description).toBe('');
    expect(raw.tags).toEqual([]);
  });

  it('гейт называет недостающие секции', () => {
    const raw = extractRawMetadata(RUSSIAN_HEADERS);
    expect(() => assertPublishable(raw, { source: 'SS-S20-E07-SPC-metadata-v01' })).toThrow(
      /## Title.*## Description.*## Tags/s,
    );
  });

  it('ФОЛБЭК скрывал этот случай — поэтому гейт смотрит на СЫРОЙ разбор', () => {
    // Ровно то, что делают EXEC-PUB и шорт-роут: передают fallbackTitle.
    const parsed = parseVideoMetadata(RUSSIAN_HEADERS, 'SS-S20-E07');
    expect(parsed.title).toBe('SS-S20-E07'); // непустой — проверка по нему бесполезна
    expect(extractRawMetadata(RUSSIAN_HEADERS).title).toBe(''); // а сырой разбор честен
  });
});

describe('(б) секции найдены — гейт смотрит на язык канала', () => {
  it('кириллица в теле при английском канале — отказ', () => {
    const raw = extractRawMetadata(ENGLISH_HEADERS_RUSSIAN_BODY);
    expect(raw.title).not.toBe('');
    expect(() =>
      assertPublishable(raw, { source: 'meta-v01', language: 'en' }),
    ).toThrow(/кириллица/i);
  });

  it('та же кириллица на русскоязычном канале проходит', () => {
    const raw = extractRawMetadata(ENGLISH_HEADERS_RUSSIAN_BODY);
    expect(() => assertPublishable(raw, { source: 'meta-v01', language: 'ru' })).not.toThrow();
  });

  it('английская упаковка проходит и несёт все три поля', () => {
    const raw = extractRawMetadata(ENGLISH);
    expect(raw.title.length).toBeGreaterThan(20);
    expect(raw.description.length).toBeGreaterThan(20);
    expect(raw.tags).toContain('bioluminescence');
    expect(() => assertPublishable(raw, { source: 'meta-v03', language: 'en' })).not.toThrow();
  });
});
