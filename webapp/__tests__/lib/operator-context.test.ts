// Сторож закона «контекст оператора выводится из МАРШРУТА» (uiux.md §8.0).
//
// Закон без сторожа держится ровно до следующей правки: до 12.08 «где я»
// вычисляли четверо независимо, и их ответы разошлись — дропдаун показывал один
// сериал, страница другой. Разбор пути теперь один, и он проверяем.
import { describe, expect, it } from 'vitest';
import { contextFromPath } from '../../lib/operator-context';

const EP = '23b4302d-f06d-4512-ade0-28e885daa2a7';
const SE = '42f14df0-d1a2-4bb7-b7df-8f1819fac6a7';

describe('contextFromPath', () => {
  it('страница эпизода = контекст эпизода', () => {
    const c = contextFromPath(`/episodes/${EP}`);
    expect(c.kind).toBe('episode');
    expect(c.episodeId).toBe(EP);
    expect(c.tab).toBe('episodes');
  });

  it('страница сериала = контекст сериала, серия берётся из пути', () => {
    const c = contextFromPath(`/series/${SE}?tab=bible`);
    expect(c.kind).toBe('series');
    expect(c.seriesIdFromPath).toBe(SE);
  });

  it('списки и вкладки сущности не задают — это студия плюс скоуп', () => {
    for (const path of ['/', '/episodes', '/series', '/factory', '/audience']) {
      const c = contextFromPath(path);
      expect(c.kind).toBe('studio');
      expect(c.episodeId).toBeNull();
      expect(c.seriesIdFromPath).toBeNull();
    }
  });

  it('не-uuid в сегменте сущностью не считается', () => {
    expect(contextFromPath('/episodes/new').kind).toBe('studio');
    expect(contextFromPath('/series/undefined').kind).toBe('studio');
  });

  it('вкладка = первый сегмент пути — её ум получает как обстановку', () => {
    expect(contextFromPath('/factory').tab).toBe('factory');
    expect(contextFromPath(`/series/${SE}`).tab).toBe('series');
    expect(contextFromPath('/').tab).toBe('');
  });
});
