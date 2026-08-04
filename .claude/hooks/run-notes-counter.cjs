#!/usr/bin/env node
// UserPromptSubmit — inject, PER FILE, how much has been written into the open
// run's records.
//
// WHY THIS IS A NUMBER AND NOT A SENTENCE (Director, 2026-07-31):
// The run exists to produce artifacts, and the rule "write the finding down at
// the end of each step" kept failing, because nothing fires at the end of a
// step. A sentence ("не забудь записать") becomes wallpaper within ten turns;
// that is exactly how the earlier soft warnings died. A COUNT does not: it is
// the state of the artifact sitting in context, and a zero that has not moved
// in four hours argues for itself. Nothing has to be remembered — the
// discrepancy is visible.
//
// WHY PER FILE (Director, 2026-08-01): one aggregate number is satisfiable by
// writing ANYTHING. The clean run promised the factory-algorithm draft would
// grow step by step alongside the journal — with a single total, a frozen
// algorithm hides behind a growing journal. Each record is counted on its own
// line, so a file that stopped moving is visible by itself.
//
// Run detection is DERIVED, never a maintained list: a run is open while some
// `docs/plans/*-brief.md` carries a `Прогон: «…»` block; its records are the
// siblings sharing that file's prefix. Finish the run → drop the block → the
// hook goes quiet for good.
//
// Silent unless a run is open. Never blocks, never fails the prompt.
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const PLANS = path.join(ROOT, 'docs', 'plans');
const STALE_MINUTES = 45;

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 4000,
  });
}

/**
 * Uncommitted added lines for one repo-relative path.
 *
 * `git diff HEAD` does NOT see untracked files — so a brand-new record read as
 * `+0` on the very turn it was written (D38, caught 2026-08-01 by the counter
 * contradicting the work that had just happened). A never-committed file counts
 * its whole body: every line of it is uncommitted.
 */
function uncommittedLines(rel) {
  const tracked = git(['ls-files', '--', rel]).trim();
  if (!tracked) {
    try {
      return fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').length;
    } catch (_) {
      return 0;
    }
  }
  let n = 0;
  const numstat = git(['diff', '--numstat', 'HEAD', '--', rel]);
  for (const line of numstat.split('\n')) {
    const cols = line.trim().split('\t');
    if (cols.length >= 3 && /^\d+$/.test(cols[0])) n += Number(cols[0]);
  }
  return n;
}

/** Minutes since the last commit touching `rel`, or null if never committed. */
function minutesSinceCommit(rel) {
  try {
    const ct = git(['log', '-1', '--format=%ct', '--', rel]).trim();
    if (!ct) return null;
    return Math.round((Date.now() / 1000 - Number(ct)) / 60);
  } catch (_) {
    return null;
  }
}

try {
  if (!fs.existsSync(PLANS)) process.exit(0);

  // Find the open run: a *-brief.md carrying a position block.
  let runLabel = null;
  let prefix = null;
  for (const name of fs.readdirSync(PLANS)) {
    if (!name.endsWith('-brief.md')) continue;
    const head = fs.readFileSync(path.join(PLANS, name), 'utf8').slice(0, 4000);
    const m = head.match(/Прогон:\s*«([^»]+)»/);
    if (!m) continue;
    runLabel = m[1];
    prefix = name.slice(0, -'-brief.md'.length);
    break;
  }
  if (!runLabel) process.exit(0);

  // The run's records = siblings sharing the prefix, minus the brief itself
  // (the brief is the assignment; it is not supposed to grow).
  const records = fs
    .readdirSync(PLANS)
    .filter((n) => n.startsWith(`${prefix}-`) && n.endsWith('.md') && n !== `${prefix}-brief.md`)
    .sort();

  const parts = [];
  if (records.length === 0) {
    parts.push('⚠ записей ещё НЕТ');
  } else {
    for (const name of records) {
      const rel = `docs/plans/${name}`;
      const n = uncommittedLines(rel);
      const mins = minutesSinceCommit(rel);
      const stale = n === 0 && (mins === null || mins > STALE_MINUTES);
      const age = mins === null ? 'не коммичен' : `${mins}м назад`;
      const short = name.slice(prefix.length + 1, -3);
      parts.push(`${stale ? '⚠' : '✎'} ${short}: +${n} (${age})`);
    }
  }

  process.stdout.write(`[прогон «${runLabel}» · ${parts.join(' · ')}]`);
} catch (_) {
  /* silent — a missing counter must never break the prompt */
}
process.exit(0);
