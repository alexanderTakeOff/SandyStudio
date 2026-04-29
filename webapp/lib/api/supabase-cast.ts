// ──────────────────────────────────────────────────────────────────────────────
// lib/api/supabase-cast.ts
// Helpers that work around the typed Database not yet including:
//   - new tables added by migration 0010 (`series`, `approval_authority_matrix`)
//   - JSON-typed columns where we want to insert plain object structures
//
// Once Director pushes 0010 and `npm run gen:types` regenerates types.gen.ts,
// the table casts can be replaced with typed access. JSON casts will remain
// unless the schema generator improves.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

/**
 * Get a builder for tables not yet in the generated types.
 * Use ONLY for `series` and `approval_authority_matrix`.
 * Other tables should use the typed `supabase.from('...')` directly.
 */
export function from5b(
  supabase: SupabaseClient,
  table: 'series' | 'approval_authority_matrix',
) {
  return (supabase as unknown as AnyClient).from(table);
}

/**
 * Cast a plain JSON-shaped value to the type Supabase expects for `Json`
 * columns. Avoids spreading `as never` everywhere and centralises the
 * work-around in a clearly named utility.
 */
export function asJson<T>(v: T): never {
  return v as unknown as never;
}
