#!/usr/bin/env node
// SandyStudio — Stop hook — run-algorithm-growth-guard
//
// WHY (Director q6y, 2026-08-01): during the clean run I promised the
// factory-algorithm draft would be written INCREMENTALLY, step by step, rather
// than reconstructed at the end — and that promise rested on memory alone. A
// promise that must be remembered is not a mechanism. The per-file counter
// (`run-notes-counter.cjs`) makes a frozen algorithm VISIBLE every turn; this
// hook makes it BLOCKING once it has been frozen for two turns in a row.
//
// An algorithm reconstructed at the end describes how the author THINKS they
// worked, not how they worked. That is the artifact this run exists to produce,
// so its decay is not a style issue.
//
// Scope is DERIVED, never a maintained list: active only while some
// `docs/plans/*-brief.md` carries a `Прогон: «…»` block, and it watches that
// run's `*-algorithm.md` sibling. Run over → drop the block → hook goes quiet.
//
// Behaviour:
//   - algorithm file grew since last stop  → reset the miss counter, pass.
//   - unchanged, 1st time                  → warn softly (exit 1).
//   - unchanged, 2nd time in a row         → BLOCK the stop (exit 2) and reset
//                                            the counter, so it can never loop.
//   - `stop_hook_active` in the payload    → pass (the harness is already
//                                            re-invoking us; never stack).
//
// Override: SANDY_HOOKS_OFF=1 → silent pass.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

if (process.env.SANDY_HOOKS_OFF === '1') process.exit(0);

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const PLANS = path.join(ROOT, 'docs', 'plans');
const STATE = path.join(ROOT, '.claude', '.run-guard-state.json');

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function writeState(s) {
  try {
    fs.writeFileSync(STATE, JSON.stringify(s, null, 1));
  } catch (_) {
    /* a guard that cannot persist must still not break the turn */
  }
}

try {
  // Never stack on our own block.
  if (readStdinJson().stop_hook_active) process.exit(0);
  if (!fs.existsSync(PLANS)) process.exit(0);

  // Is a run open, and which file is its algorithm draft?
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

  const algoRel = `docs/plans/${prefix}-algorithm.md`;
  const algoAbs = path.join(ROOT, algoRel);
  const lines = fs.existsSync(algoAbs)
    ? fs.readFileSync(algoAbs, 'utf8').split('\n').length
    : 0;

  const state = readState();
  const prev = state[algoRel] ?? { lines: -1, misses: 0 };

  if (lines > prev.lines) {
    writeState({ ...state, [algoRel]: { lines, misses: 0 } });
    process.exit(0);
  }

  const misses = prev.misses + 1;

  if (misses < 2) {
    writeState({ ...state, [algoRel]: { lines, misses } });
    console.error(
      `[Hook] Прогон «${runLabel}»: ${algoRel} не рос этот ход (${lines} строк). ` +
        `Ещё один такой ход — и стоп будет заблокирован.`,
    );
    process.exit(1);
  }

  // Second miss in a row → block once, then reset so this can never loop.
  writeState({ ...state, [algoRel]: { lines, misses: 0 } });
  console.error(
    `[Hook] СТОП ЗАБЛОКИРОВАН. Прогон «${runLabel}»: ${algoRel} стоит на ${lines} строках два хода подряд.`,
  );
  console.error(
    `[Hook] Обещание прогона — алгоритм фабрики пишется ПО ХОДУ, не восстанавливается в конце.`,
  );
  console.error(
    `[Hook] Допиши шаг, который только что сделал: что делал, почему в этом порядке, что было бы дешевле. Потом заканчивай ход.`,
  );
  process.exit(2);
} catch (_) {
  process.exit(0);
}
