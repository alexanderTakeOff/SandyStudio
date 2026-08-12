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

interface BotState {
  /** Эпизод, в разговор которого уходят реплики. Меняется командой `/e`. */
  episodeId: string | null;
  lastUpdateId: number;
  /** Метка последней доставленной реплики и последнего доставленного изделия. */
  lastTurnAt: string;
  lastAssetAt: string;
}

function loadState(): BotState {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as BotState;
  } catch {
    const nowIso = new Date().toISOString();
    return { episodeId: null, lastUpdateId: 0, lastTurnAt: nowIso, lastAssetAt: nowIso };
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

async function currentThreadId(state: BotState): Promise<string | null> {
  if (!state.episodeId) return null;
  const { data: ep } = await sb
    .from('episodes')
    .select('series_id,episode_code')
    .eq('id', state.episodeId)
    .maybeSingle();
  if (!ep) return null;
  const found = await resolveOpenThreadId(sb as never, {
    episodeId: state.episodeId,
    seriesId: (ep as { series_id: string }).series_id,
  });
  if (found) return found;
  const thread = await createThread(sb as never, {
    episodeId: state.episodeId,
    seriesId: (ep as { series_id: string }).series_id,
    activeMode: '3',
    title: `telegram ${(ep as { episode_code: string }).episode_code}`,
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
  if (!state.episodeId) {
    await sendMessage(chatId, 'Сначала выбери эпизод: /e SS-S20-E07');
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
    said ? 'Принял, отдал Полине — посмотрит и оформит.' : 'Эпизод не выбран: /e SS-S20-E07',
  );
}

// ─────────────────── студия → телеграм ───────────────────

async function pumpStudio(state: BotState, chatId: number): Promise<void> {
  const threadId = await currentThreadId(state);
  if (!threadId) return;

  const { data: turns } = await sb
    .from('concierge_turns')
    .select('role,content,metadata,created_at')
    .eq('thread_id', threadId)
    .gt('created_at', state.lastTurnAt)
    .in('role', ['assistant', 'system'])
    .order('created_at', { ascending: true });

  for (const t of (turns ?? []) as Array<{ role: string; content: string; metadata: Record<string, unknown> | null; created_at: string }>) {
    const text = (t.content ?? '').trim();
    if (text) {
      const head = t.role === 'system' ? '⚠️ ' : '';
      await sendMessage(chatId, head + text, keyboardForText(text));
    }
    state.lastTurnAt = t.created_at;
    saveState(state);
  }

  // Изделия эпизода — приходят сами, как только станция их предъявила.
  if (!state.episodeId) return;
  const { data: assets } = await sb
    .from('assets')
    .select('id,filename,file_type,status,drive_file_id,created_at')
    .eq('episode_id', state.episodeId)
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
  '/e SS-S20-E07 — выбрать эпизод (можно просто E07)',
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
      if (!arg) return await sendMessage(chatId, 'Какой эпизод? Напр. /e SS-S20-E07').then(() => true);
      const ep = await episodeByCode(arg);
      if (!ep) return await sendMessage(chatId, `Эпизода «${arg}» не нашёл.`).then(() => true);
      state.episodeId = ep.id;
      state.lastAssetAt = new Date().toISOString();
      saveState(state);
      await sendMessage(chatId, `Работаем с ${ep.episode_code} · статус ${ep.status}\n${ep.id}`);
      return true;
    }
    case '/что':
    case '/status': {
      if (!state.episodeId) return await sendMessage(chatId, 'Эпизод не выбран: /e SS-S20-E07').then(() => true);
      const { data: ep } = await sb
        .from('episodes')
        .select('episode_code,status')
        .eq('id', state.episodeId)
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
      await sendMessage(chatId, ok ? 'Отмена отправлена — мост убьёт ход.' : 'Эпизод не выбран.');
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
    await sendMessage(chatId, ok ? `→ ${code}` : 'Эпизод не выбран: /e SS-S20-E07');
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
  if (!ok) await sendMessage(chatId, 'Эпизод не выбран: /e SS-S20-E07');
}

// ─────────────────────────── циклы ───────────────────────────

async function main(): Promise<void> {
  const me = await getMe();
  const state = loadState();
  console.log(`пульт поднят: @${me.username} · эпизод ${state.episodeId ?? 'не выбран'}`);
  const chats = allowedChats();
  if (chats.length === 0) {
    console.log('TELEGRAM_ALLOWED_CHAT_IDS пуст — бот сообщит chat_id первому написавшему и хода не даст');
  } else {
    // Рестарт стека виден в кармане: молчащий пульт неотличим от упавшего.
    const { data: ep } = state.episodeId
      ? await sb.from('episodes').select('episode_code').eq('id', state.episodeId).maybeSingle()
      : { data: null };
    const where = (ep as { episode_code?: string } | null)?.episode_code ?? 'эпизод не выбран';
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
