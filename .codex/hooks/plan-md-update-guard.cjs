#!/usr/bin/env node
// SandyStudio — PreToolUse hook (Bash matcher) — plan-md-update-guard
// Implements CLAUDE.md §12 Ritual 1: PLAN.md must be updated in the same
// session as code changes, before commit.
//
// Fires on Bash tool calls. Only acts when the command is `git commit*`.
// Inspects staged files; if code/sql/css present AND PLAN.md is not staged,
// emits warning (exit 1, soft). Docs-only commits pass silently.
// Tests-only commits pass silently.
//
// Override: SANDY_HOOKS_OFF=1 → silent pass.
// User override: append `# no-plan-update` to commit message intent, or use
// `git commit --no-verify` (Director's call).
//
// Note: this is a *warning*. The actual git commit will proceed even on
// exit 1 — the message goes to stderr and Claude sees it, then can decide
// whether to actually commit or fix PLAN.md first.

const path = require('path');

if (process.env.SANDY_HOOKS_OFF === '1') {
  let _buf = '';
  process.stdin.on('data', c => (_buf += c));
  process.stdin.on('end', () => process.stdout.write(_buf));
  return;
}

const HELPER = path.join(__dirname, 'lib', 'git-changed.cjs');
let categoriseStaged, categoriseWorking;
try {
  ({ categoriseStaged, categoriseWorking } = require(HELPER));
} catch (_) {
  // helper missing → pass through silently
  let _buf = '';
  process.stdin.on('data', c => (_buf += c));
  process.stdin.on('end', () => process.stdout.write(_buf));
  return;
}

let buf = '';
process.stdin.on('data', c => (buf += c));
process.stdin.on('end', () => {
  let cmd = '';
  try {
    const i = JSON.parse(buf);
    cmd = (i && i.tool_input && i.tool_input.command) || '';
  } catch (_) {
    return process.stdout.write(buf);
  }

  // Only inspect `git commit` invocations (not amend, not message-only edits).
  // Match `git commit` with any args; skip `git commit --amend` which keeps prior state.
  const isCommit = /\bgit\s+commit\b/.test(cmd) && !/\bgit\s+commit\s+--amend\b/.test(cmd);
  if (!isCommit) return process.stdout.write(buf);

  // Director opt-out via commit message marker
  if (/#\s*no-plan-update\b/i.test(cmd)) return process.stdout.write(buf);

  // What's actually being committed? Look at staged + working tree (git add -A pattern).
  const staged = categoriseStaged();
  const working = categoriseWorking();

  const allFiles = [...new Set([...staged.all, ...working.all])];
  const allCode = [...new Set([...staged.code, ...working.code])];
  const allDocs = [...new Set([...staged.docs, ...working.docs])];

  // If nothing staged AND `git add -A` not in the command line → likely empty commit, skip
  if (allFiles.length === 0) return process.stdout.write(buf);

  // Docs-only? pass silently.
  if (allCode.length === 0) return process.stdout.write(buf);

  // Is PLAN.md among the changes?
  const planTouched = allDocs.some(f => /(^|[\\/])PLAN\.md$/i.test(f));
  if (planTouched) return process.stdout.write(buf);

  // Master-only PLAN.md rule (Director q6, 2026-06-27, CLAUDE.md §12): feature
  // branches do NOT touch PLAN.md — only master/main does. So only nag when
  // committing there; a feature-branch code commit legitimately leaves PLAN.md
  // untouched and must pass silently.
  try {
    const branch = require('child_process')
      .execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' })
      .trim();
    if (branch !== 'master' && branch !== 'main') return process.stdout.write(buf);
  } catch (_) { /* branch undetectable → fall through to the warn */ }

  console.error(`[Hook] WARN: code change but PLAN.md not updated.`);
  console.error(`[Hook] CLAUDE.md §12 Ritual 1 — update PLAN.md '## CURRENT STATE' (Phase/Status/Next/Date) before commit.`);
  console.error(`[Hook] Files changed: ${allFiles.slice(0, 5).join(', ')}${allFiles.length > 5 ? `, +${allFiles.length - 5} more` : ''}`);
  console.error(`[Hook] To override: add '# no-plan-update' to the commit message, or use --no-verify.`);
  // Soft warning — pass through so Claude sees the warn and can act, but git commit proceeds
  process.stdout.write(buf);
  process.exit(1);
});
