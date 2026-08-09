// UserPromptSubmit клона Полины (Ф3): свежая динамика эпизода КАЖДЫЙ ход —
// замена dynamic-части старого prompt.ts. stdout попадает в контекст хода.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

try {
  const out = execFileSync('npx', ['tsx', 'scripts/gate-check.ts', '--kind', 'context'], {
    cwd: process.env.CLAUDE_PROJECT_DIR
      ? path.join(process.env.CLAUDE_PROJECT_DIR, 'webapp')
      : process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 30_000,
  });
  process.stdout.write(out);
} catch {
  // Контекст — удобство, не гейт: его отказ не должен глушить ход.
  process.stdout.write('[состояние эпизода недоступно — gate-check упал; цифры бери вызовом spend]\n');
}
process.exit(0);
