#!/usr/bin/env node
// SandyStudio — PreToolUse hook — mode-validator
// Blocks Write/Edit when system mode in PLAN.md is ===1=== (ANALYTICS, read-only).
// CLAUDE.md §6: every session starts ===1===; only Director switches to ===5===.
//
// Bypass scope (always allowed regardless of mode — bootstrap & meta-config):
//   - PLAN.md itself (so Director can flip modes)
//   - anything under .claude/ (settings, hooks, skills, agents)
//   - root config files: .env*, .gitignore, .gitattributes, README.md, CLAUDE.md
//
// Mode is read from PLAN.md `## Current Mode` section. If PLAN.md is missing,
// fail-safe default is ===1=== — but the bypass list above keeps the project
// usable until PLAN.md is created in Sprint 1.

const fs = require('fs');
const PLAN = 'C:/SandyStudio/PLAN.md';

const BYPASS_RE = [
  /(^|[\\/])PLAN\.md$/i,
  /[\\/]\.claude[\\/]/i,
  /(^|[\\/])\.env(\.|$)/i,
  /(^|[\\/])\.gitignore$/i,
  /(^|[\\/])\.gitattributes$/i,
  /(^|[\\/])README\.md$/i,
  /(^|[\\/])CLAUDE\.md$/i,
];

let buf = '';
process.stdin.on('data', c => (buf += c));
process.stdin.on('end', () => {
  let fp = '';
  try {
    const i = JSON.parse(buf);
    fp = (i && i.tool_input && i.tool_input.file_path) || '';
  } catch (_) {
    // unparseable input — pass through, do not block
    return process.stdout.write(buf);
  }

  if (BYPASS_RE.some(re => re.test(fp))) {
    return process.stdout.write(buf);
  }

  let mode = '===1==='; // fail-safe default
  try {
    if (fs.existsSync(PLAN)) {
      const t = fs.readFileSync(PLAN, 'utf8');
      // PLAN.md may carry the active mode in either form (CLAUDE.md §6):
      //   ## Current Mode\n===X===
      //   Mode:    ===X===            (used inside the CURRENT STATE block)
      // Try both, then a last-resort first-marker scan.
      let m = t.match(/##\s*Current\s*Mode[\s\S]{0,200}?(===[15]===)/i);
      if (!m) m = t.match(/^\s*Mode\s*:[^\n]*?(===[15]===)/im);
      if (!m) m = t.match(/(===[15]===)/);
      if (m) mode = m[1];
    }
  } catch (_) {
    // keep fail-safe default
  }

  if (mode === '===1===') {
    console.error('[Hook] BLOCKED: SandyStudio is in ===1=== ANALYTICS mode (read-only).');
    console.error('[Hook] Flip PLAN.md `Mode:` line to ===5=== to allow writes (Director only).');
    process.exit(2);
  }
  process.stdout.write(buf);
});
