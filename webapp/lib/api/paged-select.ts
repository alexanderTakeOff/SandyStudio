// ──────────────────────────────────────────────────────────────────────────────
// lib/api/paged-select.ts
// Paginated PostgREST select — the ONLY safe way to scan a table that can grow
// past Supabase's `db-max-rows` cap (1000 by default).
//
// Why this exists as a shared helper (2026-07-25): a bare
// `supabase.from('budget_log').select(...)` SILENTLY returns the first 1000 rows
// and no error. `/api/budget` did exactly that, so once the studio's ledger grew
// past 1000 rows the money page froze — early episodes still showed spend (their
// rows are first by insertion order) and every newer episode read $0. Nothing
// logged, nothing threw: the tab just quietly lied about money.
//
// `/api/factory` had already hand-rolled this loop for the same reason. Extracted
// here so there is one implementation and no third route can repeat the bug.
//
// Contract:
//   - `make()` must return a FRESH PostgREST builder on every call (the builder
//     is mutable and cannot be re-ranged), so pass a thunk, not a builder.
//   - Rows are ordered by `orderBy` (default `created_at`) ASC to make paging
//     deterministic. Without a stable order Postgres may repeat/skip rows across
//     ranges.
//   - Loops until a short page arrives, so it always reads the FULL table.
// ──────────────────────────────────────────────────────────────────────────────

/** PostgREST page size. Matches Supabase's default `db-max-rows`. */
export const PAGED_SELECT_PAGE = 1000;

/**
 * Hard stop so a pathological table (or a non-deterministic order) can never
 * spin forever inside a request. 200 pages = 200k rows, far above the studio's
 * real ledger size; hitting it is a bug worth surfacing loudly.
 */
const MAX_PAGES = 200;

export class PagedSelectOverflowError extends Error {
  constructor(rows: number) {
    super(
      `pagedSelect exceeded ${MAX_PAGES} pages (${rows} rows) — refusing to keep ` +
        'scanning. Narrow the query (filter by episode / date) or aggregate in SQL.',
    );
    this.name = 'PagedSelectOverflowError';
  }
}

/**
 * Read EVERY row a query matches, transparently paging past the 1000-row cap.
 *
 * @param make    thunk returning a fresh PostgREST select builder
 * @param orderBy stable column to order by (default `created_at`)
 */
export async function pagedSelect<Row>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  make: () => any,
  orderBy = 'created_at',
): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGED_SELECT_PAGE;
    const { data, error } = await make()
      .order(orderBy, { ascending: true })
      .range(from, from + PAGED_SELECT_PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGED_SELECT_PAGE) return out;
  }
  throw new PagedSelectOverflowError(out.length);
}
