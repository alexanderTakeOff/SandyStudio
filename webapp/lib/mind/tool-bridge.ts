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
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, dirname, basename } from 'node:path';
import { HARNESS_TOOLS, resolveArgs, type ToolSpec, type ToolContext } from '../../scripts/run/_tool';
import { runEnvStore } from '../../scripts/run/_env';

const INLINE_PREFIX = 'inline:';

/** Бридж заводит уму умолчание, если она не задала статус явно (D71). CLI-умолчание
 *  инструментов (обычно APPROVED) не трогается — это касается только вызовов через мост. */
const DRAFT_BY_DEFAULT_TOOLS = new Set(['gen-frame', 'register-canon']);

/**
 * D71: ум не назвала статус явно → черновик, не APPROVED. Мутирует `given` на
 * месте (тот же приём, что и материализация инлайна ниже) — чистая функция по
 * входу/выходу, вынесена отдельно, чтобы решение проверялось без похода в БД.
 */
export function applyDraftDefault(name: string, given: Record<string, string>): void {
  if (DRAFT_BY_DEFAULT_TOOLS.has(name) && given.status === undefined) {
    given.status = 'DRAFT';
  }
}

/** D70: doctrine's «глаза» — show-asset пишет файл на диск (CLI-контракт), но
 *  мультимодальному уму нужны БАЙТЫ в ответе тула, не путь. Инструмент не трогаем —
 *  он уже держит base64 в памяти перед записью; мост читает файл ОБРАТНО и кладёт
 *  в MindToolResult.images. */
const IMAGE_RETURNING_TOOLS = new Set(['show-asset']);

export type MediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
const MEDIA_TYPE_BY_EXT: Readonly<Record<string, MediaType>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function mediaTypeFor(path: string): MediaType {
  return MEDIA_TYPE_BY_EXT[extname(path).toLowerCase()] ?? 'image/png';
}

/**
 * Картинки, реально записанные по пути `out` инструментом показа. `show-asset`
 * не гарантирует, что файл лежит РОВНО по `out`: кадр дописывает расширение
 * (`out` → `out.png`), видео превращает `out` в ДИРЕКТОРИЮ с полосой кадров
 * (`01.png`, `02.png`...) — оба случая нужно найти, не угадав путь один раз.
 * Пусто, если ничего не появилось — `out` мог быть пуст (только текст).
 */
export function collectImages(outPath: string): Array<{ mediaType: MediaType; base64: string }> {
  if (!outPath) return [];

  if (existsSync(outPath) && statSync(outPath).isDirectory()) {
    return readdirSync(outPath)
      .sort()
      .map((f) => join(outPath, f))
      .filter((f) => statSync(f).isFile())
      .map((f) => ({ mediaType: mediaTypeFor(f), base64: readFileSync(f).toString('base64') }));
  }

  // Кадр: искать `<base>.*` рядом, а не только точное имя — расширение дописал сам тул.
  const dir = dirname(outPath);
  const base = basename(outPath);
  if (!existsSync(dir)) return [];
  const hit = readdirSync(dir).find((f) => f === base || f.startsWith(`${base}.`));
  if (!hit) return [];
  const full = join(dir, hit);
  return [{ mediaType: mediaTypeFor(full), base64: readFileSync(full).toString('base64') }];
}

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
  /** D70: байты, которые инструмент показа записал по `out` — глаза единого ума. */
  images?: ReadonlyArray<{ mediaType: MediaType; base64: string }>;
}

/**
 * D70: сентинел для тул-результата с картинкой. Маршрут кладёт его вместо
 * простой строки в `content` хода `role:'tool'`; `anthropic-native.ts`
 * распознаёт сентинел и разворачивает в настоящий multimodal-блок
 * (`{type:'image', source:{...}}`) — единственное место, где OpenAI-форма
 * сообщения временно несёт то, что ей по контракту не положено.
 */
export interface MultimodalToolResult {
  __sandystudio_multimodal: true;
  text: string;
  images: ReadonlyArray<{ mediaType: MediaType; base64: string }>;
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

    applyDraftDefault(name, given);

    // D70: show-asset получает картинку глазами — ей нужен `out`, даже если ум
    // его не попросил. Свой временный путь ставим ТОЛЬКО когда она молчала —
    // явный `out` от неё не трогаем.
    if (IMAGE_RETURNING_TOOLS.has(name) && !given.out) {
      scratchDir ??= mkdtempSync(join(tmpdir(), 'ss-mind-'));
      given.out = join(scratchDir, 'out');
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
      // D74: тот же признак, что у CLI-пути. `given` здесь — то, что назвал УМ
      // (после `applyDraftDefault`), поэтому «явно задано» значит ровно то же:
      // инструмент отличит названный аргумент от подставленного дефолта и сможет
      // уступить дорогу настройкам эпизода.
      wasGiven: (n: string) => n in given,
      env: (n: string) => {
        const v = env[n];
        // Недекларированный env — дефект контракта тула, и он обязан быть громким.
        if (!v) throw new Error(`не задана переменная окружения ${n}`);
        return v;
      },
    };

    await captureStore.run(buf, () => runEnvStore.run(env, () => tool.main(ctx)));

    const images = IMAGE_RETURNING_TOOLS.has(name) ? collectImages(resolved.out ?? '') : [];
    return { ok: true, output: buf.join('\n'), ...(images.length ? { images } : {}) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, output: [...buf, `ERROR: ${message}`].join('\n') };
  } finally {
    if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  }
}
