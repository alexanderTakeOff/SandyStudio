// ──────────────────────────────────────────────────────────────────────────────
// inngest/index.ts
// Function registry. Phase 4 adds 11 production-agent functions + 1 cron
// fan-out. Order is presentational only — Inngest dispatches by event name.
// ──────────────────────────────────────────────────────────────────────────────

import { ping } from './functions/ping';
import { execSwWriteScript } from './functions/exec-sw';

export const functions = [
  ping,
  // Phase 4 production agents (added incrementally)
  execSwWriteScript,
];
