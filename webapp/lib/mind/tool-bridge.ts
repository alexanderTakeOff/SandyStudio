// МОСТ РЕЕСТРА (Ф4.1): 14 инструментов `scripts/run/*` становятся руками единого
// ума — те же спецификации, тот же код, БЕЗ `npx tsx` на вызов.
//
// Устройство — три решения, каждое от конкретного дефекта:
//
// 1. `harness-flag` стоит ПЕРВЫМ импортом: под `SS_TOOLS_HARNESS=1` `defineTool`
//    регистрирует `{spec, main}` в карту вместо парсинга argv (иначе импорт
//    инструмента завершил бы процесс приложения как «неизвестный флаг»).
// 2. Env per-вызов через AsyncLocalStorage (`runEnvStore`), не через process.env:
//    параллельные запросы разных эпизодов иначе гоняются за глобальной переменной,
//    и чат серии A молча пишет в серию B — класс дефекта D58/D60.
// 3. Вывод инструмента ловится подменой console.* с ALS-буфером: без буфера —
//    сквозной проход в терминал (CLI-путь не задет), с буфером — каждый вызов
//    собирает СВОЙ вывод даже при конкуренции.
//
// Инлайн-носитель: у аргументов-файлов (`file`, `*-file`) значение `inline:<текст>`
// материализуется во временный файл до вызова. Один механизм закрывает write-asset,
// blind-brief, gen-frame и gen-video, не меняя ни одного инструмента: длинный текст
// не переживает шелл (потому в CLI и появились файлы), но переживает JSON тул-колла.
import './harness-flag';
import '../../scripts/run/blind-brief';
import '../../scripts/run/check-video';
import '../../scripts/run/ensure-episode';
import '../../scripts/run/gen-frame';
import '../../scripts/run/gen-video';
import '../../scripts/run/publish';
import '../../scripts/run/register-canon';
import '../../scripts/run/register-media';
import '../../scripts/run/set-status';
import '../../scripts/run/show-asset';
import '../../scripts/run/spend';
import '../../scripts/run/stitch';
import '../../scripts/run/sync-episode';
import '../../scripts/run/write-asset';
import { AsyncLocalStorage } from 'node:async_hooks';
import { format } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HARNESS_TOOLS, resolveArgs, type ToolSpec, type ToolContext } from '../../scripts/run/_tool';
import { runEnvStore } from '../../scripts/run/_env';

const INLINE_PREFIX = 'inline:';

/** Схема тула в формате function-calling — выводится из той же меты, что и docs/TOOLS.md. */
export interface MindFunctionSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: 'string'; description: string; enum?: string[] }>;
      required: string[];
      additionalProperties: false;
    };
  };
}

export interface MindToolResult {
  ok: boolean;
  /** Всё, что инструмент сказал (console.*), плюс строка ошибки при отказе. */
  output: string;
}

/** Аргумент-носитель файла: значение может прийти инлайном. */
const isFileArg = (name: string): boolean => name === 'file' || name.endsWith('-file');

export function toFunctionSchema(spec: ToolSpec): MindFunctionSchema {
  const properties: MindFunctionSchema['function']['parameters']['properties'] = {};
  const required: string[] = [];
  for (const [name, a] of Object.entries(spec.args)) {
    const inlineNote = isFileArg(name)
      ? ` Вместо пути можно передать содержимое строкой с префиксом \`${INLINE_PREFIX}\`.`
      : '';
    const defaultNote = a.default === undefined ? '' : ` По умолчанию: ${a.default}.`;
    const about = a.about.endsWith('.') ? a.about : `${a.about}.`;
    properties[name] = {
      type: 'string',
      description: `${about}${defaultNote}${inlineNote}`,
      ...(a.values ? { enum: [...a.values] } : {}),
    };
    if (a.default === undefined) required.push(name);
  }
  return {
    type: 'function',
    function: {
      name: spec.name,
      description: spec.summary,
      parameters: { type: 'object', properties, required, additionalProperties: false },
    },
  };
}

export function mindToolSpecs(): ToolSpec[] {
  return [...HARNESS_TOOLS.values()].map((t) => t.spec);
}

export function mindToolSchemas(): MindFunctionSchema[] {
  return mindToolSpecs().map(toFunctionSchema);
}

// ── Захват вывода ────────────────────────────────────────────────────────────
const captureStore = new AsyncLocalStorage<string[]>();
let consolePatched = false;

function patchConsoleOnce(): void {
  if (consolePatched) return;
  consolePatched = true;
  for (const method of ['log', 'error', 'warn'] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      const buf = captureStore.getStore();
      if (buf) buf.push(format(...args));
      else original(...args);
    };
  }
}

// ── Вызов ────────────────────────────────────────────────────────────────────
/**
 * Один вызов инструмента: валидация той же `resolveArgs`, что у CLI; объявленный
 * env — из ПЕРЕДАННОЙ карты (контекст треда), не из process.env; отказ громкий и
 * адресный — текст ошибки уходит уму как результат тула, не в пустоту.
 */
export async function invokeMindTool(
  name: string,
  args: Readonly<Record<string, unknown>>,
  env: Readonly<Record<string, string>>,
): Promise<MindToolResult> {
  const tool = HARNESS_TOOLS.get(name);
  if (!tool) {
    return { ok: false, output: `ERROR: инструмента «${name}» нет в реестре — см. docs/TOOLS.md` };
  }

  patchConsoleOnce();
  const buf: string[] = [];
  let scratchDir: string | null = null;

  try {
    // Значения из JSON тул-колла — в строки (модель может прислать число).
    const given: Record<string, string> = {};
    for (const [k, v] of Object.entries(args)) {
      if (v === undefined || v === null) continue;
      given[k] = String(v);
    }

    const resolved = resolveArgs(tool.spec, given);

    // Инлайн-носитель → временный файл. После вызова файл сносится.
    for (const [k, v] of Object.entries(resolved)) {
      if (!isFileArg(k) || !v.startsWith(INLINE_PREFIX)) continue;
      scratchDir ??= mkdtempSync(join(tmpdir(), 'ss-mind-'));
      const path = join(scratchDir, `${tool.spec.name}-${k}.txt`);
      writeFileSync(path, v.slice(INLINE_PREFIX.length), 'utf8');
      resolved[k] = path;
    }

    for (const [envName, e] of Object.entries(tool.spec.env ?? {})) {
      if (!env[envName]) {
        return { ok: false, output: `ERROR: не задана переменная окружения ${envName} — ${e.about}` };
      }
    }

    const ctx: ToolContext<ToolSpec> = {
      arg: (n: string) => resolved[n],
      env: (n: string) => {
        const v = env[n];
        // Недекларированный env — дефект контракта тула, и он обязан быть громким.
        if (!v) throw new Error(`не задана переменная окружения ${n}`);
        return v;
      },
    };

    await captureStore.run(buf, () => runEnvStore.run(env, () => tool.main(ctx)));
    return { ok: true, output: buf.join('\n') };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, output: [...buf, `ERROR: ${message}`].join('\n') };
  } finally {
    if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  }
}
