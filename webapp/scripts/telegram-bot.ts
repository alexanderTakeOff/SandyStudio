// ПУЛЬТ В КАРМАНЕ — телеграм как второй вход к Полине и второе окно в студию.
//
// Директор 12.08: смотреть и отвечать Полине с телефона, с кнопками под
// вопросами и обменом медиа в обе стороны. Claude Code на смартфоне для этого
// не годится: он поднимает сессию в облачной песочнице, а не на домашней машине,
// и до моста, стека и рабочего дерева ему хода нет.
//
// Конструкция стоит на том, что уже построено, и НЕ заводит своих механизмов:
//   вход  — `persistTurn` в тот же тред, что у `mind-say.ts`; мост подхватывает
//           строку с `metadata.for_bridge` и ведёт ход. Бот про мост не знает.
//   медиа — на выход `ensureCachedMedia`; на вход пульт НЕ сортирует ничего:
//           файл ложится рядом с прогоном, а чем ему стать — решает ум (см. ниже).
//   кнопки — формат нумерованных вопросов Директора: `callback_data` это код
//           `<NN><цифра>`, который он набрал бы руками. См. lib/telegram/questions.ts.
//
// Связь исходящая (long polling) — портов наружу не открываем.
//
//   npx tsx scripts/telegram-bot.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sb } from './run/_env';
import { createThread, persistTurn, resolveOpenThreadId } from '../lib/concierge/threads';
import { ensureCachedMedia } from '../lib/media-cache';
import { keyboardForText } from '../lib/telegram/questions';
import {
  answerCallback,
  downloadFile,
  getFilePath,
  getMe,
  getUpdates,
  sendFile,
  sendMessage,
  type TgMessage,
  type TgUpdate,
} from '../lib/telegram/api';

const STATE_FILE = resolve(process.cwd(), '..', 'FILMS', '_run', 'telegram-bot-state.json');
const POLL_STUDIO_MS = 3_000;
/** Пульт идёт за словом Директора; пока слова не было — идти некуда. */
const NO_PLACE = 'Директор ещё нигде не говорил — напиши в панели или /e SS-S20-E08';

interface BotState {
  /**
   * Сущность (эпизод или сериал), за которой пульт шёл в прошлый раз — только чтобы
   * заметить переход и сказать о нём. Своего «выбранного эпизода» у пульта НЕТ:
   * он идёт за словом Директора (см. `followedEntity`).
   */
  followKey: string | null;
  lastUpdateId: number;
  /** Метка последней доставленной реплики и последнего доставленного изделия. */
  lastTurnAt: string;
  lastAssetAt: string;
}

function loadState(): BotState {
  const nowIso = new Date().toISOString();
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Partial<BotState>;
    return {
      followKey: raw.followKey ?? null,
      lastUpdateId: raw.lastUpdateId ?? 0,
      lastTurnAt: raw.lastTurnAt ?? nowIso,
      lastAssetAt: raw.lastAssetAt ?? nowIso,
    };
  } catch {
    return { followKey: null, lastUpdateId: 0, lastTurnAt: nowIso, lastAssetAt: nowIso };
  }
}

function saveState(s: BotState): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

/**
 * Белый список — ОТКАЗ ПО УМОЛЧАНИЮ. Бот с публичным именем находится поиском;
 * пока список пуст, он отвечает только «твой chat_id» и хода никому не даёт.
 */
function allowedChats(): number[] {
  return (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n !== 0);
}

// ─────────────────────────── студия ───────────────────────────

interface Followed {
  episodeId: string | null;
  seriesId: string | null;
  /** Что показать человеку: `SS-S20-E08` или код сериала. */
  code: string;
}

/**
 * Пульт идёт за СЛОВОМ Директора: сущность (эпизод/сериал) треда его последней
 * реплики — откуда бы она ни была сказана (панель, `mind-say`, сам пульт).
 * 21.08: у пульта был свой приколоченный эпизод (E07), а панель жила в E08 —
 * два входа расходились по двум разговорам, и Полина «видела только 07».
 * Один закон вместо двух списков: где Директор говорил последним, там и пульт.
 * При переходе пульт говорит об этом в чат и обнуляет метку изделий, чтобы не
 * вывалить в карман всю историю нового эпизода.
 */
async function followedEntity(state: BotState, chatId?: number): Promise<Followed | null> {
  const { data: last } = await sb
    .from('concierge_turns')
    .select('thread_id')
    .eq('role', 'director')
    .eq('event_type', 'message')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const threadId = (last as { thread_id?: string } | null)?.thread_id;
  if (!threadId) return null;

  const { data: th } = await sb
    .from('concierge_threads')
    .select('episode_id,series_id')
    .eq('id', threadId)
    .maybeSingle();
  const t = th as { episode_id: string | null; series_id: string | null } | null;
  if (!t || (!t.episode_id && !t.series_id)) return null;

  let code = '?';
  if (t.episode_id) {
    const { data: ep } = await sb.from('episodes').select('episode_code').eq('id', t.episode_id).maybeSingle();
    code = (ep as { episode_code?: string } | null)?.episode_code ?? code;
  } else if (t.series_id) {
    const { data: s } = await sb.from('series').select('code').eq('id', t.series_id).maybeSingle();
    code = (s as { code?: string } | null)?.code ?? code;
  }

  const key = t.episode_id ?? t.series_id;
  if (state.followKey !== key) {
    state.followKey = key;
    state.lastAssetAt = new Date().toISOString();
    saveState(state);
    if (chatId) await sendMessage(chatId, `Теперь ${code}`).catch(() => {});
  }
  return { episodeId: t.episode_id, seriesId: t.series_id, code };
}

async function currentThreadId(state: BotState, chatId?: number): Promise<string | null> {
  const f = await followedEntity(state, chatId);
  if (!f) return null;
  const found = await resolveOpenThreadId(sb as never, { episodeId: f.episodeId, seriesId: f.seriesId });
  if (found) return found;
  const thread = await createThread(sb as never, {
    episodeId: f.episodeId,
    seriesId: f.seriesId,
    activeMode: '3',
    title: `telegram ${f.code}`,
  });
  return thread.id;
}

/** Слово Директора уходит в разговор ровно тем же путём, что из консоли. */
async function sayToMind(state: BotState, text: string, extra?: Record<string, unknown>): Promise<boolean> {
  const threadId = await currentThreadId(state);
  if (!threadId) return false;
  await persistTurn(sb as never, threadId, {
    role: 'director',
    event_type: 'message',
    content: text,
    metadata: { for_bridge: true, source: 'telegram', ...(extra ?? {}) },
  });
  return true;
}

async function episodeByCode(code: string): Promise<{ id: string; episode_code: string; status: string } | null> {
  const { data } = await sb
    .from('episodes')
    .select('id,episode_code,status')
    .ilike('episode_code', `%${code}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; episode_code: string; status: string } | null) ?? null;
}

// ─────────────────────────── медиа ───────────────────────────

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|oga)$/i;

/** Чем изделие показать в телеграме — по расширению канонического имени. */
function tgKindFor(filename: string): 'photo' | 'video' | 'audio' | 'document' {
  if (IMAGE_EXT.test(filename)) return 'photo';
  if (VIDEO_EXT.test(filename)) return 'video';
  if (AUDIO_EXT.test(filename)) return 'audio';
  return 'document';
}

function fileRefOf(msg: TgMessage): { fileId: string; name: string } | null {
  if (msg.photo?.length) {
    const biggest = msg.photo[msg.photo.length - 1];
    return { fileId: biggest.file_id, name: `${biggest.file_id}.jpg` };
  }
  for (const [ref, ext] of [
    [msg.video, '.mp4'],
    [msg.video_note, '.mp4'],
    [msg.audio, '.mp3'],
    [msg.voice, '.ogg'],
    [msg.document, ''],
  ] as const) {
    if (ref) return { fileId: ref.file_id, name: ref.file_name ?? `${ref.file_id}${ext}` };
  }
  return null;
}

/**
 * ВХОДЯЩЕЕ МЕДИА ПУЛЬТ НЕ СОРТИРУЕТ (Директор, 12.08).
 *
 * Первая версия требовала подписи-кода: `sh03`, `канон <слаг>`, `музыка`, `кат` —
 * и отказывала, если не поняла. Директор снял это одной фразой: «идея, что я буду
 * их нумеровать и подписывать, обречена — наверняка будут ошибки. Лучше просто
 * пояснить, что это к чему, а она сама, основываясь на коде и правилах, оформит
 * как положено. Это же ассистент, а не наоборот».
 *
 * Он прав по механизму, а не только по удобству: слот, категорию и слаг диктуют
 * КОД И ПРАВИЛА студии, а знает их Полина, а не человек с телефона. Пульт, который
 * решал за неё, требовал от Директора помнить чужой синтаксис и превращал каждую
 * опечатку в изделие не в том слоте. Поэтому здесь не осталось ни одной ветки
 * разбора: файл ложится рядом с прогоном, путь и подпись ДОСЛОВНО уезжают в
 * разговор, а чем этому файлу стать — решает ум своими перьями.
 */
async function handleIncomingMedia(state: BotState, msg: TgMessage, chatId: number): Promise<void> {
  const ref = fileRefOf(msg);
  if (!ref) return;
  if (!(await followedEntity(state, chatId))) {
    await sendMessage(chatId, NO_PLACE);
    return;
  }

  const bytes = await downloadFile(await getFilePath(ref.fileId));
  // Имя несёт время: наброски одного дня не должны затирать друг друга.
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const ext = ref.name.includes('.') ? ref.name.slice(ref.name.lastIndexOf('.')) : '.bin';
  const dir = resolve(process.cwd(), '..', 'FILMS', '_run', 'inbox');
  mkdirSync(dir, { recursive: true });
  const dest = resolve(dir, `tg-${stamp}${ext}`);
  writeFileSync(dest, bytes);

  const caption = (msg.caption ?? '').trim();
  const said = await sayToMind(
    state,
    `Директор прислал файл из телеграма.\n` +
      `Файл: ${dest}\n` +
      (caption ? `Его слова: «${caption}»\n` : 'Без подписи.\n') +
      `Посмотри его сама (Read по этому пути) и реши, чем он должен стать: идеей к обсуждению, ` +
      `референсом, плитой канона, кадром шота, треком. Оформляй штатным инструментом по правилам ` +
      `студии — имя, слот, версию и статус выбираешь ты, Директор их знать не обязан. ` +
      `Если из файла и слов не ясно, к чему он, — спроси одной строкой.`,
  );
  await sendMessage(
    chatId,
    said ? 'Принял, отдал Полине — посмотрит и оформит.' : NO_PLACE,
  );
}

// ─────────────────── студия → телеграм ───────────────────

/** Тред → человекочитаемый код (эпизод/сериал) — чтобы пометить реплику из «не текущего» разговора. */
const threadCodeCache = new Map<string, string>();
async function threadCode(threadId: string): Promise<string> {
  const hit = threadCodeCache.get(threadId);
  if (hit) return hit;
  const { data: th } = await sb.from('concierge_threads').select('episode_id,series_id').eq('id', threadId).maybeSingle();
  const t = th as { episode_id: string | null; series_id: string | null } | null;
  let code = '?';
  if (t?.episode_id) {
    const { data: ep } = await sb.from('episodes').select('episode_code').eq('id', t.episode_id).maybeSingle();
    code = (ep as { episode_code?: string } | null)?.episode_code ?? code;
  } else if (t?.series_id) {
    const { data: s } = await sb.from('series').select('code').eq('id', t.series_id).maybeSingle();
    code = (s as { code?: string } | null)?.code ?? code;
  }
  threadCodeCache.set(threadId, code);
  return code;
}

async function pumpStudio(state: BotState, chatId: number): Promise<void> {
  const threadId = await currentThreadId(state, chatId);
  if (!threadId) return;

  // Телеграм — окно в РАЗГОВОР Директора с умом ЦЕЛИКОМ, а не в один тред.
  // 24.08: фильтр по текущему треду терял (а) панельные реплики самого Директора —
  // роль director не доставлялась вовсе, «в телеграме фрагменты»; (б) ответ Полины,
  // догнавший СТАРЫЙ тред после того, как Директор уже перешёл в новый. Поэтому
  // опрос глобальный; чужой (не текущий) тред помечается кодом эпизода/сериала.
  const { data: turns } = await sb
    .from('concierge_turns')
    .select('thread_id,role,content,metadata,created_at')
    .gt('created_at', state.lastTurnAt)
    .in('role', ['assistant', 'system', 'director'])
    .eq('event_type', 'message')
    .order('created_at', { ascending: true })
    .limit(30);

  for (const t of (turns ?? []) as Array<{ thread_id: string; role: string; content: string; metadata: Record<string, unknown> | null; created_at: string }>) {
    state.lastTurnAt = t.created_at;
    saveState(state);
    const meta = t.metadata ?? {};
    // Свои телеграм-реплики Директор уже видит в чате — эхо не шлём.
    if (t.role === 'director' && (meta.source === 'telegram' || meta.switch)) continue;
    const text = (t.content ?? '').trim();
    if (!text) continue;
    const from = t.thread_id === threadId ? '' : `[${await threadCode(t.thread_id)}] `;
    const head = t.role === 'system' ? '⚠️ ' : t.role === 'director' ? '🖥 ' : '';
    await sendMessage(chatId, from + head + text, t.role === 'assistant' ? keyboardForText(text) : undefined);
  }

  // Изделия эпизода — приходят сами, как только станция их предъявила.
  const episodeId = (await followedEntity(state, chatId))?.episodeId;
  if (!episodeId) return;
  const { data: assets } = await sb
    .from('assets')
    .select('id,filename,file_type,status,drive_file_id,created_at')
    .eq('episode_id', episodeId)
    .gt('created_at', state.lastAssetAt)
    .order('created_at', { ascending: true })
    .limit(10);

  for (const a of (assets ?? []) as Array<{ id: string; filename: string; file_type: string; status: string; drive_file_id: string | null; created_at: string }>) {
    state.lastAssetAt = a.created_at;
    saveState(state);
    const kind = tgKindFor(a.filename ?? '');
    if (kind === 'document') continue; // документы студии читаются в webapp, не в телеграме
    try {
      const abs = await ensureCachedMedia({ filename: a.filename, driveFileId: a.drive_file_id ?? '' });
      await sendFile(chatId, kind, abs, `${a.file_type} · ${a.status}\nasset ${a.id}`);
    } catch (e) {
      await sendMessage(chatId, `Не смог показать ${a.filename}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

// ─────────────────────── телеграм → студия ───────────────────────

const HELP = [
  'Пульт студии.',
  '',
  '/e SS-S20-E08 — перевести пульт на эпизод (можно просто E08). Сам он идёт за твоим последним словом — где написал в панели, там и пульт.',
  '/что — где мы сейчас',
  '/стоп — оборвать залипший ход',
  '',
  'Текст без команды уходит Полине. Кнопки под её ответом — это твои коды ответов.',
  '',
  'Медиа: шли что угодно — набросок стилусом, фото, скриншот, видео, трек.',
  'Кодов и подписей-слагов не надо: скажи словами, что это и к чему, а оформит Полина.',
].join('\n');

async function handleCommand(state: BotState, chatId: number, text: string): Promise<boolean> {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(' ');
  switch (cmd.toLowerCase().replace(/@.*$/, '')) {
    case '/start':
    case '/help':
      await sendMessage(chatId, `${HELP}\n\nТвой chat_id: ${chatId}`);
      return true;
    case '/e':
    case '/эпизод': {
      if (!arg) return await sendMessage(chatId, 'Какой эпизод? Напр. /e SS-S20-E08').then(() => true);
      const ep = await episodeByCode(arg);
      if (!ep) return await sendMessage(chatId, `Эпизода «${arg}» не нашёл.`).then(() => true);
      // Переход — это тоже слово Директора: строка в тред эпизода (без `for_bridge`,
      // ход не нужен), и закон «иди за последним словом» переводит пульт сам.
      const { data: epRow } = await sb.from('episodes').select('series_id').eq('id', ep.id).maybeSingle();
      const seriesId = (epRow as { series_id?: string } | null)?.series_id ?? null;
      const threadId =
        (await resolveOpenThreadId(sb as never, { episodeId: ep.id, seriesId })) ??
        (await createThread(sb as never, { episodeId: ep.id, seriesId, activeMode: '3', title: `telegram ${ep.episode_code}` })).id;
      await persistTurn(sb as never, threadId, {
        role: 'director',
        event_type: 'message',
        content: `(пульт переведён на ${ep.episode_code})`,
        metadata: { source: 'telegram', switch: true },
      });
      await followedEntity(state);
      await sendMessage(chatId, `Работаем с ${ep.episode_code} · статус ${ep.status}\n${ep.id}`);
      return true;
    }
    case '/что':
    case '/status': {
      const f = await followedEntity(state, chatId);
      if (!f?.episodeId) return await sendMessage(chatId, f ? `${f.code} · сериал, эпизод не выбран` : NO_PLACE).then(() => true);
      const { data: ep } = await sb
        .from('episodes')
        .select('episode_code,status')
        .eq('id', f.episodeId)
        .maybeSingle();
      const threadId = await currentThreadId(state);
      const { data: thread } = threadId
        ? await sb.from('concierge_threads').select('mind_session').eq('id', threadId).maybeSingle()
        : { data: null };
      const busy = (thread as { mind_session?: { busy?: boolean } } | null)?.mind_session?.busy;
      const e = ep as { episode_code: string; status: string } | null;
      await sendMessage(
        chatId,
        `${e?.episode_code ?? '?'} · ${e?.status ?? '?'}\nум: ${busy ? 'ведёт ход' : 'свободен'}`,
      );
      return true;
    }
    case '/стоп':
    case '/stop': {
      const ok = await sayToMind(state, '(отмена хода)', { cancel: true });
      await sendMessage(chatId, ok ? 'Отмена отправлена — мост убьёт ход.' : NO_PLACE);
      return true;
    }
    default:
      return false;
  }
}

async function handleUpdate(state: BotState, u: TgUpdate): Promise<void> {
  const allow = allowedChats();

  if (u.callback_query) {
    const q = u.callback_query;
    const chatId = q.message?.chat.id ?? q.from.id;
    if (allow.length > 0 && !allow.includes(chatId)) {
      await answerCallback(q.id, 'нет доступа');
      return;
    }
    const code = (q.data ?? '').trim();
    await answerCallback(q.id, code);
    const ok = await sayToMind(state, code, { via: 'button' });
    await sendMessage(chatId, ok ? `→ ${code}` : NO_PLACE);
    return;
  }

  const msg = u.message;
  if (!msg) return;
  const chatId = msg.chat.id;

  if (allow.length === 0) {
    await sendMessage(
      chatId,
      `Пульт заперт. Впиши в webapp/.env.local:\nTELEGRAM_ALLOWED_CHAT_IDS=${chatId}\nи перезапусти бота.`,
    );
    return;
  }
  if (!allow.includes(chatId)) return; // чужому — молчание, а не подсказка

  if (fileRefOf(msg)) {
    await handleIncomingMedia(state, msg, chatId);
    return;
  }

  const text = (msg.text ?? '').trim();
  if (!text) return;
  if (text.startsWith('/') && (await handleCommand(state, chatId, text))) return;

  const ok = await sayToMind(state, text);
  if (!ok) await sendMessage(chatId, NO_PLACE);
}

// ─────────────────────────── циклы ───────────────────────────

async function main(): Promise<void> {
  const me = await getMe();
  const state = loadState();
  const where = (await followedEntity(state))?.code ?? 'Директор ещё нигде не говорил';
  console.log(`пульт поднят: @${me.username} · ${where}`);
  const chats = allowedChats();
  if (chats.length === 0) {
    console.log('TELEGRAM_ALLOWED_CHAT_IDS пуст — бот сообщит chat_id первому написавшему и хода не даст');
  } else {
    // Рестарт стека виден в кармане: молчащий пульт неотличим от упавшего.
    await sendMessage(chats[0], `Пульт на связи · ${where}\n/help — что умею`).catch(() => {});
  }

  // Два независимых цикла: длинный опрос телеграма (25 с) не должен задерживать
  // доставку реплик Полины, а она приходит из базы каждые три секунды.
  void (async () => {
    for (;;) {
      try {
        const updates = await getUpdates(state.lastUpdateId + 1);
        for (const u of updates) {
          state.lastUpdateId = Math.max(state.lastUpdateId, u.update_id);
          saveState(state);
          await handleUpdate(state, u).catch((e) => console.error('update:', e));
        }
      } catch (e) {
        console.error('telegram:', e instanceof Error ? e.message : e);
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  })();

  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_STUDIO_MS));
    const chats = allowedChats();
    if (chats.length === 0) continue;
    try {
      await pumpStudio(state, chats[0]);
    } catch (e) {
      console.error('студия:', e instanceof Error ? e.message : e);
    }
  }
}

main().catch((e) => {
  console.error('ERR:', e instanceof Error ? e.message : e);
  process.exit(1);
});
