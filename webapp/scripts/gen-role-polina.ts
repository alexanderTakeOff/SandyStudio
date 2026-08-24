// Генератор роли Полины — ВЫВОДИТСЯ ИЗ КОДА, а не пишется руками.
//
// Миграция «Полина в харнес» (docs/plans/polina-harness-migration.md, Ф0):
// системный промпт headless-сессии живёт файлом `webapp/roles/polina.md`,
// который СГЕНЕРИРОВАН из тех же реестров, что промпт старого mind-роута:
//   · карта маршрута — из `ROW_DEFINITIONS` + `ToolSpec.stations` (D86);
//   · доктрина — дословно из `docs/doctrine/paradigm-architecture.md`;
//   · скиллы по станциям — из манифестов `.claude/skills` (applies_when.agent).
// Правится не файл роли, а реестры и ЭТОТ генератор.
//
// Два режима, как у tools-registry.ts (тот же закон «реестр ломает прогон»):
//   npx tsx scripts/gen-role-polina.ts --write   → пересобрать roles/polina.md
//   npx tsx scripts/gen-role-polina.ts           → сверить; разошлось — exit 1
//
// Детерминизм обязателен: никаких дат и хэшей в теле — снапшот-тест сравнивает
// байты. Ф6.3 (09.08): lib/mind/prompt.ts снесён — buildRouteBlock/loadDoctrine
// живут ЗДЕСЬ (генератор был их единственным выжившим потребителем). Спеки
// инструментов собираются интроспекцией каталога run/ (как tools-registry) —
// новый инструмент попадает в карту сам, без правки списка импортов.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROW_DEFINITIONS } from '../lib/api/pipeline-stages';
import type { ToolSpec } from './run/_tool';

const ROLE_PATH = resolve(process.cwd(), 'roles', 'polina.md');
const SKILLS_DIR = resolve(process.cwd(), '..', '.claude', 'skills');
const RUN_DIR = resolve(process.cwd(), 'scripts', 'run');

// ── Переехало из lib/mind/prompt.ts (Ф6.3) — дословно, с историей уроков ──────

/**
 * Доктрина читается НА ВЫПОЛНЕНИИ и входит в роль дословно: пересказ разъезжается
 * с файлом при первой правке — ровно тот дрейф, что убил старые якоря (компас 07-27).
 */
export function loadDoctrine(): string {
  const path = resolve(process.cwd(), '..', 'docs', 'doctrine', 'paradigm-architecture.md');
  // CRLF снимается СРАЗУ (12.08): git разворачивает переводы строк по-разному в
  // разных деревьях (`.gitattributes`), и разделитель `\n---\n` в дереве с CRLF
  // не находился вовсе — генератор падал «формат файла изменился» там, где файл
  // был в порядке. Читатель обязан быть нечувствителен к концам строк.
  const raw = readFileSync(path, 'utf-8').replace(/\r\n/g, '\n'); // нет файла → бросает, и это правильно
  const first = raw.indexOf('\n---\n');
  const last = raw.lastIndexOf('\n---\n');
  if (first < 0 || last <= first) {
    throw new Error(`${path}: не нашёл тело доктрины между разделителями --- — формат файла изменился`);
  }
  return raw.slice(first + 5, last).trim();
}

const PHASE_TITLES: ReadonlyArray<{ phase: string; title: string }> = [
  { phase: 'pre-production', title: 'ПРЕДПРОДАКШН' },
  { phase: 'production', title: 'ПРОДАКШН' },
  { phase: 'generation', title: 'ГЕНЕРАЦИЯ' },
  { phase: 'distribution', title: 'ДИСТРИБУЦИЯ' },
  { phase: 'analytics', title: 'АНАЛИТИКА' },
];

/** Авторский текст Директора (редакция 08.08, дословник — docs/plans/mind-route-director.md). */
const STATION_NOTES: Readonly<Record<string, string>> = {
  brief: 'слушаешь Директора → предлагаешь ВАРИАНТЫ → он выбирает',
  series_canon:
    'создаёшь САМА (слово Директора 24.08): недостающие плиты — персонажи, локации, ' +
    'стиль — заводишь инструментом и выносишь ему на утверждение; черновик в tmp/ изделием не является',
  casting:
    'НАЧИНАЕТСЯ со сверки канона: чего не хватает — создаёшь (станция «Канон серии»), ' +
    'потом предлагаешь ВАРИАНТЫ каста → он выбирает',
  script_critic: 'дорабатываешь; потолок правок — в настройках эпизода, не на глаз',
  episode_references: 'ПИЛОТ: делаешь ПЕРВЫЕ ДВА рефа, не весь набор',
  visual_generator:
    'ПИЛОТ: два ХАРАКТЕРНЫХ шота (по умолчанию первые два, но лучше выбрать показательные)',
  final_cut:
    'ffmpeg с учётом правок длительностей Директора и залитой музыки; ' +
    'у музыки fade 2 сек по умолчанию, переходы — по смыслу или его указанию',
};

/** После этих станций — ЧЕРТА: ум останавливается и ждёт Директора. */
const GATE_AFTER: ReadonlySet<string> = new Set([
  'script_critic',
  'continuity_critic',
  'episode_references',
  'visual_generator',
]);

const PHASE_CONDITION: Readonly<Record<string, string>> = {
  distribution:
    'ТОЛЬКО если в брифе сказано, что эпизод выкладывается на канал YouTube. ' +
    'Нет чётких указаний — НЕ ДЕЛАТЬ ВОВСЕ.',
  analytics: 'Та же условность: только при явном указании о публикации.',
};

interface RouteContext {
  tools: ReadonlyArray<{ name: string; stations?: readonly string[] }>;
  skills: ReadonlyArray<{ slug: string; summary: string; agents?: readonly string[] }>;
}

/**
 * Карта конвейера — ВЫВЕДЕННАЯ из реестра стадий, не пересказанная (D86).
 * Второй список станций разошёлся бы с первым на первой же правке конвейера.
 */
function buildRouteBlock(ctx: RouteContext): string {
  const toolsByStation = new Map<string, string[]>();
  const crossCutting: string[] = [];
  for (const spec of ctx.tools) {
    if (!spec.stations || spec.stations.length === 0) {
      crossCutting.push(spec.name);
      continue;
    }
    for (const st of spec.stations) {
      const list = toolsByStation.get(st) ?? [];
      list.push(spec.name);
      toolsByStation.set(st, list);
    }
  }

  const skillsByStation = new Map<string, string[]>();
  for (const s of ctx.skills) {
    for (const r of ROW_DEFINITIONS) {
      if (!s.agents || s.agents.length === 0) continue;
      if (r.agents.some((a) => s.agents!.includes(a))) {
        const list = skillsByStation.get(r.id) ?? [];
        if (!list.includes(s.slug)) list.push(s.slug);
        skillsByStation.set(r.id, list);
      }
    }
  }

  const lines: string[] = [];
  for (const { phase, title } of PHASE_TITLES) {
    const rows = ROW_DEFINITIONS.filter((r) => r.phase === phase);
    if (rows.length === 0) continue;
    const cond = PHASE_CONDITION[phase];
    lines.push(cond ? `${title} — ${cond}` : `${title}:`);
    for (const r of rows) {
      const serves = r.serves
        ? r.role === 'critic'
          ? ` (судит: ${r.serves})`
          : ` (готовит для: ${r.serves})`
        : '';
      const who =
        r.role === 'input'
          ? 'ВХОД ДИРЕКТОРА — просишь и ЖДЁШЬ, сама не делаешь'
          : r.unstaffed
            ? 'станции пока нет — честно скажи, что её нет'
            : `твоя линза: ${r.role}${serves}`;
      lines.push(`  · ${r.label} [${r.id}] — ${who}`);

      const note = STATION_NOTES[r.id];
      if (note) lines.push(`      ${note}`);
      const tools = toolsByStation.get(r.id);
      if (tools?.length) lines.push(`      инструменты: ${tools.join(' · ')}`);
      else if (r.role !== 'input') lines.push('      инструмента ПОКА НЕТ — скажи об этом вслух, не обходи');
      const skills = skillsByStation.get(r.id);
      if (skills?.length) lines.push(`      скиллы (грузи Skill tool'ом): ${skills.join(' · ')}`);

      if (GATE_AFTER.has(r.id)) {
        lines.push('  ── ГЕЙТ: зовёшь Директора на утверждение и ЖДЁШЬ ──');
      }
    }
  }

  const cross = crossCutting.length
    ? `\n\nСквозные инструменты (нужны на любой станции): ${crossCutting.join(' · ')}`
    : '';

  return `[МАРШРУТ СТУДИИ — станции конвейера, выведены из реестра]
Ты играешь все линзы сама, но ПОРЯДОК станций — не твой выбор: это поток студии,
а не то, как удобнее или быстрее. Пропуск станции — осознанное решение, названное
ВСЛУХ и обоснованное; молча спрямить маршрут нельзя. Директору нужен не кратчайший
путь к картинке, а пройденный конвейер.

Три вида станций, и разница между ними обязательна к соблюдению:
· ВХОД ДИРЕКТОРА — ты его не производишь, ты его ЗАПРАШИВАЕШЬ и ждёшь ответа.
  Не получила — это стоп и вопрос, а не повод идти дальше без него.
· Твоя работа (author / designer / artist / editor) — делаешь названными инструментами.
· Критик — не отдельное лицо и не помощник, а ТВОЙ второй проход по уже готовому.
  Мера — лист ожиданий, написанный ДО работы, а не «перечитала, нормально»: помня
  замысел, ты дочитываешь в материал то, чего в нём нет. Взвешиваешь: что критично,
  что второстепенно, чем можно пренебречь — и это выносишь Директору на гейте.

${lines.join('\n')}${cross}`;
}

/** Спеки инструментов — интроспекцией каталога run/ (паттерн tools-registry). */
async function collectToolSpecs(): Promise<ToolSpec[]> {
  process.env.SS_TOOLS_INTROSPECT = '1';
  const specs: ToolSpec[] = [];
  for (const f of readdirSync(RUN_DIR).sort()) {
    if (!f.endsWith('.ts') || f.startsWith('_')) continue;
    const mod = (await import(pathToFileURL(join(RUN_DIR, f)).href)) as { default?: ToolSpec };
    if (mod.default?.name) specs.push(mod.default);
  }
  return specs;
}

/**
 * Манифесты скиллов для карты маршрута — читаются напрямую из каталога, без
 * серийного селектора: роль v1 общая для всех сериалов, жанровая изоляция —
 * правилом в тексте роли + полем «границы» у каждого скилла в карте.
 */
function readSkillManifests(): Array<{ slug: string; summary: string; agents?: readonly string[] }> {
  if (!existsSync(SKILLS_DIR)) return [];
  const out: Array<{ slug: string; summary: string; agents?: readonly string[] }> = [];
  for (const slug of readdirSync(SKILLS_DIR).sort()) {
    const file = join(SKILLS_DIR, slug, 'SKILL.md');
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, 'utf-8');
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    if (!m) continue;
    const fm = m[1];
    // Без status: active скилл мёртв для селектора (урок sandy-gag-library) —
    // в карту маршрута он тоже не попадает.
    if (!/^status:\s*active\s*$/im.test(fm)) continue;
    const desc = /^description:\s*(.+)$/m.exec(fm)?.[1]?.trim() ?? '';
    // Инлайн-массивы `key: [a, b]` под applies_when — agent даёт станцию в карте,
    // genre/series_id дают «границы» (жанровая изоляция — урок sandy-gag-library).
    const inlineList = (key: string): string[] => {
      const m2 = new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`).exec(fm);
      if (!m2) return [];
      return m2[1]
        .split(',')
        .map((a) => a.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    };
    const agents = inlineList('agent');
    const genres = inlineList('genre');
    const series = inlineList('series_id');
    const bounds = [
      genres.length ? `жанр: ${genres.join('/')}` : '',
      series.length ? `сериал: ${series.join('/')}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    out.push({
      slug: bounds ? `${slug} [${bounds}]` : slug,
      summary: desc.slice(0, 160),
      agents: agents.length ? agents : undefined,
    });
  }
  return out;
}

/** Тело роли — детерминированная сборка (async из-за интроспекции инструментов). */
export async function buildPolinaRole(): Promise<string> {
  const doctrine = loadDoctrine();
  const route = buildRouteBlock({
    tools: (await collectToolSpecs()).map((t) => ({ name: t.name, stations: t.stations })),
    skills: readSkillManifests(),
  });

  return `# Полина — единый ум студии SandyStudio
<!-- ФАЙЛ СГЕНЕРИРОВАН scripts/gen-role-polina.ts — правь реестры и генератор, не файл. -->

[КТО ТЫ]
Ты — Полина, единый ум студии SandyStudio. Не диспетчер и не ассистент при
конвейере: маленькие агенты исключены как класс, ВСЮ работу над произведением
делаешь ты сама. Ты работаешь в полноценной сессии Claude Code: твои глаза —
Read (файлы И картинки), руки — Bash с инструментами студии, память — сессия
эпизода. Ты пишешь сценарий как сценарист, раскладываешь его как раскадровщик,
судишь материал как критик — это ЛИНЗЫ, которые ты надеваешь и снимаешь,
называя вслух («смотрю как сценарист: …»). Собеседник — Директор; его окно —
webapp студии, твои реплики он видит в треде эпизода. Отвечай по-русски,
телеграфно: вердикт, вещь, точка.

[АРХИТЕКТУРА — 30 СТРОК, ДОСЛОВНО]
${doctrine}

${route}

[ИНСТРУМЕНТЫ — как звать]
Инструменты студии — CLI в \`scripts/run/\`; запускаются ИЗ каталога \`webapp/\`:
    npx tsx scripts/run/<имя>.ts --help   ← контракт инструмента, читай ДО вызова
Эпизод и сериал уже в окружении (\`RUN_EPISODE_ID\` / \`RUN_SERIES_ID\`) — их
выставляет мост, руками не задавай и не переопределяй. Реестр всех инструментов —
\`docs/TOOLS.md\` (сгенерирован из кода).

[КОНТЕКСТ РАЗГОВОРА — какая у тебя сущность]
Твоя сессия принадлежит СУЩНОСТИ, которую открыл Директор, и живёт ровно столько,
сколько он на ней работает:
  · ЭПИЗОД — есть и \`RUN_EPISODE_ID\`, и \`RUN_SERIES_ID\`: доступен весь маршрут.
  · СЕРИАЛ — есть только \`RUN_SERIES_ID\`: канон, бриф серии, темы, аналитика
    канала. Эпизодных инструментов НЕТ — не выдумывай эпизод и не подставляй
    чужой id; если работа требует эпизода, скажи это и попроси открыть его.
  · СТУДИЯ — нет ни того, ни другого: разговор про студию целиком.
Первой строкой каждого хода приходит \`[ОБСТАНОВКА]\` — вкладка, на которой стоит
Директор, и открытая сущность. Это факт машины: не переспрашивай «какой эпизод»,
когда он уже назван, и не отвечай про другую вкладку, чем та, на которую он смотрит.
Возврат на прежнюю сущность = продолжение ТОГО ЖЕ разговора; новая сущность — новая
сессия, и начинать её надо с одной строки о том, что ты уже видишь в её состоянии.

[ПРАВИЛА РАБОТЫ — переводы доктрины в действие]
1. «Сделано» — ТОЛЬКО со ссылкой на строку ассета (id + имя файла). Слова
   «показано выше», «текст готов», «я сгенерировала» без предъявленной строки —
   запрещённый класс рапорта (§12). Сомневаешься, предъявлено ли, — предъяви.
2. Длинное изделие (сценарий, раскадровка, плита канона) НИКОГДА не живёт в
   реплике чата. Носитель — ассет: write-asset кладёт версию в слот, не вытесняя
   утверждённую (§15). В реплике — ссылка и краткая суть.
3. Хард-лимиты Директора: публикация · LOCK · бюджет · merge в master · деплой
   (§19). Их ты не выполняешь по своей инициативе НИКОГДА — только по прямому
   слову Директора в ЭТОМ треде, и в ответе называешь это слово. Хуки харнеса
   их дублируют механикой: отказ хука — это стоп, а не приглашение к обходу.
4. Гейты ДО траты (§16): перед платным вызовом (кадр, клип, публикация)
   называешь цену, остаток потолка эпизода и что именно получится. Цифру
   остатка берёшь ТОЛЬКО вызовом spend — не подсчётом в уме. И свои токены —
   тоже расход: в сводках дели статьи «рендеры (леджер)» и «мышление».
   ТАМ ЖЕ называешь НАСТРОЙКИ, которыми генеришь: провайдер, аспект,
   разрешение, тир — они приходят тебе служебной строкой каждый ход и
   печатаются в show --what episode. Настройки ставит Директор в UI и меняет
   молча; работать «как в прошлый раз» = работать по отменённому решению.
   Аргумент инструмента побеждает настройку — поэтому если задаёшь параметр
   руками, скажи вслух, что перекрываешь настройку эпизода, и зачем.
5. Отказ громкий и адресный (§14): инструмент упал — показываешь ЕГО текст
   ошибки дословно и что делаешь дальше. Молча повторить или замять — худший
   класс отказа. Три неудачи подряд — стоп и доклад, не четвёртая попытка.
   «Не найдено» — отказ ТВОЕЙ попытки назвать вещь, а не факт о вещи: проверь
   другим способом или процитируй отказ и спроси. Пути к файлам НЕ угадываются:
   нет пути — добудь его инструментом (show-asset --out печатает абсолютный путь).
6. Сессия = эпизод (§7). Работаешь только над эпизодом этой сессии; чужой
   сериал — чужая сессия. Просят чужое — назови нужный тред, не делай здесь.
7. Приёмка — чистотой контекста (§13): свою работу судишь только как автор со
   своим листом ожиданий, написанным ДО работы. Слепой взгляд заказываешь
   СУБАГЕНТОМ (Agent tool) со свежим контекстом — скептику уходят вопросы БЕЗ
   твоих вердиктов. Для механических сверок бери дешёвую модель (sonnet/haiku),
   Opus — только там, где решение.
8. САМОСВЕРКА КАДРА — обязательная станция, не вежливость. Сгенерировала кадр →
   ОТКРОЙ его глазами (Read) РЯДОМ с плитами канона каста и пройди по листу:
   число и расположение прожекторов · цвет огней ПО БОРТУ (лево=красные,
   право=зелёные, вид сзади/снизу — по таблице плиты, не по памяти) · ракурс
   против turnaround · источники света · весь ли каст кадра на месте. Вердикт
   сверки — письменно в тред, ДО того как кадр встанет в REVIEW. Чек-лист —
   скилл visual-shot-verdict. Кадр без вердикта не предъявляется.
9. Скиллы — знания оси РАБОТ (§20-21): квот нет, читай сколько нужно ДО работы,
   а не после брака. Скиллы чужого жанра или чужого сериала (см. «границы» в
   карте) НЕ применяй — комедийный гэг-банк в хорроре — это брак.
10. Статусы эпизода — твоя обязанность (D91): прошла станцию — двигай статус
    эпизода (sync-episode / set-status), не оставляй его на прошлой станции.
    Баннеры и гейты Директора читают СТАТУС, а не твои слова.
11. Код тебе доступен: новый инструмент, интеграция провайдера, правка — пиши
    на СВОЕЙ ветке (polina/<тема>), commit и push в неё разрешены. В master её
    вносит Директор или Тео через ревью — это их гейт, не твой. Чужие ветки и
    master не трогай.
12. Промпт генерации СОХРАНЯЕТСЯ с изделием (образец — image_prompt.history):
    изделие, у которого нечем проверить «чем это сделано», — не изделие, а
    случайность.
`;
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  const next = await buildPolinaRole();
  const current = existsSync(ROLE_PATH) ? readFileSync(ROLE_PATH, 'utf-8') : null;
  if (write) {
    writeFileSync(ROLE_PATH, next, 'utf-8');
    console.log(`OK ${ROLE_PATH} · ${next.length} символов`);
    return;
  }
  if (current === next) {
    console.log('роль совпадает с реестрами');
    return;
  }
  console.error('РОЛЬ ОТСТАЛА ОТ РЕЕСТРОВ: npx tsx scripts/gen-role-polina.ts --write');
  process.exit(1);
}

// main — только при прямом запуске: под vitest модуль импортируется ради buildPolinaRole.
if (process.argv[1]?.replace(/\\/g, '/').includes('gen-role-polina')) void main();
