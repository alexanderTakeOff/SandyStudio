// ──────────────────────────────────────────────────────────────────────────────
// lib/api/auth.ts
// Director-only auth guard for API routes. Defence-in-depth on top of RLS:
// returns clean 401 before any DB query, gives a single audit hook.
//
// Per webapp.md §2.1 + auth.md §1: SandyStudio has a single Director
// principal. Any authenticated user is treated as the Director. If the
// product later supports multi-user, this guard is the place to widen.
//
// q9 (2026-06-09): EXEC-DIR-AI service token. In bold governance modes (3/4)
// Polina's auto-react fires mutating tools server-to-server with NO Director
// cookie. Those tools hit Director-only routes (e.g. /api/episodes/[id]/trigger,
// /api/assets/[id]/approve), which would 401 without a session. The
// `EXEC_DIR_AI_TOKEN` bearer is accepted here as Director-EQUIVALENT authority
// and resolves to a SYNTHETIC EXEC-DIR-AI principal. It is intentionally NOT a
// full Director: HARD-LIMIT routes (mode / governance-mode / budget / Bible
// LOCK / publish) MUST call `assertHumanDirector()` to reject it (CLAUDE.md §6
// — hard limits are human-Director-only in every mode).
// ──────────────────────────────────────────────────────────────────────────────

import { headers } from 'next/headers';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types.gen';
import { timingSafeEqual } from 'node:crypto';
import { ForbiddenError, UnauthorizedError } from './errors';

/**
 * Constant-time bearer-token comparison. Length is compared first (cheap and
 * not secret — token lengths are fixed by config), then the bytes via
 * `timingSafeEqual` so a presented token can't be recovered by timing the
 * response. Returns false on any length mismatch or empty input.
 */
function tokensMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// `SupabaseClient<Database>` — single generic. All other generics in
// supabase-js v2.105 derive from Database via defaults, including the
// schema lookup that handles the `__InternalSupabase` key in types.gen.ts.
// This unifies behaviour across @supabase/ssr 0.5 and supabase-js 2.105+.
export type ServerSupabaseClient = SupabaseClient<Database>;

/** Who satisfied the auth guard — a real human Director or the EXEC-DIR-AI service token. */
export type DirectorPrincipal = 'director' | 'exec_dir_ai';

/**
 * Stable synthetic id used for the EXEC-DIR-AI service principal in audit
 * trails (activity_events.actor, approvals.notes). It is NOT a real auth.users
 * row — it only labels actions the service token authorised so provenance is
 * never silently attributed to a human.
 */
export const EXEC_DIR_AI_ACTOR_ID = 'exec-dir-ai';

export interface DirectorContext {
  user: User;
  supabase: ServerSupabaseClient;
  /**
   * Which principal satisfied the guard. 'director' for a real human session;
   * 'exec_dir_ai' when the EXEC_DIR_AI_TOKEN bearer was accepted. Hard-limit
   * routes must reject 'exec_dir_ai' via assertHumanDirector().
   */
  principal: DirectorPrincipal;
}

/** Read the Bearer token from the incoming request headers, or null. */
async function readBearerToken(): Promise<string | null> {
  try {
    const h = await headers();
    const raw = h.get('authorization') ?? h.get('Authorization');
    if (!raw) return null;
    const m = /^Bearer\s+(.+)$/i.exec(raw);
    return m ? m[1].trim() : null;
  } catch {
    // headers() unavailable outside a request scope — treat as no token.
    return null;
  }
}

/**
 * Build the synthetic EXEC-DIR-AI Director context (service-role supabase so
 * RLS-free mutations succeed without a human session). Used only when the
 * EXEC_DIR_AI_TOKEN bearer matched.
 */
function execDirAiContext(): DirectorContext {
  const supabase = createSupabaseServiceRoleClient() as unknown as ServerSupabaseClient;
  // Minimal synthetic User — enough for `user.id` / `user.email` audit reads.
  const user = {
    id: EXEC_DIR_AI_ACTOR_ID,
    email: 'exec-dir-ai@sandystudio.local',
    app_metadata: { provider: 'exec_dir_ai_token' },
    user_metadata: {},
    aud: 'exec_dir_ai',
    created_at: new Date(0).toISOString(),
  } as unknown as User;
  return { user, supabase, principal: 'exec_dir_ai' };
}

/**
 * Resolve the current Director session or throw 401.
 * Use at the top of every route handler that mutates or reads private data.
 *
 * Accepts either a real Director cookie session OR the EXEC_DIR_AI_TOKEN
 * bearer (q9). The returned `principal` discriminates the two; hard-limit
 * routes must additionally call assertHumanDirector() to refuse the token.
 */
export async function requireDirector(): Promise<DirectorContext> {
  // q9: EXEC-DIR-AI service-token path. Checked first because auto-react has
  // no cookie session — getUser() would 401 before the token is seen.
  const expectedServiceToken = process.env.EXEC_DIR_AI_TOKEN?.trim();
  if (expectedServiceToken) {
    const presented = await readBearerToken();
    if (presented && tokensMatch(presented, expectedServiceToken)) {
      return execDirAiContext();
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new UnauthorizedError(
      error?.message ?? 'Director session required for this endpoint',
    );
  }
  return {
    user: data.user,
    // ssr 0.5 returns the older 3-generic SupabaseClient; cast to the
    // canonical 1-generic alias so call sites get the same surface.
    supabase: supabase as unknown as ServerSupabaseClient,
    principal: 'director',
  };
}

/**
 * Guard for HARD-LIMIT routes (publish · LOCKED · budget · mode change per
 * CLAUDE.md §6). Rejects the EXEC-DIR-AI service token — these actions are
 * human-Director-only in every governance mode. Call right after
 * requireDirector() in any route that performs a hard limit.
 */
export function assertHumanDirector(ctx: Pick<DirectorContext, 'principal'>): void {
  if (ctx.principal !== 'director') {
    throw new ForbiddenError(
      'This is a hard-limit action (Publish / LOCKED / Budget / Mode per CLAUDE.md §6) — ' +
        'only the human Director may perform it. The EXEC-DIR-AI service token is not authorised.',
    );
  }
}

/**
 * Variant for endpoints that may also accept EXEC-DIR-AI in Mode 2/3
 * (e.g. /api/episodes/[id]/trigger). Returns the principal kind so the
 * route can branch on `directorOrAi.kind`.
 *
 * q9: now genuinely forwards the service-token principal (Phase 8 token).
 */
export async function requireDirectorOrExecAi(): Promise<DirectorContext & { kind: DirectorPrincipal }> {
  const ctx = await requireDirector();
  return { ...ctx, kind: ctx.principal };
}
