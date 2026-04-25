#!/usr/bin/env node
// SandyStudio — PreToolUse hook — locked-status-guard
// Blocks Edit on any file whose name contains -LOCKED. (CLAUDE.md §7.3:
// LOCKED files are never modified — create a new version instead).

let buf = '';
process.stdin.on('data', c => (buf += c));
process.stdin.on('end', () => {
  try {
    const i = JSON.parse(buf);
    const fp = (i && i.tool_input && i.tool_input.file_path) || '';
    if (/-LOCKED\./i.test(fp)) {
      console.error('[Hook] BLOCKED: cannot modify a LOCKED file.');
      console.error('[Hook] Create a new version (e.g. v02) instead (CLAUDE.md §7.3).');
      process.exit(2);
    }
    process.stdout.write(buf);
  } catch (_) {
    process.stdout.write(buf);
  }
});
