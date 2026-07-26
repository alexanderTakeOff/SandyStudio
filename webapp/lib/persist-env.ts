// ──────────────────────────────────────────────────────────────────────────────
// lib/persist-env.ts
// Replace-or-append ONE key in webapp/.env.local, never touching other keys,
// AND stamp process.env so the RUNNING app sees the new value immediately — no
// stack restart. Extracted from google-consent.ts persistChannelToken (Phase 4e)
// so the Storage panel (MEDIA_CACHE_DIR) reuses the same write path.
//
// Callers own the env-var-name whitelist — this helper only does the write.
// ──────────────────────────────────────────────────────────────────────────────

import * as fs from 'node:fs';
import * as path from 'node:path';

export function persistEnvValue(envVar: string, value: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(envVar)) {
    throw new Error(`refusing to write malformed env var name: ${envVar}`);
  }
  if (/[\r\n]/.test(value)) {
    throw new Error(`refusing to write multi-line value for ${envVar}`);
  }
  const envPath = path.resolve(process.cwd(), '.env.local');
  let raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const linePattern = new RegExp(`^${envVar}=.*$`, 'm');
  raw = linePattern.test(raw)
    ? raw.replace(linePattern, `${envVar}=${value}`)
    : raw.replace(/\s*$/, '') + `\n${envVar}=${value}\n`;
  fs.writeFileSync(envPath, raw);
  process.env[envVar] = value;
}
