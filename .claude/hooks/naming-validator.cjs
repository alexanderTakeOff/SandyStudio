#!/usr/bin/env node
// SandyStudio — PreToolUse hook — naming-validator
// Validates new file names in governance directories (scripts, storyboards,
// bibles, prompts, reviews) match the SS-... naming convention from CLAUDE.md §3.

let buf = '';
process.stdin.on('data', c => (buf += c));
process.stdin.on('end', () => {
  try {
    const i = JSON.parse(buf);
    const fp = (i && i.tool_input && i.tool_input.file_path) || '';
    if (!fp) return process.stdout.write(buf);

    const norm = fp.split(/[\\/]+/).filter(Boolean);
    const govDirs = ['scripts', 'storyboards', 'bibles', 'prompts', 'reviews'];
    const inGov = norm.some(p => govDirs.includes(p.toLowerCase()));
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
