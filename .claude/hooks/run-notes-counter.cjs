#!/usr/bin/env node
// UserPromptSubmit — inject how much has been written into docs/plans/ while a
// run is open.
//
// WHY THIS IS A NUMBER AND NOT A SENTENCE (Director, 2026-07-31):
// The run exists to produce two artifacts — the route (`ss-run`) and Polina's
// starter — and the rule "write the finding down at the end of each step" kept
// failing, because nothing fires at the end of a step. A sentence ("не забудь
// записать") becomes wallpaper within ten turns; that is exactly how the earlier
// soft warnings died. A COUNT does not: it is the state of the artifact sitting
// in context, and a zero that has not moved in four hours argues for itself.
// Nothing has to be remembered — the discrepancy is visible.
//
// Silent unless a run is open. Never blocks, never fails the prompt.
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const NOTES = path.join(ROOT, 'docs', 'plans', 'series-bootstrap-run-notes.md');

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 4000,
  });
}

try {
  // A run is "open" only while the notes file carries a position block. When the
  // run finishes the block goes away and this hook goes quiet for good.
  if (!fs.existsSync(NOTES)) process.exit(0);
  const head = fs.readFileSync(NOTES, 'utf8').slice(0, 4000);
  const m = head.match(/Прогон:\s*«([^»]+)»/);
  if (!m) process.exit(0);
  const runLabel = m[1];

  // Lines written into docs/plans/ that are not yet committed. Committed work
  // counts too — a session that committed its notes has done the job — so the
  // window is "since the last commit that touched docs/plans/".
  let uncommitted = 0;
  const numstat = git(['diff', '--numstat', 'HEAD', '--', 'docs/plans/']);
  for (const line of numstat.split('\n')) {
    const cols = line.trim().split('\t');
    if (cols.length >= 3 && /^\d+$/.test(cols[0])) uncommitted += Number(cols[0]);
  }

  let sinceCommit = '';
  try {
    const iso = git(['log', '-1', '--format=%cr', '--', 'docs/plans/']).trim();
    if (iso) sinceCommit = `, последняя запись ${iso}`;
  } catch (_) {
    /* no history yet */
  }

  const mark = uncommitted === 0 ? '⚠' : '✎';
  process.stdout.write(
    `[${mark} прогон «${runLabel}» открыт · в docs/plans/ не закоммичено: ${uncommitted} строк${sinceCommit}]`,
  );
} catch (_) {
  /* silent — a missing counter must never break the prompt */
}
process.exit(0);
