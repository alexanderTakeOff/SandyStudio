// Сторож реестра инструментария (Ф0 новой парадигмы).
//
// Постановка Директора: «реестр не может быть документом, который кто-то обязан помнить
// обновить. Он должен выводиться из кода и ЛОМАТЬ сборку/прогон, когда разошёлся с ним».
// Вот это место, где он ломает. Тест не проверяет содержимое реестра — он проверяет, что
// реестр всё ещё равен коду, из которого выведен.
//
// Падает — чинится не тест, а одно из двух:
//   • «декларация врёт про таблицы» → дописать таблицу в `reads`/`writes` инструмента;
//   • «docs/TOOLS.md устарел»      → `npx tsx scripts/tools-registry.ts --write` из `webapp/`.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('реестр инструментария', () => {
  it('совпадает с кодом, из которого выведен', () => {
    const cwd = resolve(__dirname, '../..');
    let output = '';
    let failed = false;
    try {
      output = execFileSync('npx', ['tsx', 'scripts/tools-registry.ts'], {
        cwd,
        encoding: 'utf-8',
        shell: process.platform === 'win32',
      });
    } catch (e) {
      failed = true;
      const err = e as { stdout?: string; stderr?: string };
      output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
    expect(failed ? output : '').toBe('');
  }, 120_000);
});
