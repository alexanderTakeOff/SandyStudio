#!/usr/bin/env node
// SandyStudio — Stop hook — session-end-memo-check
// Implements CLAUDE.md §12 Ritual 4 (session-end summary in memory).
//
// Fires when the session ends (Stop hook). Checks:
//   1. Did this session perform meaningful work? (any non-auto-sync commit
//      in the last 6 hours on a claude/* branch, OR uncommitted edits)
//   2. Is there a session_YYYY-MM-DD_*.md memo in
//      ~/.claude/projects/C--SandyStudio/memory/ matching today?
//
// If (1) yes AND (2) no → emit warning (exit 1, soft).
// Cannot force memo writing at Stop time — only remind.
//
// Override: SANDY_HOOKS_OFF=1 → silent pass.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

if (process.env.SANDY_HOOKS_OFF === '1') process.exit(0);

const MEMORY_DIR = path.join(
  os.homedir(),
  '.claude',
  'projects',
  'C--SandyStudio',
  'memory'
);

function safeExec(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      ...opts,
    }).trim();
  } catch (_) {
    return '';
  }
}

// Step 1 — meaningful work in this session?
// Heuristic: any non-"auto-sync" commit in last 6 hours.
const sinceIso = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
const logRaw = safeExec(
  `git log --since="${sinceIso}" --pretty=format:%s --no-merges`
);
const recentCommits = logRaw ? logRaw.split(/\r?\n/).filter(Boolean) : [];
const meaningfulCommits = recentCommits.filter(
  msg => !/^auto-sync\s/i.test(msg)
);

// Also check uncommitted edits
const dirtyRaw = safeExec('git status --porcelain');
const hasDirty = dirtyRaw.split(/\r?\n/).filter(Boolean).length > 0;

const meaningfulWork = meaningfulCommits.length > 0 || hasDirty;

if (!meaningfulWork) process.exit(0); // no work → no memo needed

// Step 2 — today's memo present?
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
let hasTodayMemo = false;
try {
  if (fs.existsSync(MEMORY_DIR)) {
    const files = fs.readdirSync(MEMORY_DIR);
    hasTodayMemo = files.some(
      f => f.startsWith(`session_${today}_`) && f.endsWith('.md')
    );
  }
} catch (_) {
  // memory dir missing → fall through to warn
}

if (hasTodayMemo) process.exit(0); // good

console.error(`[Hook] WARN: session-end memo missing per CLAUDE.md §12 Ritual 4.`);
console.error(`[Hook] Detected meaningful work this session:`);
if (meaningfulCommits.length) {
  console.error(`[Hook]   - ${meaningfulCommits.length} non-auto-sync commits in last 6h`);
  meaningfulCommits.slice(0, 3).forEach(m => console.error(`[Hook]       · ${m.slice(0, 100)}`));
}
if (hasDirty) console.error(`[Hook]   - uncommitted working tree changes`);
console.error(`[Hook] Add: ${MEMORY_DIR}/session_${today}_<title>.md`);
console.error(`[Hook] Cover: what landed, last commits, PLAN.md updates, verify counts, what's open.`);
console.error(`[Hook] Then link from MEMORY.md index.`);
process.exit(1);
