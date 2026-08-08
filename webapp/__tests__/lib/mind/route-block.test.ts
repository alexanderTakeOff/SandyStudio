// Карта маршрута в промпте ума — сторож переноса (D86, 2026-08-09).
//
// Три прогона записали, каким инструментом что делается. Записали в `ss-run` —
// скилл Тео. В голову ума это не попало ни разу, и каждая станция вскрывала дыру
// поштучно на живом прогоне: кастинга нет, uuid не достать, сториборд без
// контракта. Между «записано» и «у неё в промпте» не было ни одного шага —
// ни в плане, ни в задачах, ни в проверке.
//
// Поэтому здесь не «проверка текста», а замена памяти механизмом: если карта
// перестанет собираться из реестра, или у станции пропадёт инструмент, или
// исчезнет гейт Директора — валится тест, а не выясняется через месяц на прогоне.
import { describe, it, expect } from 'vitest';

import { buildMindPromptParts } from '@/lib/mind/prompt';
import { ROW_DEFINITIONS } from '@/lib/api/pipeline-stages';

/** Минимальный контекст: карта не зависит от эпизода, только от реестров. */
function routeText(
  tools: ReadonlyArray<{ name: string; stations?: readonly string[] }> = [],
  skills: ReadonlyArray<{ slug: string; summary: string; agents?: readonly string[] }> = [],
): string {
  const { stable } = buildMindPromptParts({ doctrine: 'доктрина-заглушка', tools, skills });
  const from = stable.indexOf('[МАРШРУТ');
  expect(from).toBeGreaterThanOrEqual(0);
  const to = stable.indexOf('[ПРАВИЛА');
  return stable.slice(from, to > from ? to : undefined);
}

describe('карта маршрута — состав станций', () => {
  it('перечисляет ВСЕ станции реестра: карта не может быть подмножеством конвейера', () => {
    const text = routeText();
    for (const r of ROW_DEFINITIONS) {
      expect(text, `станция ${r.id} потерялась в карте`).toContain(`[${r.id}]`);
    }
  });

  it('называет кастинг — станцию, которую ум пропустил на E04, не зная о ней', () => {
    expect(routeText()).toContain('[casting]');
  });

  it('отделяет вход Директора от собственной работы ума', () => {
    const text = routeText();
    // series_canon / brief / casting / music_generator объявлены `role: input`.
    const inputs = ROW_DEFINITIONS.filter((r) => r.role === 'input');
    expect(inputs.length).toBeGreaterThan(0);
    expect(text).toContain('ВХОД ДИРЕКТОРА');
  });
});

describe('карта маршрута — инструменты выводятся из самих инструментов', () => {
  it('ставит инструмент к станции, которую он объявил', () => {
    const text = routeText([{ name: 'gen-frame', stations: ['episode_references'] }]);
    const line = text.split('\n').find((l) => l.includes('инструменты: gen-frame'));
    expect(line, 'gen-frame не встал к своей станции').toBeTruthy();
  });

  it('инструмент без станций уходит в СКВОЗНЫЕ, а не молча исчезает', () => {
    const text = routeText([{ name: 'show-asset', stations: [] }]);
    expect(text).toContain('Сквозные инструменты');
    expect(text).toContain('show-asset');
  });

  it('станция без инструмента говорит об этом ВСЛУХ — молчание тут и есть дефект', () => {
    // Ни одного инструмента не передано → каждая рабочая станция обязана
    // признаться. Это ровно то, что весь вечер выяснялось поштучно вживую.
    const text = routeText([]);
    expect(text).toContain('инструмента ПОКА НЕТ');
  });

  it('у станции ВХОДА Директора отсутствие инструмента НЕ объявляется дефектом', () => {
    const text = routeText([]);
    const lines = text.split('\n');
    const idx = lines.findIndex((l) => l.includes('[series_canon]'));
    expect(idx).toBeGreaterThanOrEqual(0);
    // Следующая строка после входной станции не должна кричать про инструмент.
    expect(lines[idx + 1] ?? '').not.toContain('инструмента ПОКА НЕТ');
  });
});

describe('карта маршрута — скиллы встают по станциям сами', () => {
  it('скилл попадает на станцию через пересечение agents, без ручной связки', () => {
    const text = routeText(
      [],
      [{ slug: 'storyboarder-cosmic-horror', summary: 'жанр', agents: ['EXEC-SB'] }],
    );
    expect(text).toContain('storyboarder-cosmic-horror');
    const line = text.split('\n').find((l) => l.includes('скиллы (тело — getSkill)'));
    expect(line).toBeTruthy();
  });

  it('скилл без agents станцию не подсвечивает (и не падает)', () => {
    const text = routeText([], [{ slug: 'ничей-скилл', summary: 'без скоупа' }]);
    expect(text).not.toContain('ничей-скилл');
  });
});

describe('карта маршрута — правила Директора, которых нет в реестре', () => {
  it('ставит ГЕЙТЫ Директора: после критика сценария, сториборда, рефов и шотов', () => {
    const text = routeText();
    const gates = text.split('\n').filter((l) => l.includes('ГЕЙТ'));
    expect(gates.length).toBe(4);
  });

  it('объявляет ПИЛОТЫ: первые два рефа и два характерных шота, а не весь набор', () => {
    const text = routeText();
    expect(text).toContain('ПЕРВЫЕ ДВА рефа');
    expect(text).toContain('два ХАРАКТЕРНЫХ шота');
  });

  it('дистрибуция и аналитика — только по явному указанию в брифе', () => {
    const text = routeText();
    expect(text).toContain('ТОЛЬКО если в брифе');
    expect(text).toContain('НЕ ДЕЛАТЬ ВОВСЕ');
  });

  it('критик — второй проход ума, а не пятнадцать помощников под рукой', () => {
    const text = routeText();
    expect(text).toContain('не отдельное лицо и не помощник');
    // Мера перепроверки — лист ожиданий, а не «перечитала, нормально».
    expect(text).toContain('лист ожиданий');
  });
});
