// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/chat-error-envelope.ts
//
// 2026-05-22 — Step 1 of the Supabase recovery sprint. Maps any error
// thrown out of the chat route handler into a structured JSON envelope
// the frontend can render as a clean error message in Polina's bubble.
//
// Why this exists: before this file, an uncaught throw in
// `app/api/concierge/chat/route.ts` let Next.js return its HTML error
// page; ConciergePanel's stream-reader fell through to "append unknown
// line as plain text" and rendered raw <!DOCTYPE html>… inside the
// assistant bubble (exactly what Director saw 2026-05-22 morning).
//
// Lifted out of the route file so it can be exercised by unit tests
// without spinning up a Next.js POST handler.
// ──────────────────────────────────────────────────────────────────────────────

/** Canonical error envelope the chat route returns when a throw is caught. */
export interface ChatErrorEnvelope {
  ok: false;
  error: string;
  detail: string;
  status: number;
}

/**
 * Best-effort PostgrestError shape — we duck-type rather than import
 * the type to avoid coupling to a specific supabase-js version. All
 * fields are checked for presence and string-ness.
 */
interface PostgrestLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  status?: unknown;
}

export function mapChatError(err: unknown): ChatErrorEnvelope {
  const e = err as PostgrestLike | null | undefined;
  const codeRaw = typeof e?.code === 'string' ? e.code : '';
  const messageRaw = typeof e?.message === 'string' ? e.message : '';
  const detailsRaw = typeof e?.details === 'string' ? e.details : '';
  const statusRaw = typeof e?.status === 'number' ? e.status : 0;
  const combined = `${codeRaw} ${messageRaw} ${detailsRaw}`.toLowerCase();

  // exceed_egress_quota / 402 — Supabase project-level restriction.
  if (combined.includes('exceed_egress_quota') || statusRaw === 402) {
    return {
      ok: false,
      error: 'supabase_quota_exceeded',
      detail:
        'Supabase egress quota exceeded for this billing cycle. Check Supabase Dashboard → Usage; data API requests are dropped until quota refills or the project is upgraded.',
      status: 503,
    };
  }
  // Service unavailable (Supabase pause / network).
  if (statusRaw === 503 || combined.includes('service unavailable')) {
    return {
      ok: false,
      error: 'supabase_unavailable',
      detail: `Supabase API unavailable: ${messageRaw || 'unknown'}`,
      status: 503,
    };
  }
  // Auth (RLS / row-level access denied).
  if (statusRaw === 401 || statusRaw === 403) {
    return {
      ok: false,
      error: 'supabase_auth_failed',
      detail: `Supabase auth/authorization failed: ${messageRaw || codeRaw || 'unknown'}`,
      status: 502,
    };
  }
  // PostgrestError generic (has a code like "PGRST..." or 5-char SQLSTATE).
  if (codeRaw.startsWith('PGRST') || /^[0-9A-Z]{5}$/.test(codeRaw)) {
    return {
      ok: false,
      error: 'supabase_request_failed',
      detail: `Supabase request failed (${codeRaw}): ${messageRaw}`,
      status: 502,
    };
  }
  // Plain Error / unknown throw — opaque first-300-char message.
  const fallback =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : 'Unknown error';
  return {
    ok: false,
    error: 'chat_failed',
    detail: fallback.slice(0, 300),
    status: 500,
  };
}
