#!/usr/bin/env node
// SandyStudio — PreToolUse hook — naming-validator
// Validates new file names in project-content directories (scripts, storyboards,
// bibles, prompts, reviews) match the SS-... naming convention from CLAUDE.md §3.
// Studio code roots (webapp, lib, agents, specs, config, .claude) are whitelisted —
// the convention is for film-project content, not source code.

let buf = '';
process.stdin.on('data', c => (buf += c));
process.stdin.on('end', () => {
  try {
    const i = JSON.parse(buf);
    const fp = (i && i.tool_input && i.tool_input.file_path) || '';
    if (!fp) return process.stdout.write(buf);

    const norm = fp.split(/[\\/]+/).filter(Boolean);
    const lower = norm.map(p => p.toLowerCase());

    // Whitelist studio code/source directories. These hold .ts/.mjs/.cjs source
    // and dev scripts (e.g. webapp/scripts/pipeline-status.ts, lib/foo.ts), NOT
    // SS- episode artifacts. The SS- naming convention (CLAUDE.md §3) governs only
    // project CONTENT files under film project roots — never studio code. If ANY
    // path segment is a code root, skip validation entirely. This prevents the
    // false-positive block where webapp/scripts/ trips the 'scripts' gov-dir test.
    const codeDirs = ['webapp', 'lib', 'agents', 'specs', 'config', '.claude'];
    const inCodeDir = lower.some(p => codeDirs.includes(p));
    if (inCodeDir) return process.stdout.write(buf);

    // Only true content dirs (episode artifact folders) trigger SS- validation.
    const govDirs = ['scripts', 'storyboards', 'bibles', 'prompts', 'reviews'];
    const inGov = lower.some(p => govDirs.includes(p));
    if (!inGov) return process.stdout.write(buf);

    const base = norm[norm.length - 1];
    const re = /^SS-(S\d{2}|PILOT)(-E\d{2})?-(SCR|STB|IMG|VID|AUD|BIB|PRO|REV|SPC|STA)-[a-z0-9_]+-v\d{2}-(DRAFT|REVIEW|REVISION|APPROVED|LOCKED)\.[a-z0-9]+$/i;
    if (!re.test(base)) {
      console.error('[Hook] BLOCKED: filename "' + base + '" violates naming convention.');
      console.error('[Hook] Expected: SS-S0X-(E0X|PILOT)-TYPE-name-vNN-STATUS.ext  (CLAUDE.md §3).');
      console.error('[Hook] Types: SCR, STB, IMG, VID, AUD, BIB, PRO, REV, SPC, STA.');
      console.error('[Hook] Status: DRAFT, REVIEW, REVISION, APPROVED, LOCKED.');
      process.exit(2);
    }
    process.stdout.write(buf);
  } catch (_) {
    process.stdout.write(buf);
  }
});
