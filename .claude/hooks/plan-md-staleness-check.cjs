#!/usr/bin/env node
// SandyStudio — SessionStart hook — plan-md-staleness-check
// Implements CLAUDE.md §12 Ritual 2 (session-start sanity check).
//
// Checks the freshness of BOTH live anchors:
//   - PLAN.md   `## CURRENT STATE` `Date: YYYY-MM-DD`
//   - PLANET.md `## Текущая планета: … | выбрана YYYY-MM-DD`
// For each: ≤ 3 days diff → silent pass; > 3 days → warn (soft). Exit 1 if EITHER
// is stale, else 0. A missing/undated file passes silently (bootstrap-safe) and
// never breaks the other check.
//
// 2026-07-20: PLANET.md added. It drifted 17 episodes behind precisely because the
// old single-file hook only read PLAN.md — the mechanism the ratified anchors need.
//
// Override: SANDY_HOOKS_OFF=1 disables this hook entirely.
//
// Files are searched in this order so the hook works from any worktree:
//   1. $PROJECT_ROOT/<file> (if env set)
//   2. Walk up from cwd — picks up the current worktree's branch state.
//   3. <repo>/<file> derived from this script's own location (last resort).

const fs = require('fs');
const path = require('path');

if (process.env.SANDY_HOOKS_OFF === '1') process.exit(0);

function findFromCwd(fileName) {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const p = path.join(dir, fileName);
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
    const next = path.dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  return null;
}

function locate(fileName) {
  const candidates = [
    process.env.PROJECT_ROOT ? path.join(process.env.PROJECT_ROOT, fileName) : null,
    findFromCwd(fileName),
    path.join(__dirname, '..', '..', fileName),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

// Returns true if the file exists, has a parsable date, and is stale (> maxDays).
// Emits its own warning lines. Any no-op path (missing file / unreadable / no
// date / fresh) returns false so one anchor never breaks the other's check.
function checkFile({ fileName, dateRegex, label, maxDays, guidance }) {
  const p = locate(fileName);
  if (!p) return false; // no file → silent pass (bootstrap-safe)

  let txt = '';
  try {
    txt = fs.readFileSync(p, 'utf8');
  } catch (_) {
    return false;
  }
  txt = txt.replace(/^﻿/, ''); // strip a leading BOM — on Windows editors add it
  // silently, and a BOM before `##`/`Date:` would defeat the `^` anchor (the exact
  // way a "fresh" file could still read as stale-blind).

  const m = txt.match(dateRegex);
  if (!m) return false; // no parsable date → silent pass

  const date = new Date(m[1] + 'T00:00:00Z');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const diffDays = Math.floor((today - date) / 86400000);

  if (diffDays <= maxDays) return false; // fresh enough

  console.error(`[Hook] WARN: ${label} last updated ${diffDays} days ago (${m[1]}).`);
  console.error(`[Hook] CLAUDE.md §12 Ritual 2 — live anchor may be stale.`);
  console.error(`[Hook] ${guidance}`);
  return true;
}

const planStale = checkFile({
  fileName: 'PLAN.md',
  dateRegex: /^\s*Date\s*:\s*(\d{4}-\d{2}-\d{2})/im,
  label: 'PLAN.md',
  maxDays: 3,
  guidance: "Verify '## CURRENT STATE' before starting work; flag Director if reality has moved on.",
});

const planetStale = checkFile({
  fileName: 'PLANET.md',
  // Anchor to the header date (`выбрана`), NOT the footer where it is duplicated.
  dateRegex: /^##\s*Текущая планета:.*?выбрана\s+(\d{4}-\d{2}-\d{2})/im,
  label: 'PLANET.md',
  maxDays: 3,
  guidance: "Verify '## Текущая планета' — the current planet may have drifted; flag Director.",
});

process.exit(planStale || planetStale ? 1 : 0);
