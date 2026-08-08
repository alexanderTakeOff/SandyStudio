// Мост реестра (Ф4.1): 14 CLI-инструментов доступны in-process, схемы выводятся
// из той же меты, что docs/TOOLS.md, валидация — та же, env — per-вызов.
//
// Сам ИМПОРТ моста — уже половина проверки: без harness-флага импорт любого
// инструмента пошёл бы CLI-путём, начал парсить argv vitest'а и завершил процесс.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import {
  mindToolSpecs,
  mindToolSchemas,
  toFunctionSchema,
  invokeMindTool,
  applyDraftDefault,
  collectImages,
} from '@/lib/mind/tool-bridge';
import { runEnvStore, runEnv } from '../../../scripts/run/_env';

describe('мост реестра: регистрация', () => {
  it('в мосту зарегистрирован КАЖДЫЙ инструмент из scripts/run — набор выводится из папки, не из ручного списка', () => {
    // Ручной список уже соврал один раз: первый вариант моста забыл write-asset,
    // и 13 импортов выглядели как 14. Ожидание считается так же, как в самом
    // реестре (tools-registry.ts): все .ts из папки минус каркасы @not-a-tool.
    const runDir = resolve(process.cwd(), 'scripts/run');
    const expected = readdirSync(runDir)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => {
        const firstLine = readFileSync(join(runDir, f), 'utf-8').split('\n', 1)[0] ?? '';
        return !firstLine.includes('@not-a-tool');
      })
      .map((f) => f.replace(/\.ts$/, ''))
      .sort();
    const registered = mindToolSpecs().map((s) => s.name).sort();
    expect(registered).toEqual(expected);
    expect(registered.length).toBeGreaterThanOrEqual(14);
  });
});

describe('мост реестра: схемы из меты', () => {
  it('обязательность и закрытые наборы доезжают до function-calling схемы', () => {
    const spec = mindToolSpecs().find((s) => s.name === 'set-status')!;
    const schema = toFunctionSchema(spec);
    expect(schema.function.name).toBe('set-status');
    // `id` и `status` обязательны (нет default), `reason` — нет.
    expect(schema.function.parameters.required).toContain('id');
    expect(schema.function.parameters.required).toContain('status');
    expect(schema.function.parameters.required).not.toContain('reason');
    // Закрытый набор статусов стал enum — модель не может прислать LOCKED.
    expect(schema.function.parameters.properties.status.enum).toContain('APPROVED');
    expect(schema.function.parameters.properties.status.enum).not.toContain('LOCKED');
  });

  it('у каждого инструмента есть схема с описанием', () => {
    for (const schema of mindToolSchemas()) {
      expect(schema.function.description.length).toBeGreaterThan(0);
      expect(schema.function.parameters.type).toBe('object');
    }
  });
});

describe('мост реестра: отказы громкие и адресные', () => {
  it('неизвестный инструмент — отказ с адресом реестра', async () => {
    const res = await invokeMindTool('no-such-tool', {}, {});
    expect(res.ok).toBe(false);
    expect(res.output).toContain('no-such-tool');
    expect(res.output).toContain('docs/TOOLS.md');
  });

  it('неизвестный аргумент режется валидацией ДО работы', async () => {
    const res = await invokeMindTool('set-status', { id: 'x', status: 'DRAFT', bogus: '1' }, {});
    expect(res.ok).toBe(false);
    expect(res.output).toContain('неизвестный флаг --bogus');
  });

  it('пропущенный обязательный аргумент называется по имени', async () => {
    const res = await invokeMindTool('set-status', { status: 'DRAFT' }, {});
    expect(res.ok).toBe(false);
    expect(res.output).toContain('--id');
  });

  it('объявленный env без значения — отказ с объяснением, не тихий пропуск', async () => {
    const res = await invokeMindTool('write-asset', { type: 'SCR-script', file: 'inline:x' }, {});
    expect(res.ok).toBe(false);
    expect(res.output).toContain('RUN_EPISODE_ID');
  });
});

describe('per-вызов env через AsyncLocalStorage', () => {
  it('контекст вызова побеждает process.env и не течёт наружу', () => {
    const before = process.env.RUN_SERIES_ID;
    const inside = runEnvStore.run({ RUN_SERIES_ID: 'series-from-context' }, () =>
      runEnv('RUN_SERIES_ID'),
    );
    expect(inside).toBe('series-from-context');
    expect(process.env.RUN_SERIES_ID).toBe(before);
  });

  it('два конкурентных контекста не видят значений друг друга', async () => {
    const [a, b] = await Promise.all([
      runEnvStore.run({ RUN_EPISODE_ID: 'ep-A' }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return runEnv('RUN_EPISODE_ID');
      }),
      runEnvStore.run({ RUN_EPISODE_ID: 'ep-B' }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return runEnv('RUN_EPISODE_ID');
      }),
    ]);
    expect(a).toBe('ep-A');
    expect(b).toBe('ep-B');
  });
});

describe('D71: bridge-умолчание статуса', () => {
  it('gen-frame/register-canon уходят в DRAFT, если ум статус не назвала', () => {
    const given: Record<string, string> = { 'prompt-file': 'x.txt' };
    applyDraftDefault('gen-frame', given);
    expect(given.status).toBe('DRAFT');
  });

  it('явный статус от ума не перезаписывается', () => {
    const given: Record<string, string> = { status: 'APPROVED' };
    applyDraftDefault('register-canon', given);
    expect(given.status).toBe('APPROVED');
  });

  it('тулы вне списка (не пишут медиа) статус не трогают', () => {
    const given: Record<string, string> = {};
    applyDraftDefault('write-asset', given);
    expect(given.status).toBeUndefined();
  });
});

describe('D70: мост возвращает уму картинку через show-asset', () => {
  it('без явного --out мост подставляет временный путь и читает байты обратно', async () => {
    // show-asset ищет строку в базе по RUN_SERIES_ID/RUN_EPISODE_ID — оба
    // недекларированы здесь нарочно: интересует не успех поиска (для этого
    // нужна живая база — доказано прогоном «Зрачок-2»), а то, что отказ
    // приходит ПОСЛЕ попытки подставить `out`, не раньше валидации.
    const res = await invokeMindTool('show-asset', { type: 'SCR-script' }, {});
    expect(res.ok).toBe(false);
    expect(res.images).toBeUndefined();
  });

  it('кадр: show-asset дописывает расширение к --out — collectImages находит файл по базовому имени', () => {
    // Ровно то расхождение путей, которое и было опасно: мост просит записать
    // по `<dir>/out`, а show-asset реально пишет `<dir>/out.png` (extname
    // дописывается внутри самого show-asset, не мостом).
    const dir = mkdtempSync(join(tmpdir(), 'ss-mind-test-'));
    try {
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      writeFileSync(join(dir, 'out.png'), bytes);
      const images = collectImages(join(dir, 'out'));
      expect(images).toHaveLength(1);
      expect(images[0].mediaType).toBe('image/png');
      expect(Buffer.from(images[0].base64, 'base64').equals(bytes)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('видео: show-asset превращает --out в директорию с полосой кадров — collectImages читает все', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ss-mind-test-'));
    try {
      const outDir = join(dir, 'out');
      const a = Buffer.from([1, 2, 3]);
      const b = Buffer.from([4, 5, 6]);
      mkdirSync(outDir);
      writeFileSync(join(outDir, '01.png'), a);
      writeFileSync(join(outDir, '02.png'), b);
      const images = collectImages(outDir);
      expect(images).toHaveLength(2);
      expect(Buffer.from(images[0].base64, 'base64').equals(a)).toBe(true);
      expect(Buffer.from(images[1].base64, 'base64').equals(b)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('пустой out — пустой список, не отказ', () => {
    expect(collectImages('')).toEqual([]);
  });

  it('несуществующий путь — пустой список', () => {
    expect(collectImages('/nowhere/really/out')).toEqual([]);
  });
});
