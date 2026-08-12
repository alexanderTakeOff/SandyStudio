// Тонкий клиент Telegram Bot API — ровно те методы, которыми пользуется пульт.
//
// Зависимостей нет: `fetch`, `FormData` и `Blob` есть в Node сами. Библиотека
// уровня `node-telegram-bot-api` привезла бы свой цикл опроса, свою модель
// состояния и свои правила ретрая поверх наших — а нужно четыре метода.
//
// Направление связи — ИСХОДЯЩЕЕ: long polling к api.telegram.org. Никакого
// webhook, никакого порта наружу; студия остаётся невидимой из интернета.
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const API_ROOT = 'https://api.telegram.org';

/** Клавиатура под сообщением: ряд вопросов × кнопки вариантов. */
export interface InlineButton {
  text: string;
  /** Что уедет обратно при нажатии — у нас это код ответа Директора, напр. `031`. */
  callback_data: string;
}

export interface TgChat {
  id: number;
  username?: string;
  first_name?: string;
}

export interface TgFileRef {
  file_id: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
}

export interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgChat;
  text?: string;
  caption?: string;
  photo?: Array<TgFileRef & { width: number; height: number }>;
  video?: TgFileRef;
  audio?: TgFileRef;
  voice?: TgFileRef;
  video_note?: TgFileRef;
  document?: TgFileRef;
}

export interface TgCallbackQuery {
  id: string;
  data?: string;
  from: TgChat;
  message?: TgMessage;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

/** Токен из окружения. Отсутствует — падаем громко: молчащий пульт хуже отсутствующего. */
export function botToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN не задан в webapp/.env.local — пульт не поднимается');
  return t;
}

async function call<T>(method: string, payload: Record<string, unknown>, timeoutMs = 60_000): Promise<T> {
  const res = await fetch(`${API_ROOT}/bot${botToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`telegram.${method}: ${json.description ?? res.status}`);
  return json.result as T;
}

/** Кто мы — проверка канала одним запросом, до всякой работы. */
export async function getMe(): Promise<{ id: number; username?: string; first_name?: string }> {
  return call('getMe', {}, 15_000);
}

export async function getUpdates(offset: number, timeoutSec = 25): Promise<TgUpdate[]> {
  return call<TgUpdate[]>(
    'getUpdates',
    { offset, timeout: timeoutSec, allowed_updates: ['message', 'callback_query'] },
    (timeoutSec + 15) * 1000,
  );
}

export async function sendMessage(
  chatId: number,
  text: string,
  keyboard?: InlineButton[][],
): Promise<TgMessage> {
  // Телеграм режет сообщения длиннее 4096 символов — режем сами по абзацам,
  // клавиатуру вешаем на последний кусок (она относится ко всему ответу).
  const chunks = splitForTelegram(text);
  let last: TgMessage | null = null;
  for (let i = 0; i < chunks.length; i += 1) {
    const isLast = i === chunks.length - 1;
    last = await call<TgMessage>('sendMessage', {
      chat_id: chatId,
      text: chunks[i],
      ...(isLast && keyboard?.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  }
  return last as TgMessage;
}

/** Режет длинный текст по границам абзацев, затем строк, затем жёстко. */
export function splitForTelegram(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf(' '));
    const at = cut > limit * 0.5 ? cut : limit;
    out.push(rest.slice(0, at).trimEnd());
    rest = rest.slice(at).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

export type MediaKind = 'photo' | 'video' | 'audio' | 'document';

/** Отправка файла С ДИСКА мультипартом — без base64 и без ссылок наружу. */
export async function sendFile(
  chatId: number,
  kind: MediaKind,
  absPath: string,
  caption?: string,
): Promise<void> {
  const method = { photo: 'sendPhoto', video: 'sendVideo', audio: 'sendAudio', document: 'sendDocument' }[kind];
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', caption.slice(0, 1024));
  form.append(kind, new Blob([await readFile(absPath)]), basename(absPath));
  const res = await fetch(`${API_ROOT}/bot${botToken()}/${method}`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(`telegram.${method}: ${json.description ?? res.status}`);
}

/** Путь файла на стороне телеграма — первый шаг скачивания входящего медиа. */
export async function getFilePath(fileId: string): Promise<string> {
  const f = await call<{ file_path?: string }>('getFile', { file_id: fileId }, 30_000);
  if (!f.file_path) throw new Error(`telegram.getFile: у ${fileId} нет file_path`);
  return f.file_path;
}

export async function downloadFile(filePath: string): Promise<Buffer> {
  const res = await fetch(`${API_ROOT}/file/bot${botToken()}/${filePath}`, {
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`telegram file download: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Гасит «часики» на нажатой кнопке. Без этого телеграм крутит их 30 секунд. */
export async function answerCallback(id: string, text?: string): Promise<void> {
  await call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) }, 15_000);
}
