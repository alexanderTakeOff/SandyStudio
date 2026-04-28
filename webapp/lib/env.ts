// ──────────────────────────────────────────────────────────────────────────────
// lib/env.ts
// Centralised env access per CLAUDE.md §11 — ENV FIRST + FAIL FAST.
//
// IMPORTANT: NEXT_PUBLIC_* vars must be referenced via *literal property*
// access (`process.env.NEXT_PUBLIC_FOO`) so Next.js / webpack can inline them
// into the browser bundle at build time. Dynamic indexed access
// (`process.env[name]`) is NOT replaced and breaks at runtime in the client.
// ──────────────────────────────────────────────────────────────────────────────

function ensure(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `[env] Missing required environment variable: ${name}. ` +
        `See .env.example for the complete list. If you just edited .env.local, ` +
        `restart \`npm run dev\` so Next.js re-reads the file.`,
    );
  }
  return value.trim();
}

function optional(value: string | undefined): string | undefined {
  if (!value || value.trim() === '') return undefined;
  return value.trim();
}

// Public (browser-exposed) Supabase config. Safe to ship to the client.
// Literal property access so the values are inlined into the browser bundle.
export const PUBLIC_ENV = {
  SUPABASE_URL: ensure('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  SUPABASE_ANON_KEY: ensure(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  APP_URL: ensure('NEXT_PUBLIC_APP_URL', process.env.NEXT_PUBLIC_APP_URL),
} as const;

// Server-only secrets. NEVER import from a `'use client'` file.
// Server runtime can use dynamic access, but literal access works everywhere
// and keeps the pattern consistent.
export function getServerEnv() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: ensure(
      'SUPABASE_SERVICE_ROLE_KEY',
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    // Concierge LLM — primary provider is OpenAI (Director's account).
    OPENAI_API_KEY: optional(process.env.OPENAI_API_KEY),
    OPENAI_MODEL: optional(process.env.OPENAI_MODEL),
    OPENAI_MAX_OUTPUT_TOKENS: optional(process.env.OPENAI_MAX_OUTPUT_TOKENS),
    OPENAI_REASONING_EFFORT: optional(process.env.OPENAI_REASONING_EFFORT),
    OPENAI_TEMPERATURE: optional(process.env.OPENAI_TEMPERATURE),
    // Optional Anthropic fallback (kept for future cost-routing).
    ANTHROPIC_API_KEY: optional(process.env.ANTHROPIC_API_KEY),
    INNGEST_EVENT_KEY: optional(process.env.INNGEST_EVENT_KEY),
    INNGEST_SIGNING_KEY: optional(process.env.INNGEST_SIGNING_KEY),
  } as const;
}
