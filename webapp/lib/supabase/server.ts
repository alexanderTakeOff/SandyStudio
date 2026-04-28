// ──────────────────────────────────────────────────────────────────────────────
// lib/supabase/server.ts
// Server-side Supabase clients per webapp.md §9 + auth.md §1.
//   - createSupabaseServerClient(): user-context client for Server Components,
//     Server Actions, and Route Handlers. Uses anon key + the request cookies
//     so RLS is enforced as the authenticated Director.
//   - createSupabaseServiceRoleClient(): bypasses RLS. ONLY for Inngest jobs
//     and trusted server-side maintenance. Never expose to the client.
// ──────────────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_ENV, getServerEnv } from '@/lib/env';
import type { Database } from '@/lib/supabase/types.gen';

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * User-context server client. RLS applies as the signed-in Director.
 * Cookies are read/written via Next.js `cookies()` so the session refreshes
 * across requests.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    PUBLIC_ENV.SUPABASE_URL,
    PUBLIC_ENV.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. The middleware refreshes
            // sessions instead — this catch silently allows that pattern.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS. NEVER ship to the browser.
 * Used by Inngest job handlers and server-side maintenance tasks only.
 */
export function createSupabaseServiceRoleClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  return createClient<Database>(PUBLIC_ENV.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
