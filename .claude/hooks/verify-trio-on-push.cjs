#!/usr/bin/env node
// SandyStudio — PreToolUse hook (Bash matcher) — verify-trio-on-push
// Implements CLAUDE.md §12 Ritual 3 (verify trio before push).
//
// Fires on Bash tool calls. Only acts when the command is `git push*`.
// If commits ahead-of-master include code changes, run `npm run verify`
// (tsc --noEmit && vitest run) from webapp/. Numbers go to stderr for
// Claude to surface to Director.
//
// Docs-only pushes skip verify (per Ritual 3 explicit clause).
//
// Failure → exit 2 (block push). Director can override with --no-verify
// on the git push (not a real flag, but `# no-verify` marker in command).
//
// Override: SANDY_HOOKS_OFF=1 → silent pass.
//
// Performance: tsc + vitest run on this repo ≈ 30-90s. Tolerable for push gate.

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

if (process.env.SANDY_HOOKS_OFF === '1') {
  let _buf = '';
  process.stdin.on('data', c => (_buf += c));
  process.stdin.on('end', () => process.stdout.write(_buf));
  return;
}

const HELPER = path.join(__dirname, 'lib', 'git-changed.cjs');
let categoriseAheadOfMaster;
try {
  ({ categoriseAheadOfMaster } = require(HELPER));
} catch (_) {
  let _buf = '';
  process.stdin.on('data', c => (_buf += c));
  process.stdin.on('end', () => process.stdout.write(_buf));
  return;
}

function findWebapp() {
  // Walk up from cwd looking for webapp/package.json
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const webapp = path.join(dir, 'webapp', 'package.json');
    if (fs.existsSync(webapp)) return path.join(dir, 'webapp');
    const next = path.dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  return null;
}

let buf = '';
process.stdin.on('data', c => (buf += c));
process.stdin.on('end', () => {
  let cmd = '';
  try {
    const i = JSON.parse(buf);
    cmd = (i && i.tool_input && i.tool_input.command) || '';
  } catch (_) {
    return process.stdout.write(buf);
  }

  const isPush = /\bgit\s+push\b/.test(cmd);
  if (!isPush) return process.stdout.write(buf);

  // Director opt-out
  if (/#\s*no-verify\b/.test(cmd) || /--no-verify\b/.test(cmd)) {
    return process.stdout.write(buf);
  }

  const aheadCats = categoriseAheadOfMaster();
  const codeAhead = aheadCats.code.length + aheadCats.tests.length;

  if (codeAhead === 0) {
    // Docs-only push → skip verify per Ritual 3
    console.error(`[Hook] Ritual 3: docs-only push (${aheadCats.docs.length} doc files), skipping verify trio.`);
    return process.stdout.write(buf);
  }

  const webappDir = findWebapp();
  if (!webappDir) {
    console.error(`[Hook] WARN: webapp/ not found, skipping verify.`);
    return process.stdout.write(buf);
  }

  console.error(`[Hook] Ritual 3: running verify trio (tsc + vitest) for ${codeAhead} code files ahead of master…`);
  try {
    // 28.08 — сторож падал не на тестах, а на СВОЁМ окружении: «'tsc' is not
    // recognized». Руками `npm run typecheck` в том же каталоге отрабатывал чисто,
    // то есть PATH процесса хука беднее интерактивного и npm не находит бинарь
    // проекта. Сторож, падающий по своей причине, учит обходить себя флагом — то же
    // самое, за что сегодня чинили сторож самосверки. Кладём node_modules/.bin в PATH
    // явно, а не полагаемся на то, что его добавит npm.
    const binDir = require('node:path').join(webappDir, 'node_modules', '.bin');
    const out = execSync('npm run verify', {
      cwd: webappDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5 * 60 * 1000,
      env: { ...process.env, PATH: binDir + require('node:path').delimiter + (process.env.PATH || '') },
    });
    // Extract test count from vitest output if present
    const m = out.match(/Tests\s+(\d+)\s+passed/i) || out.match(/(\d+)\s+passed/i);
    const testCount = m ? m[1] : '?';
    console.error(`[Hook] Ritual 3 PASS: tsc clean, ${testCount} tests passed.`);
    process.stdout.write(buf);
  } catch (err) {
    const stderr = (err.stderr || '').toString().slice(-2000);
    const stdout = (err.stdout || '').toString().slice(-2000);
    console.error(`[Hook] Ritual 3 FAIL: verify exited with code ${err.status || '?'}.`);
    console.error(`[Hook] --- stdout tail ---`);
    console.error(stdout);
    console.error(`[Hook] --- stderr tail ---`);
    console.error(stderr);
    console.error(`[Hook] Push blocked. Fix tsc/test failures or override with '# no-verify' in command.`);
    process.exit(2);
  }
});
