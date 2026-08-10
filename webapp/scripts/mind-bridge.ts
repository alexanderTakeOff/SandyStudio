// МОСТ (Ф2 миграции «Полина в харнес») — единственная НОВАЯ деталь конструкции.
//
// Канал = БАЗА, не HTTP: панель и кнопки Директора ПИШУТ строку в
// `concierge_turns`; мост опрашивает непринятые director-строки, спавнит ХОД
// headless-сессии Claude Code в клоне Полины (`claude -p --resume`) и пишет её
// реплики обратно в те же turns. Панель уже слушает turns Realtime'ом — живость
// приходит бесплатно, нового протокола нет.
//
// Законы (docs/plans/polina-harness-migration.md Ф2):
//  · сессия = эпизод: карта в `episodes.metadata.mind_session`;
//    session_id перечитывается из result-события КАЖДЫЙ ход;
//  · один ход на эпизод: замок busy{pid} в той же карте; сообщения Директора,
//    пришедшие во время хода, буферизуются и уходят СЛЕДУЮЩИМ ходом;
//  · деньги: `result.total_cost_usd` → строка budget_log (оценка движка, не
//    сочинённая цифра — D95);
//  · подписка: ANTHROPIC_API_KEY в env ХОДА НЕ передаётся — иначе биллинг
//    молча переключается на API (смоук Ш54);
//  · хуки клона работают только с явным --settings (смоук Ш54).
//
// Запуск: npx tsx scripts/mind-bridge.ts   (из webapp/; попадёт в start-stack)
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { sb } from './run/_env';
import { persistTurn, getThread } from '../lib/concierge/threads';

const CLONE_DIR = process.env.POLINA_CLONE_DIR ?? 'C:\\SandyStudio-polina';
const CLONE_WEBAPP = resolve(CLONE_DIR, 'webapp');
const ROLE_FILE = resolve(CLONE_WEBAPP, 'roles', 'polina.md');
// НЕ settings.json репо (его делят сессии Тео) — отдельный файл Полины,
// подаётся явно (--settings — иначе хуки в headless не грузятся, Ш54).
const SETTINGS_FILE = resolve(CLONE_DIR, '.claude', 'polina-settings.json');
const MODEL = process.env.MIND_BRIDGE_MODEL ?? 'opus';
const POLL_MS = 2_500;
const TURN_TIMEOUT_MS = Number(process.env.MIND_BRIDGE_TURN_TIMEOUT_MS ?? 45 * 60 * 1000);
// Полный набор рук; границы держат хуки (Ф3) и права клона, не кастрация списка.
const ALLOWED_TOOLS = 'Bash,Read,Glob,Grep,Write,Edit,Agent,Task,Skill,TodoWrite';

interface MindSession {
  session_id?: string;
  busy?: { pid: number; turn_ids: string[]; started_at: string } | null;
  /** Токенов в последнем запросе хода = длина разговора, которую держит модель. */
  context_tokens?: number;
  updated_at?: string;
}

/** Ходы в полёте — по эпизоду. In-memory + зеркало в episodes.metadata. */
const inFlight = new Map<string, ChildProcessWithoutNullStreams>();

/**
 * Ф4: события студии, которые БУДЯТ Полину (кнопки Директора и просьбы
 * конвейера). Список моста, не общий actionable: старое платное пробуждение
 * (exec-pa-react → мёртвый роут, D93) умирает на Ф6, а `asset_created` от её
 * же инструментов будить не должен — эхо-защита по построению.
 */
const WAKE_EVENT_TYPES = new Set([
  'approval_granted',
  'pipeline_started',
  'episode_settings_changed',
  'decision_requested',
  'input_requested',
  'agent_failed',
  'approval_revision',
  'approval_rejected',
  'blocker_raised',
  'budget_threshold_reached',
  'revision_requested',
  'canon_extension_proposed',
]);

/**
 * События старше старта моста не проигрываются: у прошлых недель есть
 * непринятые system-строки, и wake по ним был бы платным разбором древностей.
 * Событие, случившееся при мёртвом мосте, пропадает — известное ограничение v1.
 */
const BRIDGE_EPOCH = new Date().toISOString();

function log(msg: string): void {
  console.log(`[bridge ${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function readMindSession(episodeId: string): Promise<{ meta: Record<string, unknown>; mind: MindSession }> {
  const { data, error } = await sb.from('episodes').select('metadata').eq('id', episodeId).maybeSingle();
  if (error || !data) throw new Error(`эпизод ${episodeId}: ${error?.message ?? 'не найден'}`);
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  return { meta, mind: (meta.mind_session ?? {}) as MindSession };
}

async function writeMindSession(episodeId: string, patch: Partial<MindSession>): Promise<void> {
  const { meta, mind } = await readMindSession(episodeId);
  const next = { ...meta, mind_session: { ...mind, ...patch, updated_at: new Date().toISOString() } };
  const { error } = await sb.from('episodes').update({ metadata: next }).eq('id', episodeId);
  if (error) throw new Error(`mind_session write (${episodeId}): ${error.message}`);
}

/** Отметить строки как принятые мостом — иначе следующий опрос заберёт их снова. */
async function claimTurns(ids: string[], state: string): Promise<void> {
  for (const id of ids) {
    const { data } = await sb.from('concierge_turns').select('metadata').eq('id', id).maybeSingle();
    const meta = (data?.metadata ?? {}) as Record<string, unknown>;
    await sb
      .from('concierge_turns')
      .update({ metadata: { ...meta, bridge: { state, at: new Date().toISOString() } } })
      .eq('id', id);
  }
}

/** Спавн одного хода Полины. Возвращается после завершения процесса. */
async function runTurn(args: {
  episodeId: string;
  seriesId: string | null;
  threadId: string;
  text: string;
  turnIds: string[];
}): Promise<void> {
  const { mind } = await readMindSession(args.episodeId);

  const cli: string[] = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--model', MODEL,
    '--allowedTools', ALLOWED_TOOLS,
    '--append-system-prompt-file', ROLE_FILE,
  ];
  if (mind.session_id) cli.push('--resume', mind.session_id);
  if (existsSync(SETTINGS_FILE)) cli.push('--settings', SETTINGS_FILE);

  // Подписка, не API: ключ вычищается из env хода (Ш54). Остальное окружение —
  // как у моста; RUN_* выставляются на ход, инструменты клона читают их из env.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  env.RUN_EPISODE_ID = args.episodeId;
  if (args.seriesId) env.RUN_SERIES_ID = args.seriesId;

  log(`ход → эпизод ${args.episodeId.slice(0, 8)} (${mind.session_id ? 'resume ' + mind.session_id.slice(0, 8) : 'новая сессия'})`);
  const child = spawn('claude', cli, {
    cwd: CLONE_WEBAPP,
    env,
    shell: true, // npm-shim claude.cmd на Windows не спавнится без shell
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  inFlight.set(args.episodeId, child);
  await writeMindSession(args.episodeId, {
    busy: { pid: child.pid ?? -1, turn_ids: args.turnIds, started_at: new Date().toISOString() },
  });

  child.stdin.write(args.text, 'utf8');
  child.stdin.end();

  let finalText = '';
  let resultMeta: Record<string, unknown> = {};
  let stderrTail = '';
  let buf = '';

  child.stderr.on('data', (c: Buffer) => {
    stderrTail = (stderrTail + c.toString('utf8')).slice(-2000);
  });

  child.stdout.on('data', (c: Buffer) => {
    buf += c.toString('utf8');
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (ev.type === 'assistant') {
        // Вызовы инструментов — в тред как аудит (панель их пока не рисует,
        // но строка есть — Ф5 её покажет).
        const msg = ev.message as { content?: Array<Record<string, unknown>> } | undefined;
        for (const block of msg?.content ?? []) {
          if (block.type === 'tool_use') {
            const name = String(block.name ?? 'tool');
            const preview = JSON.stringify(block.input ?? {}).slice(0, 240);
            void persistTurn(sb as never, args.threadId, {
              role: 'tool',
              event_type: 'tool_call',
              content: `${name} ${preview}`,
              metadata: { bridge: true },
            }).catch(() => {});
          }
        }
      }
      if (ev.type === 'result') {
        finalText = String(ev.result ?? '');
        // Заполненность контекста (Директор, 10.08: «нужна кнопка или строчка —
        // насколько у Полины забит контекст»). Считаем по последнему запросу хода:
        // сколько токенов ушло в модель = прочитано из кэша + записано в кэш +
        // сырой вход. Это и есть длина разговора, которую модель держала перед
        // глазами; она растёт от хода к ходу и упирается в окно модели.
        const u = (ev.usage ?? {}) as Record<string, number>;
        const contextTokens =
          (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.input_tokens ?? 0);
        resultMeta = {
          session_id: ev.session_id,
          cost_usd: ev.total_cost_usd,
          num_turns: ev.num_turns,
          duration_ms: ev.duration_ms,
          is_error: ev.is_error,
          context_tokens: contextTokens || null,
        };
      }
    }
  });

  const timeout = setTimeout(() => {
    log(`ТАЙМАУТ хода (${TURN_TIMEOUT_MS / 60000} мин) — убиваю дерево pid=${child.pid}`);
    killTree(child.pid);
  }, TURN_TIMEOUT_MS);

  const code: number = await new Promise((res) => {
    child.on('close', (c) => res(c ?? -1));
    child.on('error', () => res(-1));
  });
  clearTimeout(timeout);
  inFlight.delete(args.episodeId);

  const sessionId = typeof resultMeta.session_id === 'string' ? resultMeta.session_id : mind.session_id;
  await writeMindSession(args.episodeId, {
    session_id: sessionId,
    busy: null,
    // Кладём рядом с сессией, чтобы панель показывала заполненность контекста
    // тем же чтением эпизода, которым уже показывает «Полина работает».
    context_tokens: typeof resultMeta.context_tokens === 'number' ? resultMeta.context_tokens : undefined,
  });

  if (finalText) {
    await persistTurn(sb as never, args.threadId, {
      role: 'assistant',
      event_type: 'message',
      content: finalText,
      metadata: { ...resultMeta, bridge: true },
    });
    // Деньги — оценкой движка (D95): цифра из result, не из головы.
    const cost = typeof resultMeta.cost_usd === 'number' ? resultMeta.cost_usd : null;
    if (cost !== null) {
      await sb.from('budget_log').insert({
        job_id: null,
        episode_id: args.episodeId,
        agent_id: 'POLINA-MIND',
        api_provider: 'anthropic',
        model_or_tier: `${MODEL}/subscription-estimate`,
        operation: 'mind-turn',
        cost_usd: cost,
        duration_ms: typeof resultMeta.duration_ms === 'number' ? resultMeta.duration_ms : null,
      });
    }
    await claimTurns(args.turnIds, 'answered');
    log(`ход ← ok · $${resultMeta.cost_usd ?? '?'} · exit=${code}`);
  } else {
    // Обрыв — честной строкой, а не молчанием (худший класс отказа — тишина).
    await persistTurn(sb as never, args.threadId, {
      role: 'system',
      event_type: 'message',
      content: `⚠ ход Полины оборван (exit=${code}). stderr: ${stderrTail.slice(-400) || '—'}`,
      metadata: { bridge: true, error: true },
    });
    await claimTurns(args.turnIds, 'failed');
    log(`ход ← ОБРЫВ exit=${code}`);
  }
}

function killTree(pid: number | undefined): void {
  if (!pid || pid < 0) return;
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {
    /* уже мёртв */
  }
}

/** Один проход опроса: отмены → новые сообщения. */
async function pollOnce(): Promise<void> {
  // 1. Отмены: message-строка с metadata.cancel (нового event_type нет —
  // CHECK базы знает 10 значений), ещё не принятая мостом.
  // `contains` по jsonb — сервер отдаёт ТОЛЬКО адресованные мосту строки;
  // без этого окно limit забивалось исторической перепиской старой копии.
  const { data: cancels } = await sb
    .from('concierge_turns')
    .select('id,thread_id,metadata')
    .eq('role', 'director')
    .eq('event_type', 'message')
    .contains('metadata', { for_bridge: true, cancel: true })
    .order('created_at', { ascending: true })
    .limit(20);
  for (const c of cancels ?? []) {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    if (!meta.cancel || !meta.for_bridge || meta.bridge) continue;
    const thread = await getThread(sb as never, c.thread_id);
    const episodeId = thread?.episode_id;
    if (episodeId && inFlight.has(episodeId)) {
      log(`ОТМЕНА эпизода ${episodeId.slice(0, 8)} по слову Директора`);
      killTree(inFlight.get(episodeId)?.pid);
    }
    await claimTurns([c.id], 'cancel-handled');
  }

  // 2. Непринятые сообщения Директора, старейшие первыми (только адресованные).
  const { data: turns } = await sb
    .from('concierge_turns')
    .select('id,thread_id,content,metadata,created_at')
    .eq('role', 'director')
    .eq('event_type', 'message')
    .contains('metadata', { for_bridge: true })
    .order('created_at', { ascending: true })
    .limit(50);

  const byThread = new Map<string, Array<{ id: string; content: string }>>();
  for (const t of turns ?? []) {
    const meta = (t.metadata ?? {}) as Record<string, unknown>;
    // СОСУЩЕСТВОВАНИЕ (до Ф5): мост берёт ТОЛЬКО адресованные ему строки
    // (`for_bridge`) — иначе он переиграл бы историю тредов старой копии и
    // отвечал бы дуэтом с живым /api/mind/chat. Панель начнёт ставить маркер
    // на Ф5; до этого канал моста — mind-say.
    if (!meta.for_bridge || meta.bridge || meta.cancel) continue;
    const list = byThread.get(t.thread_id) ?? [];
    list.push({ id: t.id, content: t.content });
    byThread.set(t.thread_id, list);
  }

  // 3. Ф4 — ПРОБУЖДЕНИЕ ПО СОБЫТИЯМ: system-строки инжекта триггера 0049
  // (кнопки Директора после 0056, просьбы конвейера). Кнопка = приказ работать.
  const { data: sysTurns } = await sb
    .from('concierge_turns')
    .select('id,thread_id,content,metadata,created_at')
    .eq('role', 'system')
    .eq('event_type', 'message')
    .contains('metadata', { kind: 'pipeline_event' })
    .gt('created_at', BRIDGE_EPOCH)
    .order('created_at', { ascending: true })
    .limit(30);
  for (const t of sysTurns ?? []) {
    const meta = (t.metadata ?? {}) as Record<string, unknown>;
    if (meta.bridge) continue;
    if (!WAKE_EVENT_TYPES.has(String(meta.event_type))) {
      await claimTurns([t.id], 'wake-skip');
      continue;
    }
    const list = byThread.get(t.thread_id) ?? [];
    list.push({ id: t.id, content: `[СОБЫТИЕ СТУДИИ] ${t.content}` });
    byThread.set(t.thread_id, list);
  }

  for (const [threadId, items] of byThread) {
    const thread = await getThread(sb as never, threadId);
    const episodeId = thread?.episode_id;
    if (!episodeId) {
      // Студийные треды без эпизода мост не ведёт (сессия = эпизод).
      await claimTurns(items.map((i) => i.id), 'skipped-no-episode');
      continue;
    }
    if (inFlight.has(episodeId)) continue; // буферизуется до следующего хода

    const ids = items.map((i) => i.id);
    await claimTurns(ids, 'claimed');
    const text = items.map((i) => i.content).join('\n\n');
    void runTurn({
      episodeId,
      seriesId: thread?.series_id ?? null,
      threadId,
      text,
      turnIds: ids,
    }).catch(async (e) => {
      log(`ход упал: ${e instanceof Error ? e.message : e}`);
      inFlight.delete(episodeId);
      await writeMindSession(episodeId, { busy: null }).catch(() => {});
    });
  }
}

async function main(): Promise<void> {
  if (!existsSync(ROLE_FILE)) {
    throw new Error(`роль не найдена: ${ROLE_FILE} — сгенерируй в клоне (gen-role-polina --write)`);
  }
  // Чистка замков, переживших прошлый мост: их pid мертвы вместе с ним.
  const { data: lockedEps } = await sb.from('episodes').select('id,metadata').not('metadata->mind_session', 'is', null);
  for (const ep of lockedEps ?? []) {
    const mind = ((ep.metadata as Record<string, unknown>)?.mind_session ?? {}) as MindSession;
    if (mind.busy) {
      log(`снимаю осиротевший замок эпизода ${ep.id.slice(0, 8)} (pid=${mind.busy.pid})`);
      await writeMindSession(ep.id, { busy: null });
    }
  }
  log(`мост запущен · клон=${CLONE_WEBAPP} · модель=${MODEL} · опрос ${POLL_MS}мс`);
  for (;;) {
    try {
      await pollOnce();
    } catch (e) {
      log(`опрос упал (переживаю): ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  console.error('мост умер:', e);
  process.exit(1);
});
