#!/usr/bin/env node
// UserPromptSubmit — показать очередь Полины к Тео (THEO-INBOX.md) на КАЖДОМ ходе.
//
// Директор, 2026-08-12: «Полина завела THEO-INBOX.md для замечаний. Читай каждый раз,
// когда я пишу здесь сообщение тебе.» Полина кладёт туда дефекты инструмента, которые
// нашла во время прогона и чинить не может; прогон при этом не останавливается.
//
// Почему хук, а не память: файл живёт в ДРУГОМ клоне (сессия Полины) и её коммиты
// какое-то время не запушены. Модель о нём просто не узнает, если ей не сказать.
// Поэтому ищем самую свежую копию среди соседних клонов репозитория и печатаем
// заголовки открытых пунктов — полный текст Тео читает Read'ом, когда берёт в работу.
//
// Никогда не блокирует и не падает: отсутствующий инбокс = тишина.
'use strict';

const fs = require('fs');
const path = require('path');

const MAX_TITLE = 46; // символов на пункт — строка контекста, а не пересказ

function candidates() {
  const here = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const list = [path.join(here, 'THEO-INBOX.md')];
  // соседние клоны того же репозитория (C:\SandyStudio*, C:\SandyStudio-polina, ...)
  try {
    const parent = path.dirname(here);
    const self = path.basename(here);
    for (const name of fs.readdirSync(parent)) {
      if (name === self) continue;
      if (!/^SandyStudio/i.test(name)) continue;
      list.push(path.join(parent, name, 'THEO-INBOX.md'));
    }
  } catch (_) { /* нет доступа к родителю — работаем с тем, что есть */ }
  return list;
}

function freshest() {
  let best = null;
  for (const file of candidates()) {
    try {
      const st = fs.statSync(file);
      if (!best || st.mtimeMs > best.mtimeMs) best = { file, mtimeMs: st.mtimeMs, mtime: st.mtime };
    } catch (_) { /* нет такого файла — следующий кандидат */ }
  }
  return best;
}

try {
  const found = freshest();
  if (!found) process.exit(0);

  const text = fs.readFileSync(found.file, 'utf8');
  const open = text.split(/^##\s+/m).find((s) => /^ОТКРЫТО/.test(s)) || '';
  const items = open
    .split(/\r?\n/)
    .filter((l) => /^###\s+/.test(l))
    .map((l) => l.replace(/^###\s+/, '').replace(/[`*_]/g, '').trim())
    .map((l) => (l.length > MAX_TITLE ? l.slice(0, MAX_TITLE - 1) + '…' : l));

  if (items.length === 0) process.exit(0);

  const hh = String(found.mtime.getHours()).padStart(2, '0');
  const mm = String(found.mtime.getMinutes()).padStart(2, '0');
  const where = path.basename(path.dirname(found.file));
  process.stdout.write(
    `[THEO-INBOX ${items.length} открыто · ${where} · ${hh}:${mm} · ` +
      items.join(' · ') +
      ` · полностью: ${found.file}]`,
  );
} catch (_) {
  /* тихо — очередь замечаний не имеет права ломать ход */
}
process.exit(0);
