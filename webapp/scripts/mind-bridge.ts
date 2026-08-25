// МОСТ (Ф2 миграции «Полина в харнес») — единственная НОВАЯ деталь конструкции.
//
// Канал = БАЗА, не HTTP: панель и кнопки Директора ПИШУТ строку в
// `concierge_turns`; мост опрашивает непринятые director-строки, спавнит ХОД
// headless-сессии Claude Code в клоне Полины (`claude -p --resume`) и пишет её
// реплики обратно в те же turns. Панель уже слушает turns Realtime'ом — живость
// приходит бесплатно, нового протокола нет.
//
// Законы (docs/plans/polina-harness-migration.md Ф2):
//  · СЕССИЯ = ТРЕД, а тред = сущность, которую открыл Директор: эпизод, сериал
//    или студия (12.08, `concierge_threads.mind_session`, миграция 0057). До
//    этого сессия жила на ЭПИЗОДЕ, и разговоров уровня сериала/студии не
//    существовало вовсе — мост их пропускал, а чат вне эпизода печатал 404;
//    session_id перечитывается из result-события КАЖДЫЙ ход;
//  · один ход на тред: замок busy{pid} в той же карте; сообщения Директора,
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
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sb } from './run/_env';
import {
  persistTurn,
  getThread,
  readThreadMindSession,
  writeThreadMindSession,
  type MindSessionMap,
} from '../lib/concierge/threads';
import {
  coerceConciergeProviderChoice,
} from '../lib/api/concierge-provider-config';
import {
  buildHarnessInvocation,
  consumeCodexJsonEvent,
  nextProviderSessions,
  providerSessionId,
  sanitizeSubscriptionEnv,
  type CodexJsonState,
  type MindHarnessChoice,
} from '../lib/concierge/mind-harness';

const CLONE_DIR = process.env.POLINA_CLONE_DIR ?? 'C:\\SandyStudio-polina';
const CLONE_WEBAPP = resolve(CLONE_DIR, 'webapp');
const ROLE_FILE = resolve(CLONE_WEBAPP, 'roles', 'polina.md');
// НЕ settings.json репо (его делят сессии Тео) — отдельный файл Полины,
// подаётся явно (--settings — иначе хуки в headless не грузятся, Ш54).
const SETTINGS_FILE = resolve(CLONE_DIR, '.claude', 'polina-settings.json');
const STUDIO_FILMS_DIR = process.env.MIND_STUDIO_FILMS_DIR ?? 'C:\\SandyStudio\\FILMS';
/** Фолбэк только для ОТСУТСТВУЮЩЕЙ строки Settings, не для неподдерживаемого выбора. */
const HARNESS_FALLBACK: MindHarnessChoice = {
  provider: 'claude-code',
  model: process.env.MIND_BRIDGE_MODEL ?? 'opus',
};
const POLL_MS = 2_500;
const TURN_TIMEOUT_MS = Number(process.env.MIND_BRIDGE_TURN_TIMEOUT_MS ?? 45 * 60 * 1000);
// Полный набор рук; границы держат хуки (Ф3) и права клона, не кастрация списка.
/**
 * ДВЕ РУКИ, А НЕ ОДНА (12.08, оплачено остановкой работы над E07).
 *
 * `PowerShell` добавлен потому, что в списке его не было — и Полина, потеряв Bash
 * на незакрытой кавычке, осталась вообще без исполнения: «npx через PowerShell
 * требует подтверждения, которое я себе выдать не могу». Одна опечатка в кавычках
 * обезоруживала ум целиком — при полном контексте, живом процессе и целых
 * изделиях, — и единственным лечением казался перезапуск сессии с потерей 439k
 * рабочей памяти.
 *
 * Гейт денег держит КОД инструмента (`assertEpisodeReadyToSpend`), одинаковый для
 * обеих рук, — а не хук над одной. PreToolUse снят 14.08.
 *
 * ГЛАЗА (16.08). `WebSearch`/`WebFetch` не были в списке, и ум упирался в стену,
 * которую словом не снять: «разрешение выдаётся не репликой в треде, а правами
 * сессии». Требования площадки к обложке нечем было прочитать — а гадать про
 * чужой формат дороже, чем посмотреть. Тот же класс, что отсутствие PowerShell:
 * список рук молчаливо решает, что уму МОЖНО УЗНАТЬ.
 */
const ALLOWED_TOOLS =
  'Bash,PowerShell,Read,Glob,Grep,Write,Edit,Agent,Task,Skill,TodoWrite,WebSearch,WebFetch';

/** Ходы в полёте — ПО ТРЕДУ. In-memory + зеркало в concierge_threads.mind_session. */
const inFlight = new Map<string, ChildProcessWithoutNullStreams>();

/**
 * Подряд идущие обрывы по треду. Залипший шелл (незакрытая кавычка) валит
 * КАЖДЫЙ следующий ход, и внешне это неотличимо от обычной неудачи — 10.08
 * потратили четыре хода, прежде чем поняли. Считаем и говорим вслух; сбрасывает
 * сессию ДИРЕКТОР кнопкой, а не мост: ход падает и от таймаута, и от сети, а
 * молча выкидывать память Полины машина не вправе.
 */
const failStreak = new Map<string, number>();
const FAIL_STREAK_HINT_AT = 2;

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

/**
 * МОДЕЛЬ УМА — из НАСТРОЕК СТУДИИ, а не из env (закон Директора: «провайдеры
 * меняются через Studio Settings»). Читается ПЕРЕД КАЖДЫМ ходом: выбор в UI
 * действует со следующего сообщения, без перезапуска моста и пересборки.
 *
 * Два исполнимых пути: Claude Code и OpenAI Codex CLI — оба по подписке.
 * Явная неподдерживаемая строка падает громко; на Opus не подменяется.
 */
async function resolveHarnessChoice(): Promise<MindHarnessChoice> {
  try {
    const { data, error } = await sb
      .from('app_config')
      .select('value')
      .eq('scope', 'providers')
      .eq('key', 'concierge_provider')
      .maybeSingle();
    if (error) throw error;
    if (!data) return HARNESS_FALLBACK;
    const raw = (data as { value?: unknown }).value;
    const normalized = coerceConciergeProviderChoice(raw);
    if (!normalized || (normalized.provider !== 'claude-code' && normalized.provider !== 'codex')) {
      const requested = raw as { provider?: unknown; model?: unknown } | null;
      throw new Error(
        `Settings просят неисполнимый harness ` +
          `${String(requested?.provider ?? '?')}/${String(requested?.model ?? '?')}`,
      );
    }
    return normalized as MindHarnessChoice;
  } catch (e) {
    throw new Error(`настройка harness неисполнима: ${e instanceof Error ? e.message : e}`);
  }
}

// СЕССИЯ ЖИВЁТ НА ТРЕДЕ (0057). Раньше карта лежала в `episodes.metadata`, и это
// привязывало ум к одной сущности: студийные и сериальные разговоры вести было
// негде. Тред уже знает свою сущность, поэтому сессия следует за ней сама.
const readMindSession = (threadId: string) => readThreadMindSession(sb as never, threadId);
const writeMindSession = (threadId: string, patch: Partial<MindSessionMap>) =>
  writeThreadMindSession(sb as never, threadId, patch);

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
  /** Сущность треда: эпизод, сериал или ничего (студийный разговор). */
  episodeId: string | null;
  seriesId: string | null;
  threadId: string;
  text: string;
  turnIds: string[];
  /** Вкладка сайдбара, на которой Директор говорит. */
  tab: string | null;
}): Promise<void> {
  const mind = await readMindSession(args.threadId);
  const choice = await resolveHarnessChoice();
  const previousSessionId = providerSessionId(mind, choice.provider);
  const invocation = buildHarnessInvocation(choice, previousSessionId, {
    cloneWebapp: CLONE_WEBAPP,
    roleFile: ROLE_FILE,
    claudeSettingsFile: SETTINGS_FILE,
    studioFilmsDir: STUDIO_FILMS_DIR,
    allowedClaudeTools: ALLOWED_TOOLS,
  });

  // Подписка, не API: ключ вычищается из env хода (Ш54). Остальное окружение —
  // как у моста; RUN_* выставляются на ход, инструменты клона читают их из env.
  //
  // RUN_* выставляются ТОЛЬКО те, что у треда есть: на студийном разговоре нет
  // эпизода, и подсунуть ей чужой хуже, чем не дать никакого — инструменты
  // эпизода отказали бы честно, а с чужим id молча сделали бы не ту работу.
  const env = sanitizeSubscriptionEnv(process.env);
  delete env.RUN_EPISODE_ID;
  delete env.RUN_SERIES_ID;
  if (args.episodeId) env.RUN_EPISODE_ID = args.episodeId;
  if (args.seriesId) env.RUN_SERIES_ID = args.seriesId;

  const where = args.episodeId
    ? `эпизод ${args.episodeId.slice(0, 8)}`
    : args.seriesId
      ? `сериал ${args.seriesId.slice(0, 8)}`
      : 'студия';
  log(
    `ход → ${where} · ${choice.provider}/${choice.model} ` +
      `(${previousSessionId ? 'resume ' + previousSessionId.slice(0, 8) : 'новая сессия'})`,
  );
  const child = spawn(invocation.command, invocation.args, {
    cwd: CLONE_WEBAPP,
    env,
    shell: true, // npm-shim claude.cmd на Windows не спавнится без shell
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  inFlight.set(args.threadId, child);
  await writeMindSession(args.threadId, {
    busy: { pid: child.pid ?? -1, turn_ids: args.turnIds, started_at: new Date().toISOString() },
    // Шапка чата показывает ИСПОЛНЕННОЕ, а не выбранное в настройке.
    provider: choice.provider,
    model: choice.model,
  });

  // ОБСТАНОВКА (12.08): вкладка — параметр внутри сессии, а не своя сессия
  // (решение Директора 21). Полина видит, на что он смотрит, и не тратит ход на
  // выяснение. Одна строка перед сообщением; коды берём здесь, чтобы в тексте
  // стояли имена, а не uuid.
  const scene: string[] = [];
  if (args.tab) scene.push(`вкладка «${args.tab}»`);
  if (args.episodeId) {
    const { data } = await sb.from('episodes').select('episode_code').eq('id', args.episodeId).maybeSingle();
    scene.push(`эпизод ${(data as { episode_code?: string } | null)?.episode_code ?? args.episodeId.slice(0, 8)}`);
  } else if (args.seriesId) {
    const { data } = await sb.from('series').select('code').eq('id', args.seriesId).maybeSingle();
    scene.push(`сериал ${(data as { code?: string } | null)?.code ?? args.seriesId.slice(0, 8)}`);
  } else {
    scene.push('уровень СТУДИИ — открытого эпизода нет');
  }
  const turnPayload = `[ОБСТАНОВКА] Директор смотрит: ${scene.join(' · ')}\n\n${args.text}`;
  const payload =
    choice.provider === 'codex' && !previousSessionId
      ? `[АДАПТАЦИЯ HARNESS] В роли слова Claude Code/Bash исторические. ` +
        `Ты работаешь в Codex CLI с эквивалентными shell/файл/изображение tools.\n\n` +
        `${readFileSync(ROLE_FILE, 'utf8')}\n\n${turnPayload}`
      : turnPayload;

  child.stdin.write(payload, 'utf8');
  child.stdin.end();

  let finalText = '';
  /** Токенов в ПОСЛЕДНЕМ запросе хода = длина разговора перед глазами модели. */
  let lastRequestTokens = 0;
  // Окно модели НЕ хардкодим в панели: у 1M-варианта Opus оно впятеро больше, чем
  // у обычного, и вчерашние «200k» дали Директору 519% при живых 209k. Мост знает,
  // какой моделью запускает ход, — он и сообщает предел вместе с числом.
  const contextLimit = Number(
    choice.provider === 'codex'
      ? process.env.MIND_CODEX_CONTEXT_LIMIT ?? invocation.contextLimit
      : process.env.MIND_CONTEXT_LIMIT ?? invocation.contextLimit,
  );
  let resultMeta: Record<string, unknown> = {};
  let codexState: CodexJsonState = {};
  const turnStartedAt = Date.now();
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
      if (choice.provider === 'codex') {
        const auditCount = codexState.commandAudits?.length ?? 0;
        codexState = consumeCodexJsonEvent(codexState, ev);
        const latestAudits = codexState.commandAudits ?? [];
        if (latestAudits.length > auditCount) {
          const command = latestAudits.at(-1) ?? 'command';
          void persistTurn(sb as never, args.threadId, {
            role: 'tool',
            event_type: 'tool_call',
            content: `Bash ${command}`,
            metadata: { bridge: true, provider: 'codex' },
          }).catch(() => {});
        }
        continue;
      }
      if (ev.type === 'assistant') {
        // ЗАПОЛНЕННОСТЬ КОНТЕКСТА берётся отсюда, а не из `result` (исправлено
        // 11.08). В `result.usage` лежит СУММА по всем запросам хода: за ход из
        // двадцати обращений кэш-чтение складывается двадцать раз, и панель
        // показала Директору «1038k / 200k · 519%». Длина разговора — это размер
        // ОДНОГО, последнего запроса: сколько модель держала перед глазами в этот
        // момент. Поэтому запоминаем usage последнего ответа ассистента.
        const usage = (ev.message as { usage?: Record<string, number> } | undefined)?.usage;
        if (usage) {
          lastRequestTokens =
            (usage.cache_read_input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.input_tokens ?? 0);
        }
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
        const contextTokens = lastRequestTokens;
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
  inFlight.delete(args.threadId);

  if (choice.provider === 'codex') {
    finalText = codexState.finalText ?? '';
    resultMeta = {
      session_id: codexState.sessionId ?? previousSessionId,
      cost_usd: 0,
      duration_ms: Date.now() - turnStartedAt,
      is_error: codexState.isError ?? code !== 0,
      error: codexState.error,
      context_tokens: codexState.contextTokens ?? null,
      input_tokens: codexState.inputTokens,
      cached_input_tokens: codexState.cachedInputTokens,
      output_tokens: codexState.outputTokens,
    };
  }

  const sessionId =
    typeof resultMeta.session_id === 'string' ? resultMeta.session_id : previousSessionId;
  await writeMindSession(args.threadId, {
    session_id: sessionId,
    session_ids: nextProviderSessions(mind, choice.provider, sessionId),
    provider: choice.provider,
    model: choice.model,
    busy: null,
    // Кладём рядом с сессией, чтобы панель показывала заполненность контекста
    // тем же чтением эпизода, которым уже показывает «Полина работает».
    context_tokens: typeof resultMeta.context_tokens === 'number' ? resultMeta.context_tokens : undefined,
    context_limit: contextLimit,
  });

  if (finalText) {
    await persistTurn(sb as never, args.threadId, {
      role: 'assistant',
      event_type: 'message',
      content: finalText,
      metadata: {
        ...resultMeta,
        bridge: true,
        provider: choice.provider,
        model: choice.model,
      },
    });
    // Деньги — оценкой движка (D95): цифра из result, не из головы.
    const cost = typeof resultMeta.cost_usd === 'number' ? resultMeta.cost_usd : null;
    if (cost !== null) {
      await sb.from('budget_log').insert({
        job_id: null,
        episode_id: args.episodeId,
        series_id: args.seriesId,
        agent_id: 'POLINA-MIND',
        api_provider: invocation.apiProvider,
        model_or_tier:
          choice.provider === 'codex'
            ? `${choice.model}/subscription`
            : `${choice.model}/subscription-estimate`,
        operation: 'mind-turn',
        cost_usd: cost,
        duration_ms: typeof resultMeta.duration_ms === 'number' ? resultMeta.duration_ms : null,
      });
    }
    await claimTurns(args.turnIds, 'answered');
    failStreak.delete(args.threadId);
    log(`ход ← ok · ${choice.provider}/${choice.model} · $${resultMeta.cost_usd ?? '?'} · exit=${code}`);
  } else {
    // Обрыв — честной строкой, а не молчанием (худший класс отказа — тишина).
    await persistTurn(sb as never, args.threadId, {
      role: 'system',
      event_type: 'message',
      content: `⚠ ход Полины оборван (exit=${code}). stderr: ${stderrTail.slice(-400) || '—'}`,
      metadata: { bridge: true, error: true },
    });
    await claimTurns(args.turnIds, 'failed');
    const streak = (failStreak.get(args.threadId) ?? 0) + 1;
    failStreak.set(args.threadId, streak);
    if (streak >= FAIL_STREAK_HINT_AT) {
      await persistTurn(sb as never, args.threadId, {
        role: 'system',
        event_type: 'message',
        content:
          `⚠ ходов подряд оборвано: ${streak}. Похоже на залипший шелл сессии — новый ход это не лечит, ` +
          '«--resume» тянет состояние вместе с сессией. Помогает кнопка «Новая сессия ума».',
        metadata: { bridge: true, kind: 'mind_session_stuck_hint', fail_streak: streak },
      });
    }
    log(`ход ← ОБРЫВ exit=${code} · подряд: ${streak}`);
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
    .filter('metadata->bridge', 'is', null)
    .order('created_at', { ascending: true })
    .limit(20);
  for (const c of cancels ?? []) {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    if (!meta.cancel || !meta.for_bridge || meta.bridge) continue;
    if (inFlight.has(c.thread_id)) {
      log(`ОТМЕНА хода треда ${c.thread_id.slice(0, 8)} по слову Директора`);
      killTree(inFlight.get(c.thread_id)?.pid);
    }
    await claimTurns([c.id], 'cancel-handled');
  }

  // 2. Непринятые сообщения Директора, старейшие первыми (только адресованные).
  //
  // «НЕПРИНЯТЫЕ» ОТБИРАЕТ БАЗА, А НЕ ЦИКЛ (12.08, оплачено четырьмя потерянными
  // сообщениями и жалобой «Полина не отвечает»). Раньше отметка `metadata.bridge`
  // проверялась ПОСЛЕ выборки, а `limit(50)` с сортировкой по возрастанию отдавал
  // пятьдесят САМЫХ СТАРЫХ строк. Как только принятых накопилось пятьдесят, окно
  // забилось ими целиком: мост честно выбирал, честно отбрасывал все до одной и
  // не видел ничего нового НИКОГДА — при живом процессе, без единой ошибки в логе.
  // Отказ был бесшумным: последняя запись в bridge.log сделана за 39 минут до
  // того, как Директор заметил молчание.
  const { data: turns } = await sb
    .from('concierge_turns')
    .select('id,thread_id,content,metadata,created_at')
    .eq('role', 'director')
    .eq('event_type', 'message')
    .contains('metadata', { for_bridge: true })
    .filter('metadata->bridge', 'is', null)
    .order('created_at', { ascending: true })
    .limit(50);

  const byThread = new Map<string, Array<{ id: string; content: string }>>();
  // Вкладка последней строки треда — обстановка, в которой Директор говорит.
  const tabByThread = new Map<string, string>();
  for (const t of turns ?? []) {
    const meta = (t.metadata ?? {}) as Record<string, unknown>;
    // СОСУЩЕСТВОВАНИЕ (до Ф5): мост берёт ТОЛЬКО адресованные ему строки
    // (`for_bridge`) — иначе он переиграл бы историю тредов старой копии и
    // отвечал бы дуэтом с живым /api/mind/chat. Панель начнёт ставить маркер
    // на Ф5; до этого канал моста — mind-say.
    if (!meta.for_bridge || meta.bridge || meta.cancel) continue;
    if (typeof meta.tab === 'string' && meta.tab) tabByThread.set(t.thread_id, meta.tab);
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
    // Та же болезнь, что в пункте 2, только медленнее: без этого фильтра окно
    // забивается уже принятыми событиями и будильник перестаёт звонить.
    .filter('metadata->bridge', 'is', null)
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
    // Тред БЕЗ эпизода теперь законен: это разговор уровня сериала или студии
    // (12.08). Прежний пропуск 'skipped-no-episode' и был причиной, по которой
    // ум существовал только внутри эпизода.
    const thread = await getThread(sb as never, threadId);
    if (inFlight.has(threadId)) continue; // буферизуется до следующего хода

    const ids = items.map((i) => i.id);
    await claimTurns(ids, 'claimed');
    const text = items.map((i) => i.content).join('\n\n');
    void runTurn({
      episodeId: thread?.episode_id ?? null,
      seriesId: thread?.series_id ?? null,
      threadId,
      text,
      turnIds: ids,
      tab: tabByThread.get(threadId) ?? null,
    }).catch(async (e) => {
      const message = e instanceof Error ? e.message : String(e);
      log(`ход упал: ${message}`);
      inFlight.delete(threadId);
      await writeMindSession(threadId, { busy: null }).catch(() => {});
      await persistTurn(sb as never, threadId, {
        role: 'system',
        event_type: 'message',
        content: `⚠ ход Полины не запущен: ${message}`,
        metadata: { bridge: true, error: true, kind: 'mind_harness_unavailable' },
      }).catch(() => {});
      await claimTurns(ids, 'failed').catch(() => {});
    });
  }
}

async function main(): Promise<void> {
  if (!existsSync(ROLE_FILE)) {
    throw new Error(`роль не найдена: ${ROLE_FILE} — сгенерируй в клоне (gen-role-polina --write)`);
  }
  // Чистка замков, переживших прошлый мост: их pid мертвы вместе с ним.
  const { data: lockedThreads } = await sb
    .from('concierge_threads')
    .select('id,mind_session')
    .not('mind_session', 'is', null);
  for (const t of lockedThreads ?? []) {
    const mind = ((t as { mind_session?: MindSessionMap }).mind_session ?? {}) as MindSessionMap;
    if (mind.busy) {
      log(`снимаю осиротевший замок треда ${t.id.slice(0, 8)} (pid=${mind.busy.pid})`);
      await writeMindSession(t.id, { busy: null });
    }
  }
  log(
    `мост запущен · клон=${CLONE_WEBAPP} · harness берётся из Studio Settings ` +
      `(фолбэк ${HARNESS_FALLBACK.provider}/${HARNESS_FALLBACK.model}) · опрос ${POLL_MS}мс`,
  );
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
