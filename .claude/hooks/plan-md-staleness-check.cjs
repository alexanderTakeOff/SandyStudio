#!/usr/bin/env node
// SandyStudio — SessionStart hook — plan-md-staleness-check
// Implements CLAUDE.md §12 Ritual 2 (session-start sanity check).
//
// Reads PLAN.md `## CURRENT STATE` `Date:` field, compares to today.
// - ≤ 3 days diff → silent pass
// - > 3 days diff → emit warning (exit 1, soft)
//
// Override: SANDY_HOOKS_OFF=1 disables this hook entirely.
//
// PLAN.md is searched in this order so the hook works from any worktree:
//   1. $PROJECT_ROOT/PLAN.md (if env set)
//   2. Walk up from cwd looking for PLAN.md — picks up the current worktree's
//      branch state, which is what an in-session sanity check should anchor on.
//   3. C:/SandyStudio/PLAN.md (canonical fallback, master branch checkout)

const fs = require('fs');
const path = require('path');

if (process.env.SANDY_HOOKS_OFF === '1') process.exit(0);

function findFromCwd() {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const p = path.join(dir, 'PLAN.md');
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
    const next = path.dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  return null;
}

const candidates = [
  process.env.PROJECT_ROOT ? path.join(process.env.PROJECT_ROOT, 'PLAN.md') : null,
  findFromCwd(),
  'C:/SandyStudio/PLAN.md',
].filter(Boolean);

let planPath = null;
for (const p of candidates) {
  try {
    if (fs.existsSync(p)) {
      planPath = p;
      break;
    }
  } catch (_) {}
}

if (!planPath) process.exit(0); // no PLAN.md → silent pass (bootstrap-safe)

let txt = '';
try {
  txt = fs.readFileSync(planPath, 'utf8');
} catch (_) {
  process.exit(0);
}

// CURRENT STATE block uses fenced code: look for `Date:    YYYY-MM-DD`.
const m = txt.match(/^\s*Date\s*:\s*(\d{4}-\d{2}-\d{2})/im);
if (!m) process.exit(0); // no parsable date → silent pass

const planDate = new Date(m[1] + 'T00:00:00Z');
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const diffDays = Math.floor((today - planDate) / 86400000);

if (diffDays <= 3) process.exit(0); // fresh enough

console.error(`[Hook] WARN: PLAN.md last updated ${diffDays} days ago (${m[1]}).`);
console.error(`[Hook] CLAUDE.md §12 Ritual 2 — live anchor may be stale.`);
console.error(`[Hook] Verify '## CURRENT STATE' before starting work; flag Director if reality has moved on.`);
process.exit(1);
