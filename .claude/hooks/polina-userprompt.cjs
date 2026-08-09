// UserPromptSubmit клона Полины (Ф3): свежая динамика эпизода КАЖДЫЙ ход —
// замена dynamic-части старого prompt.ts. stdout попадает в контекст хода.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

try {
  const out = execFileSync('npx', ['tsx', 'scripts/gate-check.ts', '--kind', 'context'], {
    // CLAUDE_PROJECT_DIR = cwd спавна (.../webapp) — не доклеивать 'webapp' вслепую.
    cwd: (() => {
      const root = (process.env.CLAUDE_PROJECT_DIR ?? 'C:/SandyStudio-polina').replace(/[\\/]+$/, '');
      return /webapp$/i.test(root) ? root : path.join(root, 'webapp');
    })(),
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 30_000,
  });
  process.stdout.write(out);
} catch (e) {
  // Контекст — удобство, не гейт: его отказ не глушит ход, но причина отказа
  // обязана быть видна (тихий отказ — худший класс; Ш54/Ш58 — два таких за день).
  const reason = [
    e && e.code ? `code=${e.code}` : '',
    e && e.stderr ? String(e.stderr).slice(0, 200) : '',
    e && e.message ? String(e.message).slice(0, 200) : '',
    `RUN_EPISODE_ID=${process.env.RUN_EPISODE_ID ?? 'ОТСУТСТВУЕТ'}`,
  ]
    .filter(Boolean)
    .join(' · ');
  process.stdout.write(`[состояние эпизода недоступно — gate-check упал: ${reason}; цифры бери вызовом spend]\n`);
}
process.exit(0);
