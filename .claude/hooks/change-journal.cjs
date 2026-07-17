#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────────
// change-journal.cjs — PostToolUse(Write|Edit) durable change journal.
//
// Purpose (Director 2026-06-27): make our CHANGES survive a `/clear`. A clear
// wipes the conversation context, but NOT the filesystem. This hook appends one
// compact line per Write/Edit to `.claude/CHANGES.md`, so after any clear (or a
// fresh session) the record of what changed — and which durable files (PLAN.md,
// plans/, memory, NORTH_STAR/PLANET) hold the substance — is recoverable on disk.
//
// Contract: NEVER blocks. Always exits 0, swallows every error. Passive journal,
// not a guard. Auto-capped to the last MAX_LINES entries so it can't grow forever.
// The journal is git-ignored (local, per-machine breadcrumb; would otherwise churn).
// ──────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

// Repo root derived from THIS script's location (<repo>/.claude/hooks/) — never a
// hardcoded machine path. 2026-07-17: was pinned to the desktop's 'C:/SandyStudio'
// checkout, so on any other machine the journal wrote nowhere (the error is
// swallowed by this hook's never-block contract) and paths never relativised.
const REPO_ROOT = path.join(__dirname, '..', '..');
const JOURNAL = path.join(__dirname, '..', 'CHANGES.md');
const MAX_LINES = 500;

function main() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { return; }
  let data = {};
  try { data = JSON.parse(raw || '{}'); } catch { return; }

  const tool = data.tool_name || '?';
  const fp = (data.tool_input && (data.tool_input.file_path || data.tool_input.notebook_path)) || '';
  if (!fp) return;

  const norm = String(fp).replace(/\\/g, '/');
  // Skip noise: the journal itself, deps/build/scratch/temp.
  if (norm.endsWith('/CHANGES.md')) return;
  if (/\/(node_modules|\.next|\.git|scratchpad)\//i.test(norm) || /\/Temp\//i.test(norm)) return;

  // Relativise to repo root when possible.
  let rel = norm;
  const root = REPO_ROOT.replace(/\\/g, '/').replace(/\/?$/, '/');
  if (norm.toLowerCase().startsWith(root.toLowerCase())) rel = norm.slice(root.length);

  const sid = String(data.session_id || '').slice(0, 8) || '--------';
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const line = `- ${ts} | ${sid} | ${tool} | ${rel}`;

  try {
    let existing = '';
    try { existing = fs.readFileSync(JOURNAL, 'utf8'); } catch { /* new file */ }
    if (!existing) {
      existing =
        '# SandyStudio — CHANGES journal\n\n' +
        '> Durable, append-only log of file changes (PostToolUse Write|Edit hook).\n' +
        '> **Survives `/clear`:** context is wiped, this disk file is not. Read it after a\n' +
        '> clear to recover what changed and which durable files hold the substance.\n' +
        `> Auto-capped to the last ${MAX_LINES} entries. Local, git-ignored.\n\n`;
    }
    let out = existing + line + '\n';

    // Cap: keep the header + only the last MAX_LINES entry lines.
    const lines = out.split('\n');
    const entryIdxs = [];
    for (let i = 0; i < lines.length; i++) if (lines[i].startsWith('- ')) entryIdxs.push(i);
    if (entryIdxs.length > MAX_LINES) {
      const headerEnd = entryIdxs[0];
      const firstKeep = entryIdxs[entryIdxs.length - MAX_LINES];
      out = lines.slice(0, headerEnd).join('\n') + '\n' + lines.slice(firstKeep).join('\n');
    }
    fs.writeFileSync(JOURNAL, out);
  } catch { /* never block */ }
}
try { main(); } catch { /* swallow */ }
process.exit(0);
