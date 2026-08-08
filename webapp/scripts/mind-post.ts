// ХОД УМУ БЕЗ ЭКРАНА — headless-клиент `/api/mind/chat`.
//
// Зачем: до 08.08 послать уму ход можно было ТОЛЬКО браузерной панелью. Кнопка
// «отправить» теряла клики (~6+ раз за сессию), а скриншоты панели съедали 1M+
// токенов контекста, поэтому Директор запретил экран насовсем: «БОЛЬШЕ НЕ РАБОТАЙ
// С ЭКРАНОМ, только через базу. если не понимаешь как общаться с полиной без
// экрана — значит надо сделать такой канал!». Это он.
//
// Чем НЕ является: `team-chat-post.ts` шлёт в ДРУГУЮ поверхность — старый
// консьерж (`/api/team-chat/post` → Inngest → `/api/concierge/chat-internal`).
// Ум те сообщения не видит вовсе: лифт `claude_message` в контекст есть только у
// старого билдера промпта (`lib/concierge/system-prompt-builder.ts`), у
// `lib/mind/prompt.ts` эквивалента нет. Послать уму ход через team-chat нельзя.
//
// ПОЧЕМУ ИСТОРИЮ СОБИРАЕМ САМИ: роут НЕ грузит ходы треда из базы — массив
// сообщений целиком приходит из тела запроса (`route.ts:200-203`), а панель
// держит ленту у себя. Клиент, который пришлёт только новый ход, сделает ум
// амнезиком. `persistTurn` в роуте — бухгалтерия, не память.
//
// ПОЧЕМУ ЭПИЗОД ОБЯЗАТЕЛЕН: без `episodeId` роут падает в глобальный фолбэк
// `resolveOpenThreadId(null, null)` и берёт ЛЮБОЙ последний открытый тред студии,
// после чего строит промпт и `RUN_EPISODE_ID`/`RUN_SERIES_ID` по ЧУЖОМУ эпизоду.
// Директор (08.08): отдельный ум живёт в КАЖДОМ эпизоде, и несколько эпизодов
// идут ОДНОВРЕМЕННО — при параллельной работе такой фолбэк попадёт в чужой почти
// наверняка. Поэтому отсутствие эпизода здесь — ошибка КЛИЕНТА, а не повод
// довериться серверу. (Студийный режим ума — без эпизода — Директором отложен;
// когда появится, у него будет свой явный флаг, а не молчаливый фолбэк.)
//
// Живёт вне `scripts/run/` намеренно: там инструменты, которые ум зовёт САМ через
// мост, и «спросить ум» внутри его же реестра дало бы уму позвать самого себя.
// Это инструмент Тео/Директора.
//
// Использование:
//   npx tsx scripts/mind-post.ts --episode <uuid> --file msg.md
//   echo "текст" | npx tsx scripts/mind-post.ts --episode <uuid> -
//   npx tsx scripts/mind-post.ts --file msg.md --dry-run     # RUN_EPISODE_ID из env
import { readFileSync } from 'node:fs';
import { sb } from './run/_env';

/** Сколько последних ходов треда уходит уму как память. */
const DEFAULT_HISTORY = 20;

interface WireMessage {
  role: 'user' | 'assistant';
  content: string;
}

function arg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function readContent(args: string[]): Promise<string> {
  const file = arg(args, '--file');
  if (file) return readFileSync(file, 'utf-8').trim();
  if (args.includes('-')) {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('utf-8').trim();
  }
  const positional = args.find((a) => !a.startsWith('-') && a.length > 20);
  if (positional) return positional.trim();
  throw new Error('нечего отправлять: дай --file <путь>, "-" для stdin или текст аргументом');
}

/**
 * Открытый тред ИМЕННО этого эпизода. Ровно первая ветка `resolveOpenThreadId` —
 * серийный и глобальный фолбэки сознательно не воспроизводим: роут всё равно
 * отвергнет чужой тред (`route.ts:97-116`), а нам он и не нужен.
 * Тред может отсутствовать — тогда его заведёт сам роут, и это нормально.
 */
async function openThreadFor(episodeId: string): Promise<string | null> {
  const { data, error } = await sb
    .from('concierge_threads')
    .select('id')
    .eq('episode_id', episodeId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`поиск треда: ${error.message}`);
  return data?.[0]?.id ?? null;
}

/**
 * Память ума = ходы ЭТОГО треда. `director` — это Директор (для модели `user`),
 * `assistant` — она сама. `system` (ambient-события конвейера) не берём: роут
 * принимает только user/assistant, а лента событий — шум, за который ум платит
 * токенами.
 */
async function historyFor(threadId: string, limit: number): Promise<WireMessage[]> {
  const { data, error } = await sb
    .from('concierge_turns')
    .select('role,content,created_at')
    .eq('thread_id', threadId)
    .in('role', ['director', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`чтение истории: ${error.message}`);
  const ordered = (data ?? [])
    .reverse()
    .filter((t) => typeof t.content === 'string' && t.content.trim().length > 0)
    .map((t) => ({
      role: t.role === 'director' ? ('user' as const) : ('assistant' as const),
      content: t.content as string,
    }));

  // Подряд идущие одинаковые ходы — след ненадёжной браузерной отправки (в треде
  // E03 директорский ход записан дважды с разницей в 15 секунд, потому что клик
  // «отправить» не регистрировался и его повторили). Это артефакт сбоя, а не
  // намерение: ум, читающий один приказ дважды, вправе счесть это нажимом.
  return ordered.filter(
    (m, i) => i === 0 || m.role !== ordered[i - 1]!.role || m.content !== ordered[i - 1]!.content,
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const episodeId = arg(args, '--episode') ?? process.env.RUN_EPISODE_ID;

  if (!episodeId) {
    throw new Error(
      'не задан эпизод: --episode <uuid> или RUN_EPISODE_ID. Без него роут возьмёт ' +
        'последний открытый тред СТУДИИ — при нескольких эпизодах в работе это чужой ум.',
    );
  }

  const historyLimit = Number(arg(args, '--history') ?? DEFAULT_HISTORY);
  const content = await readContent(args);
  if (!content) throw new Error('сообщение пустое — роут откажет (нужен непустой user)');

  // Эпизод существует? Опечатка в uuid иначе уедет в невнятный отказ роута.
  const { data: ep, error: epErr } = await sb
    .from('episodes')
    .select('episode_code,title_working')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`чтение эпизода: ${epErr.message}`);
  if (!ep) throw new Error(`эпизода ${episodeId} нет — RUN_EPISODE_ID/--episode указывает в никуда`);

  const threadId = await openThreadFor(episodeId);
  const history = threadId ? await historyFor(threadId, historyLimit) : [];
  const messages: WireMessage[] = [...history, { role: 'user', content }];

  console.log(`эпизод: ${ep.episode_code} «${ep.title_working}»`);
  console.log(`тред:   ${threadId ?? '(нет — заведёт роут)'}`);
  console.log(`память: ${history.length} ходов (потолок ${historyLimit}) · новый ход ${content.length} символов`);

  if (dryRun) {
    console.log('\n--dry-run: ничего не отправлено. Что ушло бы:');
    for (const m of messages) {
      console.log(`  [${m.role}] ${m.content.replace(/\s+/g, ' ').slice(0, 100)}`);
    }
    return;
  }

  // Заголовок Authorization обязателен НЕ роуту, а middleware: любой `/api/*` с
  // ним проходит без Supabase-куки (`middleware.ts:35-37`). Куки не шлём
  // сознательно — по ней роут решает, разрешена ли публикация, и хард-лимит
  // Директора должен остаться закрытым для headless-хода.
  const token = process.env.EXEC_DIR_AI_TOKEN;
  if (!token) throw new Error('EXEC_DIR_AI_TOKEN нет в .env.local');
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const startedAt = new Date().toISOString();
  const res = await fetch(`${base}/api/mind/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, threadId: threadId ?? undefined, episodeId }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`роут отказал: ${res.status} ${(await res.text()).slice(0, 400)}`);
  }
  const boundThread = res.headers.get('X-Concierge-Thread-Id');
  console.log(`\nтред ответа: ${boundThread}${threadId && boundThread !== threadId ? '  ← ДРУГОЙ, чем просили' : ''}`);
  console.log('─'.repeat(70));

  // Поток — JSON на строку, тот же протокол, что читает панель.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let ev: { t?: string; name?: string; ok?: boolean; v?: string; message?: string };
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.t === 'tool_start') console.log(`  ⚙ ${ev.name}`);
      else if (ev.t === 'tool_result') console.log(`  ${ev.ok ? '✓' : '✗'} ${ev.name}`);
      else if (ev.t === 'text' && ev.v) text += ev.v;
      else if (ev.t === 'error') console.error(`  ОШИБКА: ${ev.message}`);
    }
  }

  console.log('─'.repeat(70));
  console.log(text.trim() || '(текста в потоке не было)');

  // Земля, а не экран: ход обязан лежать строкой в базе. Роут пишет ассистентскую
  // строку ПОСЛЕ всего цикла — если её нет, значит показалось.
  const { data: landed } = await sb
    .from('concierge_turns')
    .select('id,role,created_at,metadata')
    .eq('thread_id', boundThread ?? threadId ?? '')
    .gte('created_at', startedAt)
    .in('role', ['assistant', 'system'])
    .order('created_at', { ascending: false })
    .limit(1);
  const row = landed?.[0];
  if (!row) {
    console.error('\n⚠ строки ответа в базе НЕТ — ход не записан, хотя поток пришёл');
    process.exitCode = 1;
    return;
  }
  const meta = (row.metadata ?? {}) as { tool_audit?: unknown[]; error?: boolean };
  console.log(
    `\nв базе: ${row.role} ${row.id} · инструментов ${meta.tool_audit?.length ?? 0}` +
      (meta.error ? ' · ЗАПИСАНА ОШИБКА' : ''),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
