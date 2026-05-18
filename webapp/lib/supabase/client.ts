// ──────────────────────────────────────────────────────────────────────────────
// lib/supabase/client.ts
// Browser-side Supabase client (uses anon key + cookie-based session).
// Per webapp.md §9 + auth.md §1 — anon key only on the client.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_ENV } from '@/lib/env';
import type { Database } from '@/lib/supabase/types.gen';

// Module-level singleton to prevent the WebSocket / channel leak that crashed
// `next dev --turbopack` after a few hours of HMR (2026-05-13 audit). Each
// `createBrowserClient` call opens a new Realtime WebSocket; HMR remounts +
// React StrictMode double-mount caused those to accumulate without cleanup
// and the dev server eventually hit multi-GB heap and stopped responding.
let cachedClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createSupabaseBrowserClient() {
  if (cachedClient) return cachedClient;
  cachedClient = createBrowserClient<Database>(
    PUBLIC_ENV.SUPABASE_URL,
    PUBLIC_ENV.SUPABASE_ANON_KEY,
  );
  return cachedClient;
}
