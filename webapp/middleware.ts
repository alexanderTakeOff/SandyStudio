// ──────────────────────────────────────────────────────────────────────────────
// middleware.ts (root)
// Refreshes Supabase session cookies and gates studio routes behind auth.
// Per webapp.md §9 + auth.md §1 — single Director principal.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server';
import { updateSupabaseSession } from '@/lib/supabase/middleware';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/health'];

// Server-to-server webhook endpoints — auth handled by upstream signature
// verification (Inngest signing key) or Bearer token, NOT by Supabase user
// session. Sprint α 2026-05-14: added /api/team-chat/* for CLI agent posts.
// TD-20.B 2026-05-20: added /api/concierge/chat-internal for the Inngest
// exec-pa-react function (PA_INTERNAL_TOKEN Bearer).
const WEBHOOK_PATHS = ['/api/inngest', '/api/team-chat', '/api/concierge/chat-internal'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Webhooks bypass session refresh and auth-redirect entirely. Without this
  // bypass, Inngest's PUT /api/inngest sync requests get 307'd to /login,
  // creating an infinite registration loop and spamming the dev server.
  if (WEBHOOK_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request });
  }

  const { supabaseResponse, user } = await updateSupabaseSession(request);

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Unauthenticated → redirect to /login (except for public paths).
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated user hitting /login → redirect to /.
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.delete('next');
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Run on every path except static assets, image optimisation, and favicons.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
