// ──────────────────────────────────────────────────────────────────────────────
// lib/supabase/middleware.ts
// Helper used by the root middleware.ts to refresh the Supabase session on
// every request. Required by @supabase/ssr to keep cookies valid.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { PUBLIC_ENV } from '@/lib/env';
import type { Database } from '@/lib/supabase/types.gen';

export async function updateSupabaseSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    PUBLIC_ENV.SUPABASE_URL,
    PUBLIC_ENV.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: getUser() refreshes the session if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user };
}
