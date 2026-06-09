#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// .claude/hooks/training-capture.cjs
// UserPromptSubmit hook — captures TRAINING-relevant Director messages RAW into
// .claude/training-inbox.md for the daily 15:00 distiller (which does the real
// filtering + skill/rule updates). Director directive 2026-06-09.
//
// Design: dumb + generous. The hook only HEURISTICALLY decides "looks like it
// could be about how our agents/skills/rules should behave"; the distiller is
// the intelligence. Skips trivial approval-only messages. NEVER blocks the
// prompt and NEVER writes to stdout (UserPromptSubmit stdout is injected into
// context — we must stay silent). Always exits 0; any error is swallowed.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const fs = require('fs');
const path = require('path');

// Domain + process signals that mark a message as plausibly training-relevant.
// Deliberately NOT matching ultra-generic "надо/нужно" — that would capture
// every directive. The distiller can still pick up anything this misses.
const SIGNAL =
  /(скилл|skill|агент(?!ство)|agent|правил|\brule\b|доктрин|doctrin|обуч|\btrain|запомни|помни|всегда|always|никогда|never|систематическ|systematic|критик|critic|раскадровщик|storyboard|аниматор|animator|дизайнер|designer|провайдер|provider|формат|format|ракурс|камер|camera|орбит|orbit|резолюц|resolution|пайплайн|pipeline|\bгейт|\bgate\b|политик|polic|в скилл|на уровне скилл|отлажив|debug)/i;

// Trivial messages we never capture (approvals, q-answers, option picks).
const TRIVIAL = /^(да|нет|ок|окей|go|yes|no|ага|угу|[a-dа-гa-d]\)|q\d+\s*[a-dyn]?)[.!\s]*$/i;

function done() {
  process.exit(0);
}

let raw = '';
process.stdin.on('data', (c) => {
  raw += c;
});
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}');
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
    if (!prompt || prompt.length < 12) return done();
    if (TRIVIAL.test(prompt)) return done();
    if (!SIGNAL.test(prompt)) return done();

    const inbox = path.join(__dirname, '..', 'training-inbox.md');
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const entry = `\n## ${stamp} · director-msg (hook) · NEW · (triage at distill)\n${prompt}\n`;
    fs.appendFileSync(inbox, entry, 'utf8');
  } catch {
    /* never break the session */
  }
  done();
});
// Safety: if stdin never closes, don't hang the prompt.
setTimeout(done, 2000);
