// PreToolUse-гейт клона Полины (Ф3 миграции). Грузится ТОЛЬКО через
// --settings polina-settings.json — на сессии Тео в этом же репо не действует.
//
// Хард-лимиты Директора механикой, не словами:
//  · publish — deny ВСЕГДА: публикация — кнопка Директора в webapp;
//  · платные генерации — gate-check spend (бюджет/потолок/настройки из БД)
//    ДО запуска npx, чтобы отказ стоил ноль;
//  · git push/merge в master — deny (ветка Полины — polina/*).
const { execFileSync } = require('node:child_process');

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  if (input.tool_name !== 'Bash') process.exit(0);
  const cmd = String(input.tool_input?.command ?? '');

  if (/scripts[\\/]run[\\/]publish(\.ts)?\b/.test(cmd)) {
    console.error('ХАРД-ЛИМИТ: публикация — только кнопкой Директора в webapp. Хук не пустит; не обходи.');
    process.exit(2);
  }
  if (/git\s+push\s+[^\n]*\b(master|main)\b/.test(cmd) || /git\s+merge\b/.test(cmd)) {
    console.error('ХАРД-ЛИМИТ: master трогают Директор или Тео через ревью. Твоя ветка — polina/<тема>.');
    process.exit(2);
  }
  if (/scripts[\\/]run[\\/](gen-frame|gen-video|stitch)(\.ts)?\b/.test(cmd)) {
    try {
      execFileSync('npx', ['tsx', 'scripts/gate-check.ts', '--kind', 'spend'], {
        // CLAUDE_PROJECT_DIR = cwd спавна (мост даёт .../webapp) — 'webapp' не
        // доклеивать вслепую, иначе webapp\webapp (пойман живым ходом 09.08).
        cwd: (() => {
          const p = require('node:path');
          const root = (process.env.CLAUDE_PROJECT_DIR ?? 'C:/SandyStudio-polina').replace(/[\\/]+$/, '');
          return /webapp$/i.test(root) ? root : p.join(root, 'webapp');
        })(),
        env: process.env,
        stdio: ['ignore', 'ignore', 'pipe'],
        shell: process.platform === 'win32',
      });
    } catch (e) {
      const msg = e && e.stderr ? e.stderr.toString('utf8') : 'gate-check недоступен';
      console.error(`ГЕЙТ ДЕНЕГ (D90, дубль хуком): ${msg.trim()}`);
      process.exit(2);
    }
  }
  process.exit(0);
});
