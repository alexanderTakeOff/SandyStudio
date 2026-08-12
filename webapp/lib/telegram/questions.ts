// Разбор вопросов Директора в кнопки пульта.
//
// Протокол кнопок ИЗОБРЕТАТЬ НЕ НУЖНО — он уже описан правилом нумерации
// (`~/.claude/rules/common/director-communication.md`): вопрос несёт двузначный
// номер, варианты записаны как `(1)`, `(2)`, `(3)`, а ответ Директора — это код
// `<NN><цифра варианта>`, например `031` = вопрос 03, вариант 1. Кнопка просто
// отправляет ровно тот код, который Директор набрал бы пальцами.
//
// Второй язык ответов («approve»/«reject» в callback_data) означал бы ДВА
// протокола, которые разъедутся при первой же правке одного из них.

/** Кнопка: подпись + код ответа, который уедет в разговор при нажатии. */
export interface QuestionButton {
  text: string;
  callback_data: string;
}

export interface ParsedQuestion {
  /** Номер вопроса как его написал автор: `03`, `12`. */
  number: string;
  /** Заголовок вопроса без маркера и номера. */
  title: string;
  options: Array<{ digit: string; label: string }>;
}

// Эмодзи-маркер срочности (🔴/🟡/🟢) снимается ОБЩИМ правилом «всё, что не буква
// и не цифра», а не перечислением: класс символов с эмодзи вне BMP разваливается
// на суррогатные пары и молча перестаёт совпадать — уже проверено этим тестом.
const LEADING_MARK = /^[^\p{L}\p{N}]*/u;
const QUESTION_LINE = /^(\d{2,3})\s*[—–-]\s*(.+)$/;
const OPTION = /\((\d)\)\s*([^\n]*?)(?=\s*\(\d\)|\s*$)/g;
const MAX_LABEL = 42;

/**
 * Находит вопросы в тексте ответа. Блок вопроса тянется от строки с номером до
 * следующей такой строки — варианты могут стоять и в той же строке, и абзацами
 * ниже (оба стиля живые: короткий inline и «разговорный» из правила общения).
 */
export function parseQuestions(text: string): ParsedQuestion[] {
  const lines = text.split(/\r?\n/);
  const starts: Array<{ index: number; number: string; title: string }> = [];
  lines.forEach((line, index) => {
    const m = QUESTION_LINE.exec(line.replace(LEADING_MARK, ''));
    if (m) starts.push({ index, number: m[1], title: m[2].trim() });
  });

  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : lines.length;
    const block = lines.slice(start.index, end).join('\n');
    const seen = new Set<string>();
    const options: Array<{ digit: string; label: string }> = [];
    for (const m of block.matchAll(OPTION)) {
      const digit = m[1];
      if (digit === '0' || Number(digit) > 4) continue; // протокол знает варианты 1–4
      if (seen.has(digit)) continue;
      seen.add(digit);
      options.push({ digit, label: shorten(m[2]) });
    }
    return { number: start.number, title: start.title, options };
  });
}

/** Подпись кнопки: смысл варианта, а не первое предложение целиком. */
function shorten(raw: string): string {
  const clean = raw
    .replace(/[`*_]/g, '')
    .replace(/\s*[—–-]\s.*$/, '') // «gpt-image-2 — тот же что сейчас» → «gpt-image-2»
    .replace(/[.,;:]\s*$/, '')
    .trim();
  if (!clean) return '—';
  return clean.length > MAX_LABEL ? `${clean.slice(0, MAX_LABEL - 1)}…` : clean;
}

/**
 * Клавиатура: не больше ДВУХ кнопок в ряд (Директор, 12.08) — три и четыре
 * варианта в одной строке телеграм сжимает до нечитаемых огрызков подписи.
 * Вопрос без вариантов (открытый) кнопок не рождает — на него отвечают текстом.
 */
const PER_ROW = 2;

export function keyboardFor(questions: ParsedQuestion[]): QuestionButton[][] {
  const rows: QuestionButton[][] = [];
  for (const q of questions) {
    if (q.options.length === 0) continue;
    const buttons = q.options.map((o) => ({
      text: `${q.number}·${o.digit} ${o.label}`.slice(0, 64),
      callback_data: `${q.number}${o.digit}`,
    }));
    for (let i = 0; i < buttons.length; i += PER_ROW) rows.push(buttons.slice(i, i + PER_ROW));
  }
  return rows;
}

/** Кнопки для текста ответа: разбор + клавиатура одним вызовом. */
export function keyboardForText(text: string): QuestionButton[][] {
  return keyboardFor(parseQuestions(text));
}
