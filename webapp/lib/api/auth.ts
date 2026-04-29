// ──────────────────────────────────────────────────────────────────────────────
// lib/api/auth.ts
// Director-only auth guard for API routes. Defence-in-depth on top of RLS:
// returns clean 401 before any DB query, gives a single audit hook.
//
// Per webapp.md §2.1 + auth.md §1: SandyStudio has a single Director
// principal. Any authenticated user is treated as the Director. If the
// product later supports multi-user, this guard is the place to widen.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types.gen';
import { UnauthorizedError } from './errors';

// Re-export the concrete client shape as returned by `createServerClient<Database>`.
// All three generics specified explicitly so the type matches what
// @supabase/ssr 0.5 actually returns (Database, schema-name, schema-object).
export type ServerSupabaseClient = SupabaseClient<Database, 'public', Database['public']>;

export interface DirectorContext {
  user: User;
  supabase: ServerSupabaseClient;
}

/**
 * Resolve the current Director session or throw 401.
 * Use at the top of every route handler that mutates or reads private data.
 */
export async function requireDirector(): Promise<DirectorContext> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new UnauthorizedError(
      error?.message ?? 'Director session required for this endpoint',
    );
  }
  return { user: data.user, supabase };
}

/**
 * Variant for endpoints that may also accept EXEC-DIR-AI in Mode 2/3
 * (e.g. /api/episodes/[id]/trigger). Returns the principal kind so the
 * route can branch on `directorOrAi.kind`.
 *
 * Phase 5b: EXEC-DIR-AI does NOT have its own auth credential yet. It is
 * always an internal Inngest call. For HTTP we still require Director.
 * The kind discriminator is forward-compatible — Phase 8 may issue a
 * service token for EXEC-DIR-AI to call this route directly.
 */
export async function requireDirectorOrExecAi(): Promise<DirectorContext & { kind: 'director' | 'exec_dir_ai' }> {
  const { user, supabase } = await requireDirector();
  return { user, supabase, kind: 'director' };
}
