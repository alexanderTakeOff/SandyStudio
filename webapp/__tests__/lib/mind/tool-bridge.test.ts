// Мост реестра (Ф4.1): 14 CLI-инструментов доступны in-process, схемы выводятся
// из той же меты, что docs/TOOLS.md, валидация — та же, env — per-вызов.
//
// Сам ИМПОРТ моста — уже половина проверки: без harness-флага импорт любого
// инструмента пошёл бы CLI-путём, начал парсить argv vitest'а и завершил процесс.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  mindToolSpecs,
  mindToolSchemas,
  toFunctionSchema,
  invokeMindTool,
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
