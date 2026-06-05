// ──────────────────────────────────────────────────────────────────────────────
// lib/api/asset-filter.ts
// Build a PostgREST `.or(...)` expression that matches assets whose `file_type`
// starts with any of a comma-separated prefix list. Used by GET /api/assets so
// callers can fetch ONLY their category (e.g. IMG references) server-side instead
// of pulling all asset types and filtering on the client — which silently
// truncated older rows once an episode exceeded the 200-row list cap.
//
// SECURITY: `.or()` takes a RAW, non-parameterized filter string, so any `,`/`)`
// in the value would break out of the expression. The whitelist below rejects
// every metacharacter; the trailing `%` is always appended here, never taken
// from input.
// ──────────────────────────────────────────────────────────────────────────────

const PREFIX_WHITELIST = /^[A-Za-z0-9_-]+$/;

/**
 * Convert a comma-separated prefix list into a PostgREST `.or()` expression of
 * case-insensitive prefix matches, e.g.
 *   "IMG-episode_ref,IMG-anchor"
 *     → "file_type.ilike.IMG-episode_ref%,file_type.ilike.IMG-anchor%"
 * Returns null when no valid prefix remains (caller then skips the `.or()`).
 */
export function buildFileTypePrefixOr(value: string): string | null {
  const prefixes = value
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && PREFIX_WHITELIST.test(p));
  if (prefixes.length === 0) return null;
  return prefixes.map((p) => `file_type.ilike.${p}%`).join(',');
}
