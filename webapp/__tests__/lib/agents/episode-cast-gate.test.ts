// Гейт каста (2026-08-09) — регрессия SS-S20-E04.
//
// Ум написал каст красивой markdown-таблицей с настоящим рассуждением (какой канон
// цеплять до кадра-поворота, какой после) — и это было бесполезно: `parseCastSlugs`
// читает ТОЛЬКО `metadata.cast` или fenced ```json, поэтому машина не увидела
// ничего, `loadEpisodeCast` вернул null, и эпизод молча пошёл на ВСЁМ каноне серии.
// Каст лежал, выглядел проведённым и не работал.
//
// Причина не в исполнителе: `castEpisode` (он держал форму) был срезан кил-листом
// Ф4, а `write-asset` принимает любой текст и о форме не знает. Гейт — вторая
// линия: инструмент вернули, но обойти его теперь нельзя ничем.
import { describe, it, expect } from 'vitest';

import { assertCastApprovable, EPISODE_CAST_FILE_TYPE } from '@/lib/agents/episode-cast';

const PROSE = `# SPC-episode_cast — SS-S20-E04

| Роль | Канон | Что тянем |
|---|---|---|
| Герой | character_bathyscaphe_turnaround | identity |
| Стиль | style_s20_style_canon_v1 | style |
`;

const WITH_JSON = `${PROSE}

\`\`\`json
{"cast":["character_bathyscaphe_turnaround","style_s20_style_canon_v1"]}
\`\`\`
`;

describe('assertCastApprovable', () => {
  it('НЕ пускает в REVIEW каст, который машина не прочитает', () => {
    expect(() => assertCastApprovable(EPISODE_CAST_FILE_TYPE, 'REVIEW', PROSE, {})).toThrow(
      /машиночитаемого списка канона/,
    );
  });

  it('называет, чем чинить — форму и штатный инструмент', () => {
    try {
      assertCastApprovable(EPISODE_CAST_FILE_TYPE, 'REVIEW', PROSE, {});
      throw new Error('гейт не сработал');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('metadata.cast');
      expect(msg).toContain('castEpisode');
      // Тихий откат на весь канон — это и есть цена, её надо назвать.
      expect(msg).toContain('ВСЁМ каноне серии');
    }
  });

  it('пропускает каст с fenced json в теле', () => {
    expect(() =>
      assertCastApprovable(EPISODE_CAST_FILE_TYPE, 'REVIEW', WITH_JSON, {}),
    ).not.toThrow();
  });

  it('пропускает каст со слагами в metadata (путь штатного инструмента)', () => {
    expect(() =>
      assertCastApprovable(EPISODE_CAST_FILE_TYPE, 'APPROVED', PROSE, {
        cast: ['character_bathyscaphe_turnaround'],
      }),
    ).not.toThrow();
  });

  it('гейтит и LOCKED — замок на нечитаемом касте хуже, чем его отсутствие', () => {
    expect(() => assertCastApprovable(EPISODE_CAST_FILE_TYPE, 'LOCKED', PROSE, {})).toThrow();
  });

  it('НЕ гейтит DRAFT — черновик волен быть прозой, пока его пишут', () => {
    expect(() => assertCastApprovable(EPISODE_CAST_FILE_TYPE, 'DRAFT', PROSE, {})).not.toThrow();
  });

  it('не трогает изделия других типов', () => {
    expect(() => assertCastApprovable('SCR-script', 'APPROVED', PROSE, {})).not.toThrow();
    expect(() => assertCastApprovable('STB-storyboard', 'APPROVED', null, {})).not.toThrow();
  });
});
