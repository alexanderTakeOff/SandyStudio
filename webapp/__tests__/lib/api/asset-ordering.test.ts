// ──────────────────────────────────────────────────────────────────────────────
// Tests for the shared display comparator in lib/api/asset-ordering.ts.
//
// Locks the "never reposition, mark" rule (Director 2026-07-18). The candidate
// strips used to pull the current / APPROVED tile to the front; because the
// shipped attempt is chosen by quality (pickBestAttempt), that tile sat in a
// different position for every shot and the strips read as noise.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import {
  compareAssetVersionsNewestFirst,
  type VersionedAssetLike,
} from '@/lib/api/asset-ordering';

interface Row extends VersionedAssetLike {
  id: string;
  status?: string;
}

const row = (id: string, version: number, created_at: string, status = 'DRAFT'): Row => ({
  id,
  version,
  created_at,
  status,
});

describe('compareAssetVersionsNewestFirst', () => {
  it('orders newest version leftmost', () => {
    const rows: Row[] = [
      row('a', 1, '2026-07-01T00:00:00Z'),
      row('c', 3, '2026-07-03T00:00:00Z'),
      row('b', 2, '2026-07-02T00:00:00Z'),
    ];
    expect(rows.slice().sort(compareAssetVersionsNewestFirst).map((r) => r.id)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it('breaks version ties by created_at desc so differently-ordered inputs agree', () => {
    // The two APIs feeding these strips order by created_at in OPPOSITE
    // directions (/api/assets desc, /api/episodes/[id] asc). A stable sort
    // alone therefore rendered equal-version rows in opposite order on the two
    // surfaces; the tiebreak makes the result independent of input order.
    const ascInput: Row[] = [
      row('older', 2, '2026-07-01T00:00:00Z'),
      row('newer', 2, '2026-07-02T00:00:00Z'),
    ];
    const descInput = ascInput.slice().reverse();

    const fromAsc = ascInput.slice().sort(compareAssetVersionsNewestFirst).map((r) => r.id);
    const fromDesc = descInput.slice().sort(compareAssetVersionsNewestFirst).map((r) => r.id);

    expect(fromAsc).toEqual(['newer', 'older']);
    expect(fromDesc).toEqual(fromAsc);
  });

  it('IGNORES status — an APPROVED row is not pulled to the front', () => {
    const rows: Row[] = [
      row('draft-v3', 3, '2026-07-03T00:00:00Z', 'DRAFT'),
      row('approved-v1', 1, '2026-07-01T00:00:00Z', 'APPROVED'),
    ];
    // Order is by version alone; APPROVED stays where its version puts it. The
    // UI marks it in place instead of moving it.
    expect(rows.slice().sort(compareAssetVersionsNewestFirst).map((r) => r.id)).toEqual([
      'draft-v3',
      'approved-v1',
    ]);
  });

  it('is position-stable when a different tile becomes selected', () => {
    // The whole point: selection must not change layout. The comparator has no
    // access to "which is current", so ordering is identical either way.
    const rows: Row[] = [
      row('v1', 1, '2026-07-01T00:00:00Z'),
      row('v2', 2, '2026-07-02T00:00:00Z'),
      row('v3', 3, '2026-07-03T00:00:00Z'),
    ];
    const before = rows.slice().sort(compareAssetVersionsNewestFirst).map((r) => r.id);
    const after = rows
      .slice()
      .reverse() // simulate a re-fetch arriving in another order
      .sort(compareAssetVersionsNewestFirst)
      .map((r) => r.id);
    expect(after).toEqual(before);
  });

  it('tolerates missing version / created_at', () => {
    const rows: Row[] = [
      { id: 'none' },
      row('v2', 2, '2026-07-02T00:00:00Z'),
      { id: 'no-date', version: 5 },
    ];
    expect(rows.slice().sort(compareAssetVersionsNewestFirst).map((r) => r.id)).toEqual([
      'no-date',
      'v2',
      'none',
    ]);
  });
});
