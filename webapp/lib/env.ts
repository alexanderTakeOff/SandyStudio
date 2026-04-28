// ──────────────────────────────────────────────────────────────────────────────
// lib/env.ts
// Centralised env access per CLAUDE.md §11 — ENV FIRST + FAIL FAST.
// All env reads go through this module; no `process.env.*` scattered in code.
// ──────────────────────────────────────────────────────────────────────────────

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    // Fail fast per architecture rule #5.
    throw new Error(
      `[env] Missing required environment variable: ${name}. ` +
        `See .env.example for the complete list.`,
    );
  }
  return value.trim();
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

// Public (browser-exposed) Supabase config. Safe to ship to the client.
export const PUBLIC_ENV = {
  SUPABASE_URL: required('NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_ANON_KEY: required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  APP_URL: required('NEXT_PUBLIC_APP_URL'),
} as const;

// Server-only secrets. NEVER import from a `'use client'` file.
export function getServerEnv() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
    ANTHROPIC_API_KEY: optional('ANTHROPIC_API_KEY'),
    INNGEST_EVENT_KEY: optional('INNGEST_EVENT_KEY'),
    INNGEST_SIGNING_KEY: optional('INNGEST_SIGNING_KEY'),
  } as const;
}
