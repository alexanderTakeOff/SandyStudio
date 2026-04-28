// ──────────────────────────────────────────────────────────────────────────────
// lib/supabase/client.ts
// Browser-side Supabase client (uses anon key + cookie-based session).
// Per webapp.md §9 + auth.md §1 — anon key only on the client.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_ENV } from '@/lib/env';
import type { Database } from '@/lib/supabase/types.gen';

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    PUBLIC_ENV.SUPABASE_URL,
    PUBLIC_ENV.SUPABASE_ANON_KEY,
  );
}
