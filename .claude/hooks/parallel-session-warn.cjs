#!/usr/bin/env node
// SandyStudio — SessionStart hook — parallel-session-warn
// Implements CLAUDE.md §12 parallel-session discipline (hard cap: 2 + main).
//
// Counts active git worktrees. Warns if > 3 (main + 2 parallel).
// Output goes to stderr; Claude sees it and surfaces to Director.
//
// Override: SANDY_HOOKS_OFF=1 disables this hook entirely.

const { execSync } = require('child_process');
const path = require('path');

if (process.env.SANDY_HOOKS_OFF === '1') process.exit(0);

const HARD_CAP = 3; // main + 2 parallel

// Repo root derived from THIS script's location (<repo>/.claude/hooks/) — never a
// hardcoded machine path. 2026-07-17: was pinned to the desktop's 'C:/SandyStudio',
// so on any other machine every git call ran in the wrong (or a nonexistent) cwd
// and safeExec swallowed the failure — the worktree cap silently stopped counting.
const REPO_ROOT = path.join(__dirname, '..', '..');

function safeExec(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: REPO_ROOT,
      ...opts,
    }).trim();
  } catch (_) {
    return '';
  }
}

const out = safeExec('git worktree list --porcelain');
if (!out) process.exit(0); // not a git repo or git unavailable → silent

const worktreeLines = out.split(/\r?\n/).filter(l => l.startsWith('worktree '));
const count = worktreeLines.length;

if (count <= HARD_CAP) process.exit(0);

const claudeWorktrees = worktreeLines
  .map(l => l.replace(/^worktree\s+/, ''))
  .filter(p => /[\\/]worktrees[\\/]/.test(p));

console.error(`[Hook] WARN: ${count} active git worktrees detected (cap is ${HARD_CAP} = main + 2).`);
console.error(`[Hook] CLAUDE.md §12 parallel-session discipline.`);
if (claudeWorktrees.length) {
  console.error(`[Hook] Claude worktrees:`);
  claudeWorktrees.forEach(p => console.error(`[Hook]   - ${p}`));
}
console.error(`[Hook] Consider closing stale claude/* branches after Director approval.`);
process.exit(1);
