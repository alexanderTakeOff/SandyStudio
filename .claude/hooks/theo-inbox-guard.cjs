#!/usr/bin/env node
// SandyStudio — Stop hook — theo-inbox-guard
//
// ЗАЧЕМ (Директор, 2026-08-27): «всегда проверяй THEO-INBOX, поставь хук на это
// после каждого хода».
//
// Хук показа уже был — `theo-inbox.cjs` печатает заголовки открытых пунктов на
// КАЖДОМ ходе с 12.08. И ровно это оказалось недостаточным: 27.08 одиннадцать
// пунктов провисели открытыми весь день, заголовки исправно инжектились, и я не
// тронул ни одного. **Инжекция без обязательства становится обоями** — тем же
// способом умер компас, пока его не заставили ЦИТИРОВАТЬ файл.
//
// Поэтому здесь не показ, а гейт на ВЫХОДЕ хода. Он не требует разгребать
// очередь (пункты разного веса, и решение о приоритете — работа, а не ритуал).
// Он требует ровно одного: **новое сообщение Полины не должно проехать мимо**.
// Она пишет туда то, что не может починить сама и что блокирует прогон; её
// запись, оставшаяся непрочитанной, — это дефект, который мы уже оплатили и
// решили не чинить, сами того не заметив.
//
// Поведение:
//   · инбокс не менялся с прошлого стопа        → тихо пропускаем;
//   · появились НОВЫЕ пункты, 1-й раз           → мягкое предупреждение (exit 1);
//   · те же новые пункты 2-й раз подряд         → БЛОКИРУЕМ стоп (exit 2) и
//                                                 сбрасываем отметку, чтобы не
//                                                 зациклиться;
//   · `stop_hook_active` в payload              → пропускаем (харнесс уже
//                                                 переспрашивает, не стакаемся).
//
// Отметка — по СОДЕРЖИМОМУ (число открытых пунктов + их заголовки), а не по
// mtime: файл живёт в чужом клоне, там git трогает время без изменения смысла.
//
// Отключение: SANDY_HOOKS_OFF=1.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

if (process.env.SANDY_HOOKS_OFF === '1') process.exit(0);

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const STATE = path.join(ROOT, '.claude', '.theo-inbox-guard.json');

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Самая свежая копия инбокса среди соседних клонов — та же логика, что у `theo-inbox.cjs`. */
function findInbox() {
  const candidates = [path.join(ROOT, 'THEO-INBOX.md')];
  try {
    const parent = path.dirname(ROOT);
    const self = path.basename(ROOT);
    for (const name of fs.readdirSync(parent)) {
      if (name === self || !/^SandyStudio/i.test(name)) continue;
      candidates.push(path.join(parent, name, 'THEO-INBOX.md'));
    }
  } catch {
    /* соседей нет — не беда */
  }
  let best = null;
  for (const file of candidates) {
    try {
      const st = fs.statSync(file);
      if (!best || st.mtimeMs > best.mtimeMs) best = { file, mtimeMs: st.mtimeMs };
    } catch {
      /* нет файла — пропускаем */
    }
  }
  return best;
}

/**
 * Заголовки открытых пунктов. Форм ДВЕ, и обе живые:
 *   · `### 12 · Заголовок` — нумерованная очередь;
 *   · `**1. Заголовок**`   — пункты внутри датированного блока.
 * Вторую сторож сначала не видел, и три записи Полины от 24.08 проехали мимо него
 * молча — ровно тот отказ, ради которого он и написан (поймано 27.08).
 */
function openTitles(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    const heading = /^#{2,3}\s*(\d+)\s*[·.]\s*(.+)$/.exec(t);
    // Пробел после точки ОБЯЗАТЕЛЕН: без него `**12.08 · E07 · …**` — строка даты —
    // читается как пункт номер 12, и сторож начинает считать несуществующее.
    const bullet = /^\*\*(\d+)\.\s+(.+?)\*\*/.exec(t);
    const m = heading || bullet;
    if (!m) continue;
    if (/ЗАКРЫТ|CLOSED|✅/i.test(m[2])) continue;
    out.push(`${m[1]} · ${m[2].slice(0, 60)}`);
  }
  return out;
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(s) {
  try {
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(s, null, 1));
  } catch {
    /* состояние — удобство, а не условие работы */
  }
}

const payload = readStdinJson();
// Никогда не стакаемся на собственный блок.
if (payload.stop_hook_active) process.exit(0);

const found = findInbox();
if (!found) process.exit(0);

let titles;
try {
  titles = openTitles(fs.readFileSync(found.file, 'utf8'));
} catch {
  process.exit(0);
}

const digest = crypto.createHash('sha1').update(titles.join('\n')).digest('hex').slice(0, 12);
const state = loadState();

if (state.digest === digest && !state.pendingBlock) process.exit(0);

// Что именно ново по сравнению с прошлым стопом.
const known = new Set(state.titles || []);
const fresh = titles.filter((t) => !known.has(t));

// МОЯ правка списка — например, закрытие пункта — меняет отпечаток, но новостью
// не является. Блокировать за собственное действие значит превратить сторожа в
// шум, а шумного сторожа отключают быстрее, чем забывают тихого.
if (fresh.length === 0) {
  saveState({ digest, titles, pendingBlock: false, fresh: [] });
  process.exit(0);
}

if (state.digest === digest && state.pendingBlock) {
  // Второй раз подряд с тем же непрочитанным — блокируем и сбрасываем.
  saveState({ digest, titles, pendingBlock: false });
  const list = (state.fresh || fresh).slice(0, 6).map((t) => `[Hook]   · ${t}`).join('\n');
  console.error(
    `[Hook] СТОП ЗАБЛОКИРОВАН. Полина дописала в THEO-INBOX и второй ход подряд это не прочитано.\n` +
      `[Hook] Файл: ${found.file}\n${list}\n` +
      `[Hook] Она пишет туда то, что НЕ МОЖЕТ починить сама и что мешает прогону. Непрочитанная\n` +
      `[Hook] запись = дефект, который мы оплатили и молча решили не чинить.\n` +
      `[Hook] Прочитай новые пункты и либо возьми в работу, либо скажи Директору, почему нет.`,
  );
  process.exit(2);
}

// Первый раз с новым содержимым — мягко.
saveState({ digest, titles, pendingBlock: true, fresh });
if (fresh.length > 0) {
  const list = fresh.slice(0, 6).map((t) => `[Hook]   · ${t}`).join('\n');
  console.error(`[Hook] НОВОЕ в THEO-INBOX (${fresh.length}):\n${list}\n[Hook] ${found.file}`);
} else {
  console.error(`[Hook] THEO-INBOX изменился (${titles.length} открытых). ${found.file}`);
}
process.exit(1);
