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

  // Two watched files, one machine. The journal records WHAT WAS DONE and must
  // move nearly every turn; the route (`ss-run`) records WHICH TOOL SERVES WHICH
  // STATION and moves only when something about the tooling is actually learned —
  // so it gets a slacker threshold. Director, 2026-08-04: «каждый шаг должен
  // записываться не потому, что ты помнишь, а потому что тебя хватает хук».
  const state = readState();
  const WATCHED = [
    {
      rel: `docs/plans/${prefix}-algorithm.md`,
      limit: 2,
      why: 'Обещание прогона — алгоритм фабрики пишется ПО ХОДУ, не восстанавливается в конце.',
      todo: 'Допиши шаг, который только что сделал: что делал, каким ИНСТРУМЕНТОМ, почему в этом порядке, что было бы дешевле.',
    },
    {
      rel: '.claude/skills/ss-run/SKILL.md',
      limit: 5,
      why: 'Прогон существует ради МАРШРУТА: какой штатный инструмент когда брать. Маршрут, дописанный в конце, — пересказ, а не путь.',
      todo: 'Занеси в `ss-run` то, что узнал про инструменты: чем запускается станция, что её держит, что рядом лежит и инструментом НЕ является.',
    },
  ];

  const next = { ...state };
  let blocker = null;
  const warnings = [];

  for (const w of WATCHED) {
    const abs = path.join(ROOT, w.rel);
    const lines = fs.existsSync(abs)
      ? fs.readFileSync(abs, 'utf8').split('\n').length
      : 0;
    const prev = state[w.rel] ?? { lines: -1, misses: 0 };

    if (lines > prev.lines) {
      next[w.rel] = { lines, misses: 0 };
      continue;
    }

    const misses = prev.misses + 1;
    if (misses < w.limit) {
      next[w.rel] = { lines, misses };
      warnings.push(
        `[Hook] Прогон «${runLabel}»: ${w.rel} не рос этот ход (${lines} строк, ` +
          `${misses}/${w.limit}). На ${w.limit}-м стоп будет заблокирован.`,
      );
      continue;
    }

    // Threshold reached → block once, then reset so this can never loop.
    next[w.rel] = { lines, misses: 0 };
    if (!blocker) blocker = { ...w, lines };
  }

  // ——— Third check: a reshot frame must carry a rewritten acceptance line ———
  //
  // WHY (2026-08-04, E36): the Director reversed the ending, I wrote a new frame
  // prompt and did NOT rewrite that frame's acceptance block. The old lines said
  // "walks out of frame", the new shot did not — so there was nothing left to
  // check against, and a legless character shipped. The rule existed in the
  // journal two hours earlier and was applied from memory, which is exactly the
  // failure mode this file was created to remove.
  //
  // Mechanism: if any prompt under FILMS/_run/**/prompts is NEWER than the run's
  // expectations document, the spec is behind the material. Cheap, exact, and it
  // cannot be forgotten.
  try {
    const runsRoot = path.join(ROOT, 'FILMS', '_run');
    let newestPrompt = 0;
    let newestName = '';
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        // Only prompts count. The first version walked every .txt under the run
        // and fired on `packaging.txt` (publication copy, not a shot prompt) —
        // a guard that cries wolf teaches you to ignore it.
        else if (/\.txt$/.test(e.name) && /[\\/]prompts[\\/]/.test(p)) {
          const m = fs.statSync(p).mtimeMs;
          if (m > newestPrompt) { newestPrompt = m; newestName = e.name; }
        }
      }
    };
    if (fs.existsSync(runsRoot)) walk(runsRoot);

    let newestSpec = 0;
    for (const name of fs.readdirSync(PLANS)) {
      if (!/expectations.*\.md$/.test(name)) continue;
      const m = fs.statSync(path.join(PLANS, name)).mtimeMs;
      if (m > newestSpec) newestSpec = m;
    }

    if (newestPrompt && newestPrompt > newestSpec + 60_000) {
      writeState(next);
      console.error(
        `[Hook] СТОП ЗАБЛОКИРОВАН. Промпт «${newestName}» новее листа приёмки на ` +
          `${Math.round((newestPrompt - newestSpec) / 60000)} мин.`,
      );
      console.error(
        '[Hook] Переснял кадр — перепиши его строки «приму, если». Старая строка на новом ' +
          'кадре не проверяет ничего, и брак проходит молча (E36: герой без ног).',
      );
      process.exit(2);
    }
  } catch (_) {
    /* a guard that cannot read the tree must not break the turn */
  }

  writeState(next);

  if (blocker) {
    console.error(
      `[Hook] СТОП ЗАБЛОКИРОВАН. Прогон «${runLabel}»: ${blocker.rel} стоит на ${blocker.lines} строках ${blocker.limit} ходов подряд.`,
    );
    console.error(`[Hook] ${blocker.why}`);
    console.error(`[Hook] ${blocker.todo}`);
    process.exit(2);
  }

  if (warnings.length) {
    for (const line of warnings) console.error(line);
    process.exit(1);
  }

  process.exit(0);
} catch (_) {
  process.exit(0);
}
