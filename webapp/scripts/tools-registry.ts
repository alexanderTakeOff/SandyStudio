// Реестр инструментария — ВЫВОДИТСЯ ИЗ КОДА, а не пишется руками.
//
// Постановка Директора (cold-run-followup-tasks.md §F3): реестр обязан ФИКСИРОВАТЬ, что у
// фабрики есть; ОТСЛЕЖИВАТЬ изменения; ДОВОДИТЬ до всех участников. И ключевое требование к
// форме: «реестр не может быть документом, который кто-то обязан помнить обновить. Он должен
// выводиться из кода и ЛОМАТЬ сборку/прогон, когда разошёлся с ним».
//
// Поэтому здесь два режима и ни одного третьего:
//   npx tsx scripts/tools-registry.ts --write   → пересобрать docs/TOOLS.md
//   npx tsx scripts/tools-registry.ts           → сверить; разошлось — код возврата 1
//
// Проверок две, и вторая важнее первой:
//   1. СНИМОК. docs/TOOLS.md совпадает байт в байт с тем, что объявляет код.
//   2. ЧЕСТНОСТЬ ДЕКЛАРАЦИИ. Таблица, которую инструмент трогает через `.from('x')`, обязана
//      стоять в его `reads`/`writes`. Иначе декларация врёт, а врущая декларация хуже
//      отсутствующей — она создаёт ложную уверенность (тот же закон, что «гейт, проверяющий
//      меньше исполнителя»).
//
// Инструменты читаются под `SS_TOOLS_INTROSPECT=1`: `defineTool` возвращает спецификацию и
// НЕ запускает `main`. Ни одна программа не выполняется, сеть не трогается.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderTool, type ToolSpec } from './run/_tool';



const RUN_DIR = resolve(process.cwd(), 'scripts/run');
const SNAPSHOT = resolve(process.cwd(), '../docs/TOOLS.md');

const HEADER = `# Реестр инструментария

> **Файл СГЕНЕРИРОВАН.** Правится не он, а декларация \`defineTool\` в самом инструменте.
> Пересобрать: \`npx tsx scripts/tools-registry.ts --write\` (из \`webapp/\`).
> Сверка идёт в тестах: разошёлся с кодом — прогон падает.
>
> Это ответ на D59: маршрут говорил ЧТО делать и КОГДА, а КАК вызывать жило только в коде,
> и ведущий ум тратил на исходники ~40 минут из 108.

`;

/** Каркасы помечают себя первой строкой и инструментами не являются. */
function isFramework(source: string): boolean {
  return source.split('\n', 1)[0]?.includes('@not-a-tool') ?? false;
}

function tablesIn(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/(\w+)?\.from\('([a-z_]+)'\)/g)) {
    // `Buffer.from` / `Array.from` — иначе сторож ловил бы кодировки вместо базы.
    if (m[1] === 'Buffer' || m[1] === 'Array') continue;
    found.push(m[2]);
  }
  return found;
}

/**
 * Экспорт каркаса → таблицы, которых он касается. Режем по границам `export`: тела функций
 * лежат между ними, а вложенность фигурных скобок разбирать ради этого незачем.
 */
function frameworkExports(source: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const marks = [...source.matchAll(/export (?:async )?(?:function|const) (\w+)/g)];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index!;
    const end = i + 1 < marks.length ? marks[i + 1].index! : source.length;
    map.set(marks[i][1], tablesIn(source.slice(start, end)));
  }
  return map;
}

/**
 * Таблицы, которых инструмент касается — СВОИ и те, что за него трогают каркасы из этой же
 * папки. Считать только свой файл было бы половиной проверки: `gen-frame` пишет `assets` не
 * сам, а через `traceInStudio` в `_asset.ts`, и такая декларация врала бы, пройдя гейт.
 *
 * Но разворачивается не весь каркас, а РОВНО ТЕ функции, которые инструмент импортировал.
 * Иначе гейт требует объявить `series` у `spend`, который её не касается, — и декларация
 * начинает врать в другую сторону. Гейт, требующий неправды, обесценивает себя так же
 * надёжно, как гейт, пропускающий её.
 */
function tablesTouched(source: string): string[] {
  const found = new Set(tablesIn(source));
  for (const imp of source.matchAll(/import \{([^}]+)\} from '\.\/(_[a-z]+)'/g)) {
    let exports: Map<string, string[]>;
    try {
      exports = frameworkExports(readFileSync(join(RUN_DIR, `${imp[2]}.ts`), 'utf-8'));
    } catch {
      continue; // Каркаса нет — это громко поймает сам импорт инструмента.
    }
    for (const raw of imp[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      for (const t of exports.get(name) ?? []) found.add(t);
    }
  }
  return [...found].sort();
}

interface Entry {
  readonly file: string;
  readonly spec: ToolSpec;
  readonly touched: readonly string[];
}

async function collect(): Promise<Entry[]> {
  process.env.SS_TOOLS_INTROSPECT = '1';
  // Инструменты создают клиент базы на импорте. Реестр в базу не ходит — но и падать на её
  // отсутствии не должен, иначе сверку нельзя будет прогнать нигде, кроме рабочей машины.
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://introspect.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'introspect';

  const entries: Entry[] = [];
  for (const file of readdirSync(RUN_DIR).filter((f) => f.endsWith('.ts')).sort()) {
    const path = join(RUN_DIR, file);
    const source = readFileSync(path, 'utf-8');
    if (isFramework(source)) continue;

    // Windows: абсолютный путь обязан быть file:// URL, иначе ESM-загрузчик видит «протокол c:».
    const mod = (await import(pathToFileURL(path).href)) as { default?: ToolSpec };
    const spec = mod.default;
    if (!spec?.name) {
      throw new Error(`${file}: не каркас и не инструмент — нет ни пометки @not-a-tool, ни defineTool`);
    }
    if (spec.name !== file.replace(/\.ts$/, '')) {
      throw new Error(`${file}: объявлено имя «${spec.name}» — оно обязано совпадать с именем файла`);
    }
    entries.push({ file, spec, touched: tablesTouched(source) });
  }
  return entries;
}

/** Расхождение декларации с кодом. Пустой список = декларация честна. */
function undeclared(e: Entry): string[] {
  const declared = new Set([...(e.spec.reads ?? []), ...(e.spec.writes ?? [])]);
  return e.touched.filter((t) => !declared.has(t));
}

// ── Второй мир: выжившие чат-тулы ума (Ф4.2) ────────────────────────────────
// Их контракт — function-calling схема в самом туле; рендер читает ЕЁ, а не
// пересказ. Гейт честности таблиц на них не распространяется: reads/writes не
// декларированы, и это сказано в шапке раздела явно, а не умолчано.

// Ф6 (09.08): раздел «тулы ума (chat)» умер вместе с lib/mind/chat-tools —
// в харнесе у Полины нет function-calling слоя, только CLI run/* (+ Read/Bash
// нативно). Замены: show / cast-episode / theme-propose — обычные defineTool
// и рендерятся общим путём.

function render(entries: readonly Entry[]): string {
  const rows = entries
    .map((e) => `| [\`${e.spec.name}\`](#${e.spec.name}) | ${e.spec.summary} |`)
    .join('\n');
  const body = entries.map((e) => renderTool(e.spec)).join('\n\n---\n\n');

  return `${HEADER}| инструмент | что делает |\n|---|---|\n${rows}\n\n---\n\n${body}\n`;
}

async function main() {
  const entries = await collect();

  const liars = entries.map((e) => [e, undeclared(e)] as const).filter(([, u]) => u.length > 0);
  if (liars.length > 0) {
    console.error('РЕЕСТР РАЗОШЁЛСЯ С КОДОМ — декларация инструмента врёт про таблицы:');
    for (const [e, u] of liars) {
      console.error(`  ${e.spec.name}: трогает ${u.map((t) => `\`${t}\``).join(', ')}, но не объявил в reads/writes`);
    }
    console.error('');
    console.error('Починка: дописать таблицу в `reads` или `writes` внутри defineTool этого инструмента.');
    process.exit(1);
  }

  const fresh = render(entries);
  if (process.argv.includes('--write')) {
    writeFileSync(SNAPSHOT, fresh, 'utf-8');
    console.log(`✓ ${entries.length} инструментов → docs/TOOLS.md`);
    return;
  }

  let stored: string | null = null;
  try {
    stored = readFileSync(SNAPSHOT, 'utf-8');
  } catch {
    stored = null;
  }
  if (stored !== fresh) {
    console.error('РЕЕСТР РАЗОШЁЛСЯ С КОДОМ — docs/TOOLS.md устарел.');
    console.error('Починка: npx tsx scripts/tools-registry.ts --write (из webapp/), затем закоммитить.');
    process.exit(1);
  }
  console.log(`✓ реестр совпадает с кодом (${entries.length} инструментов)`);
}

main().catch((e: unknown) => {
  console.error('ERROR', e instanceof Error ? e.message : e);
  process.exit(1);
});
