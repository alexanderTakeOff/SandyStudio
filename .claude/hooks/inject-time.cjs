#!/usr/bin/env node
// UserPromptSubmit — inject the current LOCAL wall-clock time into context.
// Director directive 2026-07-24: Тео kept guessing/fabricating the HH:MM prefix
// (and `TZ='Asia/Dubai' date` silently returns UTC on Windows Git Bash — no
// zoneinfo). The machine is already on Dubai time, so plain local time is
// correct. Stdout of this hook lands in context (~10 tokens/turn) — the model
// reads it instead of guessing. Never blocks, never fails the prompt.
'use strict';
try {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  process.stdout.write(`[now: ${hh}:${mm} Dubai]`);
} catch (_) {
  /* silent — a missing timestamp must never break the prompt */
}
process.exit(0);
