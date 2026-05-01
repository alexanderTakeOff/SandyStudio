import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// ─── env override boot (Windows gotcha) ─────────────────────────────────────
// Next.js loads .env.local but does NOT override existing process.env values.
// On Windows, a stale system-level empty `ANTHROPIC_API_KEY=""` wins over
// .env.local, silently sending production code paths into mock fallback.
//
// Force-load .env.local with override at config time so the rest of the
// build / dev / runtime sees the project's actual keys.
//
// See ~/.claude/projects/C--SandyStudio/memory/node_env_file_does_not_override.md
function loadDotenvOverride(filename: string): void {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  try {
    const text = readFileSync(path, 'utf-8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    // ignore — Next.js will still load .env.local through its default path,
    // we just won't get the override behaviour.
  }
}
loadDotenvOverride('.env.local');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Local-first deployment per webapp.md §2: never deployed to Vercel.
  // Server runs on Director's workstation under PM2 (Phase 8).
  experimental: {
    // Server Actions are enabled by default in Next.js 15.
  },
  // Three.js needs to be transpiled for some legacy CJS interop.
  transpilePackages: ['three'],
};

export default nextConfig;
