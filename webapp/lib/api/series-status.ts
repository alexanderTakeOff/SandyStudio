// ──────────────────────────────────────────────────────────────────────────────
// lib/api/series-status.ts
// Series ACTIVE is a DERIVED property (Director directive 2026-06-02): a series
// is ACTIVE once its general_idea Bible doc (`SBL-general_idea*`) is LOCKED — the
// moment its concept is canonized and it enters production. ARCHIVED stays an
// explicit stored override; DRAFT is the default until the idea locks.
//
// There is NO stored ACTIVE flag, so it cannot drift, needs no backfill, and a
// series reverts to DRAFT automatically if its general idea is unlocked for a new
// version. New series are created (stored) DRAFT; locking the general idea — a
// Director-only act per CLAUDE.md §6 — is what "activates" the series.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

export type EffectiveSeriesStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

/** The set of series ids that have a LOCKED general_idea Bible doc (⇒ ACTIVE). */
export async function seriesWithLockedGeneralIdea(
  supabase: SupabaseClient,
  seriesIds: string[],
): Promise<Set<string>> {
  const ids = seriesIds.filter(Boolean);
  if (ids.length === 0) return new Set();
  const { data } = await supabase
    .from('assets')
    .select('series_id')
    .in('series_id', ids)
    .like('file_type', 'SBL-general_idea%')
    .eq('status', 'LOCKED');
  const rows = (data as Array<{ series_id: string | null }> | null) ?? [];
  return new Set(rows.map((r) => r.series_id).filter((x): x is string => !!x));
}

/** Effective status: ARCHIVED override > derived ACTIVE (locked general_idea) > DRAFT. */
export function effectiveSeriesStatus(
  storedStatus: string | null | undefined,
  hasLockedGeneralIdea: boolean,
): EffectiveSeriesStatus {
  if (storedStatus === 'ARCHIVED') return 'ARCHIVED';
  return hasLockedGeneralIdea ? 'ACTIVE' : 'DRAFT';
}

/**
 * Annotate a batch of series rows with their effective status (one extra query).
 * Returns new rows with `status` replaced by the derived value.
 */
export async function withEffectiveStatus<T extends { id: string; status?: string | null }>(
  supabase: SupabaseClient,
  rows: T[],
): Promise<T[]> {
  const locked = await seriesWithLockedGeneralIdea(supabase, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, status: effectiveSeriesStatus(r.status, locked.has(r.id)) }));
}
