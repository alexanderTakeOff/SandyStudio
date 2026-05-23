// ──────────────────────────────────────────────────────────────────────────────
// hooks/useAssetNotificationRealtime-core.ts
//
// Pure helpers + the urgent-event-type list. Split out of the main hook
// file so unit tests don't pull the Supabase browser client (which
// requires runtime env vars) through their import graph. Step 4 of the
// 2026-05-22 Supabase recovery sprint.
// ──────────────────────────────────────────────────────────────────────────────

/** Event types the dot considers "Director attention needed". */
export const URGENT_EVENT_TYPES = new Set<string>([
  'canon_extension_proposed',
  'decision_requested',
  'input_requested',
]);

/**
 * Pure predicate — given an INSERT/UPDATE payload's row, decides how the
 * dot count should change.
 *
 *   - +1 when an URGENT event is inserted unresolved
 *   - -1 when an URGENT event updates to resolved
 *   -  0 otherwise (non-urgent type, resolved-at-insert, missing fields)
 */
export function classifyNotificationEvent(payload: {
  event: 'INSERT' | 'UPDATE';
  row: { event_type?: string; resolved_at?: string | null };
}): -1 | 0 | 1 {
  const row = payload.row;
  if (!row || !row.event_type) return 0;
  if (!URGENT_EVENT_TYPES.has(row.event_type)) return 0;
  if (payload.event === 'INSERT') {
    return row.resolved_at ? 0 : 1;
  }
  // UPDATE
  return row.resolved_at ? -1 : 0;
}
