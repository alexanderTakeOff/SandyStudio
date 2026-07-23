#!/usr/bin/env node
// SandyStudio — Stop hook — session-end-memo-check
// Implements CLAUDE.md §12 Ritual 4 (session-end summary in memory) PLUS the
// in-session distill reminder (Director q1a 2026-07-24: the learning loop lives
// IN the session — durable lessons land in repo-tracked skills/agents so they
// travel desktop↔laptop via git; machine-local memory is an index, not the carrier).
//
// Fires when the session ends (Stop hook). Checks:
//   1. Did this session perform meaningful work? (any non-auto-sync commit
//      in the last 6 hours, OR uncommitted edits)
//   2. Is there a session_YYYY-MM-DD_*.md memo in the project memory dir?
//   3. Distill reminder: if work happened but no skill/agent file was touched,
//      remind to distill any Director corrections into the target skill NOW.
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

// Project memory key changed when the repo moved (C:\SandyStudio →
// C:\Users\Alexander\sandystudio, 2026-07-19). Probe candidates; first existing wins.
const MEMORY_DIR_CANDIDATES = [
  path.join(os.homedir(), '.claude', 'projects', 'C--Users-Alexander-sandystudio', 'memory'),
  path.join(os.homedir(), '.claude', 'projects', 'C--SandyStudio', 'memory'),
];
const MEMORY_DIR =
  MEMORY_DIR_CANDIDATES.find(d => {
    try { return fs.existsSync(d); } catch (_) { return false; }
  }) ?? MEMORY_DIR_CANDIDATES[0];

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

// Distill status rides along with the memo warning (no separate nag path):
// repo-tracked skills/agents are the ONLY training artifact that travels
// desktop↔laptop via git — a Director correction left undistilled evaporates.
const touchedRaw = safeExec(
  `git log --since="${sinceIso}" --name-only --pretty=format: --no-merges`,
);
const touchedTraining = (touchedRaw + '\n' + dirtyRaw)
  .split(/\r?\n/)
  .some(l => /\.claude\/skills\/|\.agents\/skills\/|^agents\/|\sagents\//.test(l));

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
if (!touchedTraining) {
  console.error(
    `[Hook] DISTILL: no skill/agent file touched this session. If the Director corrected ` +
    `how any agent should behave — distill into .claude/skills/* or agents/*.md NOW ` +
    `(train-personnel); only repo-tracked artifacts reach both machines via git.`,
  );
}
process.exit(1);
