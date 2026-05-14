// ──────────────────────────────────────────────────────────────────────────────
// lib/api/filename-status.ts
// Keep `assets.filename` in sync with `assets.status` per CLAUDE.md §3.
//
// Filename CHECK constraint (migration 0002):
//   ...-vNN-(DRAFT|REVIEW|REVISION|APPROVED|LOCKED).ext
//
// Asset status enum (migration 0001) is wider — REJECTED, INVALIDATED,
// NEEDS_HUMAN_TWEAK, TEST also exist but cannot appear in the filename.
// For those statuses we leave the filename unchanged.
// ──────────────────────────────────────────────────────────────────────────────

/** Asset statuses that have a canonical filename suffix per CLAUDE.md §3. */
const FILENAME_STATUSES = new Set(['DRAFT', 'REVIEW', 'REVISION', 'APPROVED', 'LOCKED']);

const SUFFIX_PATTERN = /-(DRAFT|REVIEW|REVISION|APPROVED|LOCKED)(\.[a-z0-9]+)$/i;

/**
 * Return a filename with its status suffix replaced to match the new status.
 * Returns `null` when:
 *   - the status has no filename representation (REJECTED, INVALIDATED, …);
 *   - the current filename doesn't have a recognised suffix (e.g. malformed
 *     legacy filenames — leave them alone, surface via a separate audit).
 */
export function filenameForStatus(filename: string, status: string): string | null {
  if (!FILENAME_STATUSES.has(status)) return null;
  if (!SUFFIX_PATTERN.test(filename)) return null;
  return filename.replace(SUFFIX_PATTERN, `-${status}$2`);
}
