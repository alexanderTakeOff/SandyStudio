// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/api/paged-select.test.ts
// Regression guard for the bug that broke the Budget tab: PostgREST silently caps
// an unranged select at 1000 rows and returns NO error, so the money page read
// only the oldest 1000 ledger rows and every newer episode showed $0.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';
import {
  pagedSelect,
  PAGED_SELECT_PAGE,
  PagedSelectOverflowError,
} from '@/lib/api/paged-select';

interface Row {
  id: number;
}

/**
 * Minimal PostgREST-shaped stub: `.order().range(from, to)` resolves to the slice
 * of `rows` in that range, capped at PAGE like the real server.
 */
function fakeTable(rows: Row[]) {
  const range = vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, Math.min(to + 1, from + PAGED_SELECT_PAGE)),
    error: null,
  }));
  const make = () => ({ order: () => ({ range }) });
  return { make, range };
}

const rowsOf = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: i }));

describe('pagedSelect', () => {
  it('reads every row past the 1000-row cap', async () => {
    const { make, range } = fakeTable(rowsOf(2500));
    const out = await pagedSelect<Row>(make);
    expect(out).toHaveLength(2500);
    expect(out[0]!.id).toBe(0);
    expect(out[2499]!.id).toBe(2499);
    // 3 pages: 1000 + 1000 + 500 (the short page ends the loop).
    expect(range).toHaveBeenCalledTimes(3);
  });

  it('stops after one request when the first page is short', async () => {
    const { make, range } = fakeTable(rowsOf(7));
    expect(await pagedSelect<Row>(make)).toHaveLength(7);
    expect(range).toHaveBeenCalledTimes(1);
  });

  it('issues one extra request when the row count is an exact multiple of the page', async () => {
    // A full page is indistinguishable from "there may be more", so it must probe
    // again rather than assume it is done.
    const { make, range } = fakeTable(rowsOf(PAGED_SELECT_PAGE));
    expect(await pagedSelect<Row>(make)).toHaveLength(PAGED_SELECT_PAGE);
    expect(range).toHaveBeenCalledTimes(2);
  });

  it('returns an empty array for an empty table', async () => {
    const { make } = fakeTable([]);
    expect(await pagedSelect<Row>(make)).toEqual([]);
  });

  it('surfaces a query error instead of returning a partial result', async () => {
    const make = () => ({
      order: () => ({ range: async () => ({ data: null, error: { message: 'boom' } }) }),
    });
    await expect(pagedSelect<Row>(make)).rejects.toThrow('boom');
  });

  it('refuses to spin forever when every page comes back full', async () => {
    // A non-deterministic order (or a pathological table) would otherwise loop
    // without end inside a request.
    const make = () => ({
      order: () => ({ range: async () => ({ data: rowsOf(PAGED_SELECT_PAGE), error: null }) }),
    });
    await expect(pagedSelect<Row>(make)).rejects.toThrow(PagedSelectOverflowError);
  });

  it('orders by the requested column so paging is deterministic', async () => {
    const order = vi.fn(() => ({ range: async () => ({ data: [], error: null }) }));
    await pagedSelect<Row>(() => ({ order }), 'cost_usd');
    expect(order).toHaveBeenCalledWith('cost_usd', { ascending: true });
  });
});
