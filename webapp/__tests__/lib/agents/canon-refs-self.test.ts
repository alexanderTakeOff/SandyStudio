// D9 (2026-07-30) — an entry may declare ITSELF as a reference.
//
// Default stays as it was: the asset being generated is never attached, because
// a re-roll anchored on the version it replaces compounds its own drift. But the
// Director asked for the opposite on the S20 interior — «take that frame, drop
// what is extra, move the joystick, keep the composition» — and composition only
// survives if it arrives as pixels. Declaring the entry on its own `Refs:` line
// is that request, so for that one row the exclusion AND the LOCKED/APPROVED
// filter lift: the frame being edited is by definition the entry's own draft.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/media-cache', () => ({
  readAssetMediaAsBase64: vi.fn(async () => 'BASE64'),
}));

import { loadSeriesCanonRefs } from '@/lib/agents/series-canon-refs';

const SERIES = '42f14df0-d1a2-4bb7-b7df-8f1819fac6a7';
const INTERIOR_ID = 'd14bb17b-0519-420d-82d9-0b074a303a04';
const HERO_ID = '7a6b2452-a9ef-49cb-8f0e-efe57d0a3143';
const STYLE_ID = '10916888-232e-49b0-aed8-2a1fee90be62';

interface Row {
  id: string;
  filename: string | null;
  file_type: string;
  status: string;
  staging_path: string | null;
  drive_file_id: string | null;
}

function row(id: string, fileType: string, status: string): Row {
  return { id, filename: `${fileType}.png`, file_type: fileType, status, staging_path: null, drive_file_id: 'drive' };
}

/** LOCKED canon the status-filtered list query would return. */
const LOCKED_ROWS: Row[] = [
  row(HERO_ID, 'SBL-character_bathyscaphe_turnaround', 'LOCKED'),
  row(STYLE_ID, 'SBL-style_s20_style_canon_v1', 'LOCKED'),
];

/** The DRAFT interior — invisible to the list query, reachable only by id. */
const INTERIOR_ROW = row(INTERIOR_ID, 'SBL-location_bathyscaphe_interior', 'DRAFT');

/**
 * The list query is status-filtered, so `listRows` stands for LOCKED/APPROVED
 * canon only. `table` is every row that exists, reachable by id — that is the
 * one door the self-reference goes through, and the mock has to honour WHICH id
 * was asked for: an earlier version of this stub returned the interior for any
 * id and turned a passing assertion into a lie.
 */
function makeSupabase(listRows: Row[], table: Row[]) {
  const chain: Record<string, unknown> = {};
  let askedId: string | null = null;
  Object.assign(chain, {
    select: () => chain,
    eq: (col: string, val: string) => {
      if (col === 'id') askedId = val;
      return chain;
    },
    in: () => chain,
    like: () => chain,
    order: () => chain,
    maybeSingle: async () => ({ data: table.find((r) => r.id === askedId) ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: listRows, error: null }).then(resolve),
  });
  return { from: () => chain } as never;
}

const ALL_ROWS: Row[] = [...LOCKED_ROWS, INTERIOR_ROW];

describe('loadSeriesCanonRefs — declaring the entry itself', () => {
  it('attaches the entry own DRAFT frame when its slug is declared, first in order', async () => {
    const { refs, halt, dropped } = await loadSeriesCanonRefs(
      makeSupabase(LOCKED_ROWS, ALL_ROWS),
      {
        seriesId: SERIES,
        excludeAssetId: INTERIOR_ID,
        refSlugs: ['location_bathyscaphe_interior', 'character_bathyscaphe_turnaround'],
      },
    );

    expect(halt).toBeNull();
    expect(dropped).toEqual([]);
    expect(refs.map((r) => r.bible_asset_id)).toEqual([INTERIOR_ID, HERO_ID, STYLE_ID]);
    expect(refs[0]?.kind).toBe('location');
  });

  it('accepts the bare slug form too', async () => {
    const { refs } = await loadSeriesCanonRefs(makeSupabase(LOCKED_ROWS, ALL_ROWS), {
      seriesId: SERIES,
      excludeAssetId: INTERIOR_ID,
      refSlugs: ['bathyscaphe_interior'],
    });

    expect(refs.map((r) => r.bible_asset_id)).toEqual([INTERIOR_ID, STYLE_ID]);
  });

  it('does NOT attach the entry to itself when nothing is declared', async () => {
    const { refs, halt } = await loadSeriesCanonRefs(makeSupabase(LOCKED_ROWS, ALL_ROWS), {
      seriesId: SERIES,
      excludeAssetId: INTERIOR_ID,
      refSlugs: [],
    });

    expect(halt).toBeNull();
    // The style anchor alone — the deliberate default, unchanged by D9.
    expect(refs.map((r) => r.bible_asset_id)).toEqual([STYLE_ID]);
  });

  it('does NOT attach a DIFFERENT entry that is merely declared and unpublished', async () => {
    // The lift is for the row being generated, not for drafts in general: a
    // declared slug that resolves to nothing still HALTs before any spend.
    const { refs, halt } = await loadSeriesCanonRefs(makeSupabase(LOCKED_ROWS, ALL_ROWS), {
      seriesId: SERIES,
      excludeAssetId: HERO_ID,
      refSlugs: ['location_bathyscaphe_interior'],
    });

    expect(refs.map((r) => r.bible_asset_id)).toEqual([STYLE_ID]);
    expect(halt).toContain('location_bathyscaphe_interior');
  });
});
