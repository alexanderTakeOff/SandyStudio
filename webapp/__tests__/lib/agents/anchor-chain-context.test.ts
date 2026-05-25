// TD-49 Phase 2 P2.2 — loadAnchorChainContext tests.
//
// Validates the shot-scoped helper that surfaces full_storyboard,
// adjacent_shots, prior_anchors, and scene_master_asset to Designer / Animator
// authoring runs. Uses an inline supabase mock so the test is hermetic.

import { describe, expect, test } from 'vitest';
import { loadAnchorChainContext } from '@/lib/agents/runner';

const EPISODE_ID = 'episode-uuid';
const SERIES_ID = 'series-uuid';

const STB_CONTENT = [
  '# Storyboard SS-S15-E01',
  '',
  '```json',
  JSON.stringify({
    acts: [
      {
        act: 1,
        shots: [
          {
            shot_id: 'SS-S15-E01-A1-SC01-SH01',
            shot_role: 'establishing',
            duration_seconds: 4,
            action_prose: 'Sandy enters bedroom.',
            location: { slug: 'sandy_bedroom_continuity' },
            characters: [{ bible_slug: 'sandy' }],
          },
          {
            shot_id: 'SS-S15-E01-A1-SC01-SH02',
            shot_role: 'reaction',
            duration_seconds: 3,
            action_prose: 'Sandy sees mirror.',
            location: { slug: 'sandy_bedroom_continuity' },
            characters: [{ bible_slug: 'sandy' }],
          },
          {
            shot_id: 'SS-S15-E01-A1-SC01-SH03',
            shot_role: 'action',
            duration_seconds: 5,
            action_prose: 'Sandy approaches mirror.',
            location: { slug: 'sandy_bedroom_continuity' },
            characters: [{ bible_slug: 'sandy' }],
          },
        ],
      },
    ],
  }),
  '```',
].join('\n');

interface Row {
  id: string;
  file_type?: string | null;
  filename?: string;
  status?: string;
  content?: string;
  version?: number;
  series_id?: string | null;
  episode_id?: string | null;
}

interface MockQuery {
  table: string;
  filters: Array<{ kind: 'eq' | 'like' | 'in'; field: string; value: unknown }>;
  ordering: { field: string; ascending: boolean } | null;
  limit: number | null;
}

function makeSupabaseMock(rowsByTable: Record<string, Row[]>) {
  return {
    from(table: string) {
      const q: MockQuery = {
        table,
        filters: [],
        ordering: null,
        limit: null,
      };
      const builder: {
        select: () => typeof builder;
        eq: (field: string, value: unknown) => typeof builder;
        like: (field: string, value: string) => typeof builder;
        in: (field: string, value: unknown[]) => typeof builder;
        order: (field: string, opts: { ascending: boolean }) => typeof builder;
        limit: (n: number) => typeof builder;
        single: () => Promise<{ data: Row | null; error: null }>;
        then: <T1, T2>(
          onFulfilled: (v: { data: Row[]; error: null }) => T1,
          onRejected?: (err: unknown) => T2,
        ) => Promise<T1 | T2>;
      } = {
        select: () => builder,
        eq: (field, value) => {
          q.filters.push({ kind: 'eq', field, value });
          return builder;
        },
        like: (field, value) => {
          q.filters.push({ kind: 'like', field, value });
          return builder;
        },
        in: (field, value) => {
          q.filters.push({ kind: 'in', field, value });
          return builder;
        },
        order: (field, opts) => {
          q.ordering = { field, ascending: opts.ascending };
          return builder;
        },
        limit: (n) => {
          q.limit = n;
          return builder;
        },
        single: () => {
          const rows = executeQuery(rowsByTable, q);
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        // Proper thenable: await unwraps to { data, error }.
        then: (onFulfilled, onRejected) =>
          Promise.resolve({ data: executeQuery(rowsByTable, q), error: null }).then(
            onFulfilled,
            onRejected,
          ),
      };
      return builder;
    },
  };
}

function executeQuery(rowsByTable: Record<string, Row[]>, q: MockQuery): Row[] {
  const rows = rowsByTable[q.table] ?? [];
  let filtered = rows.filter((r) => {
    for (const f of q.filters) {
      if (f.kind === 'eq') {
        if (String((r as unknown as Record<string, unknown>)[f.field] ?? '') !== String(f.value)) return false;
      } else if (f.kind === 'like') {
        const pattern = String(f.value).replace(/%/g, '');
        const val = String((r as unknown as Record<string, unknown>)[f.field] ?? '');
        if (!val.includes(pattern)) return false;
      } else if (f.kind === 'in') {
        if (!Array.isArray(f.value)) return false;
        if (!f.value.includes((r as unknown as Record<string, unknown>)[f.field])) return false;
      }
    }
    return true;
  });
  if (q.ordering) {
    const { field, ascending } = q.ordering;
    filtered = [...filtered].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[field];
      const bv = (b as unknown as Record<string, unknown>)[field];
      const cmp = String(av).localeCompare(String(bv));
      return ascending ? cmp : -cmp;
    });
  }
  if (q.limit != null) filtered = filtered.slice(0, q.limit);
  return filtered;
}

const BASE_TABLES: Record<string, Row[]> = {
  episodes: [{ id: EPISODE_ID, series_id: SERIES_ID }],
  assets: [
    {
      id: 'stb-asset',
      episode_id: EPISODE_ID,
      file_type: 'STB-storyboard',
      filename: 'SS-S15-E01-STB-storyboard-v01-APPROVED.md',
      status: 'APPROVED',
      content: STB_CONTENT,
      version: 1,
    },
  ],
};

describe('loadAnchorChainContext — shot-scoped Phase 2 inputs', () => {
  test('returns empty structure when no storyboard exists', async () => {
    const sb = makeSupabaseMock({ episodes: [{ id: EPISODE_ID }], assets: [] });
    const ctx = await loadAnchorChainContext({
      supabase: sb as never,
      episodeId: EPISODE_ID,
      shotId: 'SS-S15-E01-A1-SC01-SH01',
    });
    expect(ctx.full_storyboard).toEqual([]);
    expect(ctx.current_shot).toBeNull();
    expect(ctx.adjacent_shots.prior).toBeNull();
    expect(ctx.adjacent_shots.next).toBeNull();
    expect(ctx.prior_anchors).toEqual([]);
    expect(ctx.scene_master_asset).toBeNull();
  });

  test('resolves current_shot + adjacent_shots from STB narrative order', async () => {
    const sb = makeSupabaseMock(BASE_TABLES);
    const ctx = await loadAnchorChainContext({
      supabase: sb as never,
      episodeId: EPISODE_ID,
      shotId: 'SS-S15-E01-A1-SC01-SH02',
    });
    expect(ctx.full_storyboard.length).toBe(3);
    expect(ctx.current_shot?.shotId).toBe('SS-S15-E01-A1-SC01-SH02');
    expect(ctx.adjacent_shots.prior?.shotId).toBe('SS-S15-E01-A1-SC01-SH01');
    expect(ctx.adjacent_shots.next?.shotId).toBe('SS-S15-E01-A1-SC01-SH03');
  });

  test('first shot has null prior, last shot has null next', async () => {
    const sb = makeSupabaseMock(BASE_TABLES);
    const first = await loadAnchorChainContext({
      supabase: sb as never,
      episodeId: EPISODE_ID,
      shotId: 'SS-S15-E01-A1-SC01-SH01',
    });
    expect(first.adjacent_shots.prior).toBeNull();
    expect(first.adjacent_shots.next?.shotId).toBe('SS-S15-E01-A1-SC01-SH02');
    const last = await loadAnchorChainContext({
      supabase: sb as never,
      episodeId: EPISODE_ID,
      shotId: 'SS-S15-E01-A1-SC01-SH03',
    });
    expect(last.adjacent_shots.prior?.shotId).toBe('SS-S15-E01-A1-SC01-SH02');
    expect(last.adjacent_shots.next).toBeNull();
  });

  test('prior_anchors contains only APPROVED IMG-anchor_* of earlier shots', async () => {
    const tables: Record<string, Row[]> = {
      episodes: [{ id: EPISODE_ID, series_id: SERIES_ID }],
      assets: [
        ...BASE_TABLES.assets!,
        {
          id: 'anchor-sh01-end',
          episode_id: EPISODE_ID,
          file_type: 'IMG-anchor_ss_s15_e01_a1_sc01_sh01_end',
          filename: 'SS-S15-E01-IMG-anchor_ss_s15_e01_a1_sc01_sh01_end-v01-APPROVED.png',
          status: 'APPROVED',
        },
        {
          id: 'anchor-sh02-start',
          episode_id: EPISODE_ID,
          file_type: 'IMG-anchor_ss_s15_e01_a1_sc01_sh02_start',
          filename: 'SS-S15-E01-IMG-anchor_ss_s15_e01_a1_sc01_sh02_start-v01-APPROVED.png',
          status: 'APPROVED',
        },
        {
          id: 'anchor-sh02-end',
          episode_id: EPISODE_ID,
          file_type: 'IMG-anchor_ss_s15_e01_a1_sc01_sh02_end',
          filename: 'SS-S15-E01-IMG-anchor_ss_s15_e01_a1_sc01_sh02_end-v01-APPROVED.png',
          status: 'APPROVED',
        },
        {
          id: 'anchor-sh03-start',
          episode_id: EPISODE_ID,
          file_type: 'IMG-anchor_ss_s15_e01_a1_sc01_sh03_start',
          filename: 'SS-S15-E01-IMG-anchor_ss_s15_e01_a1_sc01_sh03_start-v01-APPROVED.png',
          status: 'APPROVED',
        },
        // DRAFT anchor — must be filtered out
        {
          id: 'anchor-sh02-end-draft',
          episode_id: EPISODE_ID,
          file_type: 'IMG-anchor_ss_s15_e01_a1_sc01_sh02_end',
          filename: 'SS-S15-E01-IMG-anchor_ss_s15_e01_a1_sc01_sh02_end-v02-DRAFT.png',
          status: 'DRAFT',
        },
      ],
    };
    const sb = makeSupabaseMock(tables);
    const ctx = await loadAnchorChainContext({
      supabase: sb as never,
      episodeId: EPISODE_ID,
      shotId: 'SS-S15-E01-A1-SC01-SH03',
    });
    // SH03 is current — SH01 + SH02 anchors are "prior" (4 total), SH03's
    // start_anchor is NOT included (Designer authors it).
    const priorIds = ctx.prior_anchors.map((a) => a.asset_id);
    expect(priorIds).toContain('anchor-sh01-end');
    expect(priorIds).toContain('anchor-sh02-start');
    expect(priorIds).toContain('anchor-sh02-end');
    expect(priorIds).not.toContain('anchor-sh03-start'); // current shot's own anchor excluded
    expect(priorIds).not.toContain('anchor-sh02-end-draft'); // DRAFT filtered
    // Narrative ordering: SH01 first then SH02.
    expect(ctx.prior_anchors[0]?.shotId).toContain('sh01');
    expect(ctx.prior_anchors[ctx.prior_anchors.length - 1]?.shotId).toContain('sh02');
  });

  test('scene_master_asset resolves to SBL-scene_master_<slug> when present', async () => {
    const tables: Record<string, Row[]> = {
      episodes: [{ id: EPISODE_ID, series_id: SERIES_ID }],
      assets: [
        ...BASE_TABLES.assets!,
        {
          id: 'scene-master',
          file_type: 'SBL-scene_master_sandy_bedroom_continuity',
          filename: 'SS-S15-SBL-scene_master_sandy_bedroom_continuity-v01-APPROVED.png',
          status: 'APPROVED',
          series_id: SERIES_ID,
        },
      ],
    };
    const sb = makeSupabaseMock(tables);
    const ctx = await loadAnchorChainContext({
      supabase: sb as never,
      episodeId: EPISODE_ID,
      shotId: 'SS-S15-E01-A1-SC01-SH02',
    });
    expect(ctx.scene_master_asset?.source).toBe('scene_master');
    expect(ctx.scene_master_asset?.asset_id).toBe('scene-master');
  });

  test('scene_master_asset falls back to SBL-location_<slug> when scene_master absent', async () => {
    const tables: Record<string, Row[]> = {
      episodes: [{ id: EPISODE_ID, series_id: SERIES_ID }],
      assets: [
        ...BASE_TABLES.assets!,
        {
          id: 'location-fallback',
          file_type: 'SBL-location_sandy_bedroom_continuity',
          filename: 'SS-S15-SBL-location_sandy_bedroom_continuity-v01-LOCKED.png',
          status: 'LOCKED',
          series_id: SERIES_ID,
        },
      ],
    };
    const sb = makeSupabaseMock(tables);
    const ctx = await loadAnchorChainContext({
      supabase: sb as never,
      episodeId: EPISODE_ID,
      shotId: 'SS-S15-E01-A1-SC01-SH02',
    });
    expect(ctx.scene_master_asset?.source).toBe('location');
    expect(ctx.scene_master_asset?.asset_id).toBe('location-fallback');
  });

  test('scene_master_asset is null when neither Bible asset exists', async () => {
    const sb = makeSupabaseMock(BASE_TABLES);
    const ctx = await loadAnchorChainContext({
      supabase: sb as never,
      episodeId: EPISODE_ID,
      shotId: 'SS-S15-E01-A1-SC01-SH02',
    });
    expect(ctx.scene_master_asset).toBeNull();
  });

  test('unknown shotId returns null current_shot but still parses full_storyboard', async () => {
    const sb = makeSupabaseMock(BASE_TABLES);
    const ctx = await loadAnchorChainContext({
      supabase: sb as never,
      episodeId: EPISODE_ID,
      shotId: 'SS-S15-E01-A9-SC99-SH99',
    });
    expect(ctx.full_storyboard.length).toBe(3);
    expect(ctx.current_shot).toBeNull();
    expect(ctx.adjacent_shots.prior).toBeNull();
    expect(ctx.adjacent_shots.next).toBeNull();
  });
});
