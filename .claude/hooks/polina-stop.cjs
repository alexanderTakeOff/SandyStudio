// Stop-гейт клона Полины (Ф3, D100): рапорт «сделано» без вызова инструмента —
// БЛОКИРУЕТСЯ механикой, не уговором. Плюс гейт самосверки кадра (решение
// Директора 09.08): был gen-frame — в ходе обязана быть сверка глазами.
//
// Транскрипт хода — JSONL; ход = всё после последней НАСТОЯЩЕЙ реплики
// пользователя (user-строка без tool_result внутри).
const fs = require('node:fs');

/** Маркеры рапорта об изделии. */
const REPORT_RE = /(сделан|записал|сгенерир|перегенерир|создал|залит|готово|отснят)/i;
/** Инструменты, чьи вызовы делают рапорт честным. */
const PROOF_RE = /scripts[\\/]run[\\/](write-asset|register-media|register-canon|gen-frame|gen-video|set-status|stitch|sync-episode|publish|spend|cast-episode)/;
/** Маркер письменного вердикта самосверки. */
const VERDICT_RE = /(сверка|самосверк|вердикт).{0,400}(плит|канон)|✅.{0,60}(огни|прожектор)/is;

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  // Против бесконечной петли: после нашего же block не блокируем повторно.
  if (input.stop_hook_active) process.exit(0);
  let lines;
  try {
    lines = fs.readFileSync(input.transcript_path, 'utf8').split('\n').filter(Boolean);
  } catch {
    process.exit(0);
  }

  // Найти начало хода: последняя user-строка, чей content — строка или блоки без tool_result.
  let turnStart = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    let e;
    try {
      e = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (e.type === 'user') {
      const content = e.message?.content;
      const isToolResult =
        Array.isArray(content) && content.some((b) => b && b.type === 'tool_result');
      if (!isToolResult) {
        turnStart = i;
        break;
      }
    }
  }

  const bashCommands = [];
  let readPngs = 0;
  let finalText = '';
  for (let i = turnStart; i < lines.length; i++) {
    let e;
    try {
      e = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (e.type !== 'assistant') continue;
    const content = e.message?.content;
    if (!Array.isArray(content)) continue;
    let textOfMsg = '';
    for (const b of content) {
      if (b.type === 'tool_use' && b.name === 'Bash') bashCommands.push(String(b.input?.command ?? ''));
      if (b.type === 'tool_use' && b.name === 'Read' && /\.png$/i.test(String(b.input?.file_path ?? ''))) readPngs++;
      if (b.type === 'text') textOfMsg += b.text ?? '';
    }
    if (textOfMsg.trim()) finalText = textOfMsg;
  }

  const hadProofTool = bashCommands.some((c) => PROOF_RE.test(c));
  // 28.08 — сторож считал генерацией ЧТЕНИЕ КОНТРАКТА. Ход, где ум открыл
  // `gen-frame --help`, блокировался требованием сверить несуществующий кадр:
  // удовлетворить такое можно было только ВЫДУМАВ вердикт — то есть совершив
  // ровно тот рапорт, против которого правило 8 и написано. Сторож, толкающий
  // к выдумке, вреднее отсутствующего: он приучает не верить своему крику.
  // Справка денег не стоит и изделия не рождает — из триггера исключена.
  const hadGenFrame = bashCommands.some((c) => /scripts[\/]run[\/]gen-frame/.test(c) && !/(^|\s)(--help|-h)(\s|$)/.test(c));

  // Гейт 1 (D100): рапорт без предъявления.
  if (REPORT_RE.test(finalText) && bashCommands.length > 0 === false && !hadProofTool) {
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason:
          'РАПОРТ-ГЕЙТ (правило 1): в ответе слова о сделанном изделии, но за ход не вызван НИ ОДИН ' +
          'инструмент студии. Либо предъяви строку ассета (id + имя) вызовом инструмента, либо убери ' +
          'рапортные слова и скажи, что реально происходило.',
      }),
    );
    process.exit(0);
  }

  // Гейт 2: самосверка кадра (правило 8 роли) — gen-frame без Read кадра или без вердикта.
  if (hadGenFrame && (readPngs === 0 || !VERDICT_RE.test(finalText))) {
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason:
          'ГЕЙТ САМОСВЕРКИ (правило 8): за ход был gen-frame, но нет ' +
          (readPngs === 0 ? 'открытия кадра глазами (Read PNG)' : 'письменного вердикта сверки с плитами канона') +
          '. Открой кадр РЯДОМ с плитами каста, пройди лист (прожекторы · огни по бортам · ракурс vs turnaround · ' +
          'свет · каст кадра) и напиши вердикт — кадр не предъявляется без него.',
      }),
    );
    process.exit(0);
  }

  process.exit(0);
});
