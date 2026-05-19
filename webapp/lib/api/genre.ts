// ──────────────────────────────────────────────────────────────────────────────
// lib/api/genre.ts
// Genre-matching helpers. Used by GAGAD chain to fire only on comedy-like
// series, by future emotion-specialist for drama/doc, etc. Designed for
// extension via const list (no migrations needed when a finer subdivision
// appears).
//
// Sprint «Дизайнер и Аниматор» Day 11+ — Тео, 2026-05-19. Director's q-genre-a
// directive: keep the helper extensible so adding 'comedy_situational' or
// 'slapstick' to the comedy family is a single-line change.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Series genres that are considered "comedy-like" — i.e. should trigger the
 * Gag Assistant Director (EXEC-GAGAD) chain. Extend this list when the
 * `series.genre` enum grows. Today the enum allows only `'comedy'`; future
 * options like `'comedy_situational'` or `'slapstick'` would join here.
 */
export const COMEDY_LIKE_GENRES = ['comedy'] as const;

/**
 * Match a series.genre string against the comedy-like family.
 *
 * @example
 *   isComedyLikeGenre('comedy')     // true
 *   isComedyLikeGenre('drama')      // false
 *   isComedyLikeGenre(null)         // false
 *   isComedyLikeGenre(undefined)    // false
 *   isComedyLikeGenre('Comedy')     // false (case-sensitive — enum stores lowercase)
 */
export function isComedyLikeGenre(
  g: string | null | undefined,
): boolean {
  if (typeof g !== 'string') return false;
  return (COMEDY_LIKE_GENRES as readonly string[]).includes(g);
}
