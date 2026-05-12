// SandyStudio — hook helper — git-changed
// Categorises files from a git diff into code / docs / tests / other.
// Shared by plan-md-update-guard.cjs and verify-trio-on-push.cjs.
//
// Usage:
//   const { categoriseStaged, categoriseSinceMaster } = require('./lib/git-changed.cjs');
//   const cats = categoriseStaged();
//   cats.code = ['webapp/lib/foo.ts']
//   cats.docs = ['PLAN.md', 'CLAUDE.md', 'docs/x.md']
//   cats.tests = ['webapp/lib/foo.test.ts']
//   cats.other = ['.gitignore', '.env.example']
//   cats.all = [...]

const { execSync } = require('child_process');

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|sql|css|scss|html|json|yaml|yml)$/i;
const DOCS_EXT = /\.md$/i;
const TEST_RE = /(^|[\\/])(__tests__|test|tests)[\\/]|\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i;

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return '';
  }
}

function categorise(files) {
  const out = { code: [], docs: [], tests: [], other: [], all: files };
  for (const f of files) {
    if (!f) continue;
    if (TEST_RE.test(f)) out.tests.push(f);
    else if (DOCS_EXT.test(f)) out.docs.push(f);
    else if (CODE_EXT.test(f)) out.code.push(f);
    else out.other.push(f);
  }
  return out;
}

function categoriseStaged() {
  const raw = safeExec('git diff --cached --name-only');
  return categorise(raw ? raw.split(/\r?\n/) : []);
}

function categoriseWorking() {
  const raw = safeExec('git diff --name-only');
  return categorise(raw ? raw.split(/\r?\n/) : []);
}

function categoriseAllPending() {
  // staged + unstaged (working tree)
  const raw = safeExec('git status --porcelain');
  const files = raw
    ? raw
        .split(/\r?\n/)
        .map(l => l.replace(/^.{2,3}/, '').replace(/^"(.*)"$/, '$1').split(' -> ').pop())
        .filter(Boolean)
    : [];
  return categorise([...new Set(files)]);
}

function categoriseAheadOfMaster() {
  const raw = safeExec('git diff --name-only origin/master...HEAD');
  return categorise(raw ? raw.split(/\r?\n/) : []);
}

module.exports = {
  categoriseStaged,
  categoriseWorking,
  categoriseAllPending,
  categoriseAheadOfMaster,
  categorise,
};
