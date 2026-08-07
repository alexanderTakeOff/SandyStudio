// Промпт единого ума (Ф4.3): цитирует доктрину, а не пересказывает; закрывает
// B13 (черновик = ассет) и B14 («сделано» только с предъявлением) текстом.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMindPrompt, loadDoctrine, clearDoctrineCache } from '@/lib/mind/prompt';

const DOCTRINE_PATH = resolve(process.cwd(), '..', 'docs', 'doctrine', 'paradigm-architecture.md');

describe('доктрина в промпте', () => {
  it('loadDoctrine отдаёт тридцать строк ДОСЛОВНО из файла', () => {
    clearDoctrineCache();
    const doctrine = loadDoctrine();
    const raw = readFileSync(DOCTRINE_PATH, 'utf-8');
    // Каждая пронумерованная строка файла присутствует в выжимке дословно.
    const numbered = raw.split('\n').filter((l) => /^\d+\. /.test(l));
    expect(numbered.length).toBe(30);
    for (const line of numbered) {
      expect(doctrine).toContain(line);
    }
  });

  it('промпт содержит доктрину дословно — цитата, не пересказ', () => {
    const doctrine = loadDoctrine();
    const prompt = buildMindPrompt({ doctrine });
    expect(prompt).toContain(doctrine);
  });

  it('без доктрины промпт НЕ собирается — громкий отказ', () => {
    expect(() => buildMindPrompt({ doctrine: '  ' })).toThrow(/доктрин/);
  });
});

describe('дыры единого разума закрыты текстом', () => {
  const prompt = buildMindPrompt({ doctrine: loadDoctrine() });

  it('B14: «сделано» только со ссылкой на строку ассета', () => {
    expect(prompt).toMatch(/«Сделано» — ТОЛЬКО со ссылкой на строку ассета/);
    expect(prompt).toContain('показано выше');
  });

  it('B13: длинное изделие — ассет DRAFT, не реплика', () => {
    expect(prompt).toContain('write-asset');
    expect(prompt).toContain('DRAFT');
    expect(prompt).toMatch(/НИКОГДА не живёт в\s+реплике чата/);
  });

  it('хард-лимиты Директора названы все четыре', () => {
    expect(prompt).toMatch(/публикация · LOCK · бюджет · смена режима/);
  });

  it('гейты до трат: цена и остаток потолка перед платным вызовом', () => {
    expect(prompt).toContain('остаток потолка');
  });

  it('тред = эпизод: чужой сериал — чужой тред', () => {
    expect(prompt).toMatch(/чужой сериал —\s+чужой тред/i);
  });
});

describe('рабочий контекст', () => {
  it('деньги видны в момент решения; незаданный потолок называется вслух', () => {
    const withCeiling = buildMindPrompt({
      doctrine: loadDoctrine(),
      series: { code: 'SS-S20', title: 'Глубина' },
      episode: { code: 'SS-S20-E02', title: 'Зрачок', ceiling: 50, spent: 12.34 },
    });
    expect(withCeiling).toContain('$12.34 из потолка $50.00');

    const noCeiling = buildMindPrompt({
      doctrine: loadDoctrine(),
      episode: { code: 'SS-S20-E02', title: 'Зрачок', ceiling: null, spent: 0 },
    });
    expect(noCeiling).toContain('потолок НЕ ЗАДАН');
  });

  it('студийный тред без эпизода говорит об этом прямо', () => {
    const prompt = buildMindPrompt({ doctrine: loadDoctrine() });
    expect(prompt).toContain('Тред студийный');
  });
});
