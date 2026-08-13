// Сторож закона, который жил в комментарии и потому был нарушен.
//
// `start-stack.ps1` несёт в шапке правило (строки ~52-57): весь текст в СТРОКОВЫХ
// ЛИТЕРАЛАХ — только ASCII. `powershell.exe` 5.1 читает .ps1 без BOM как ANSI:
// кириллица в комментариях безвредна (парсер их пропускает), а в литерале рвёт
// разбор, и скрипт падает ParserError'ом вместо того, чтобы работать.
//
// 12.08 я добавил в лаунчер строку `'== starting telegram-bot (пульт) =='` — и
// 13.08 стек не поднялся вовсе: `Missing closing '}' in statement block`. Правило
// было записано, прочитано и всё равно нарушено, потому что напоминать его было
// некому. Правило без сторожа не считается записанным (CLAUDE.md §11 п.9).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CYRILLIC = /[Ѐ-ӿ]/;

/** Строковые литералы PowerShell: '...' и "..." (без многострочных here-string). */
function stringLiterals(source: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  source.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/(^|\s)#.*$/, ''); // комментарии кириллицу иметь ВПРАВЕ
    for (const m of line.matchAll(/'([^']*)'|"([^"]*)"/g)) {
      const text = m[1] ?? m[2] ?? '';
      if (text) out.push({ line: i + 1, text });
    }
  });
  return out;
}

describe('лаунчер стека: кириллица только в комментариях', () => {
  const path = resolve(process.cwd(), '..', 'start-stack.ps1');
  const source = readFileSync(path, 'utf8');

  it('ни один строковый литерал не содержит кириллицы', () => {
    const bad = stringLiterals(source).filter((l) => CYRILLIC.test(l.text));
    expect(
      bad.map((b) => `start-stack.ps1:${b.line} → ${b.text.slice(0, 60)}`),
    ).toEqual([]);
  });

  it('файл по-прежнему без BOM — иначе правило теряет смысл, а не выполняется', () => {
    const head = readFileSync(path).subarray(0, 3);
    expect([...head]).not.toEqual([0xef, 0xbb, 0xbf]);
  });

  it('метка сборки снимается в блоке -Build и уходит в бандл', () => {
    // Контрольное слово Директора: «это точно новый билд?» отвечается фактом.
    expect(source).toContain('NEXT_PUBLIC_BUILD_SHA');
    expect(source).toContain('rev-parse --short HEAD');
  });
});
