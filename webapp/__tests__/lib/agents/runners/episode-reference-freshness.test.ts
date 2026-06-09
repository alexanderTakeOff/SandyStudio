// ──────────────────────────────────────────────────────────────────────────────
// Tests for TD-35 freshness check module (q7a sprint, Step 5).
// Verifies checkPlanAnchorFreshness correctly classifies each anchor as
// fresh or stale, and formatStaleAnchorMessage produces a Polина-readable
// PLAN_ANCHOR_STALE error message.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import {
  checkPlanAnchorFreshness,
  formatStaleAnchorMessage,
  type StaleAnchorEntry,
} from '@/lib/agents/runners/episode-reference-freshness';
import type { ContinuityAnchor } from '@/lib/agents/runners/episode-references';

interface AssetRow {
  id: string;
  status: string;
  file_type?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

/**
 * Build a mock supabase client whose `.from('assets')` chain dispatches by
 * call shape:
 *   - `.select(...).eq('id', X).maybeSingle()` → returns assetById[X] or null
 *   - `.select(...).eq('episode_id', E).eq('status', 'APPROVED').order(...).limit(N)`
 *     → returns the configured rows for that episode (for the lookup helpers).
 */
function buildMock(opts: {
  assetById: Record<string, AssetRow | null>;
  lookupRows?: AssetRow[];
}) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (col1: string, val1: unknown) => {
          if (col1 === 'id') {
            const row = opts.assetById[String(val1)] ?? null;
            return { maybeSingle: async () => ({ data: row, error: null }) };
          }
          // assume episode_id chain → leads to .eq('status').order().limit()
          return {
            eq: (_col2: string, _val2: unknown) => ({
              order: (_field: string, _opts?: unknown) => ({
                limit: async (_n: number) => ({
                  data: opts.lookupRows ?? [],
                  error: null,
                }),
              }),
            }),
          };
        },
      }),
    }),
  } as never;
}

const SPATIAL_ANCHOR: ContinuityAnchor = {
  kind: 'spatial_same_location',
  assetId: 'anchor-spatial-1',
  resolvedAt: '2026-05-22T10:00:00.000Z',
};

const TEMPORAL_ANCHOR: ContinuityAnchor = {
  kind: 'temporal_previous_shot',
  assetId: 'anchor-temporal-1',
  resolvedAt: '2026-05-22T10:00:01.000Z',
};

describe('checkPlanAnchorFreshness — fresh paths', () => {
  it('returns ok=true for empty anchor list', async () => {
    const sb = buildMock({ assetById: {} });
    const out = await checkPlanAnchorFreshness(sb, 'ep-1', []);
    expect(out.ok).toBe(true);
    expect(out.stale).toEqual([]);
  });

  it('returns ok=true when spatial anchor is still latest APPROVED in location', async () => {
    const sb = buildMock({
      assetById: {
        'anchor-spatial-1': {
          id: 'anchor-spatial-1',
          status: 'APPROVED',
          metadata: { shot_reference: { location_slug: 'bedroom_main' } },
        },
      },
      lookupRows: [
        {
          id: 'anchor-spatial-1',
          status: 'APPROVED',
          file_type: 'IMG-episode_ref',
          metadata: { shot_reference: { location_slug: 'bedroom_main' } },
          created_at: '2026-05-22T10:00:00Z',
        },
      ],
    });
    const out = await checkPlanAnchorFreshness(sb, 'ep-1', [SPATIAL_ANCHOR]);
    expect(out.ok).toBe(true);
    expect(out.stale).toEqual([]);
  });

  it('returns ok=true when temporal anchor is still latest APPROVED for shot', async () => {
    const sb = buildMock({
      assetById: {
        'anchor-temporal-1': {
          id: 'anchor-temporal-1',
          status: 'APPROVED',
          metadata: {
            shot_reference: { shot_id: 'SS-S99-E99-A1-SC01-SH01' },
          },
        },
      },
      lookupRows: [
        {
          id: 'anchor-temporal-1',
          status: 'APPROVED',
          file_type: 'IMG-episode_ref',
          metadata: {
            shot_reference: { shot_id: 'SS-S99-E99-A1-SC01-SH01' },
          },
          created_at: '2026-05-22T10:00:01Z',
        },
      ],
    });
    const out = await checkPlanAnchorFreshness(sb, 'ep-1', [TEMPORAL_ANCHOR]);
    expect(out.ok).toBe(true);
    expect(out.stale).toEqual([]);
  });

  it('returns ok=true when episodeId is empty (degenerate input — no check)', async () => {
    const sb = buildMock({ assetById: {} });
    const out = await checkPlanAnchorFreshness(sb, '', [SPATIAL_ANCHOR]);
    expect(out.ok).toBe(true);
  });
});

describe('checkPlanAnchorFreshness — stale paths', () => {
  it('does NOT flag spatial anchor as stale when a newer APPROVED IMG exists at same location (relaxed 2026-06-09 — static room, any approved frame is a valid spatial anchor; only TEMPORAL anchors care about newer-at-scope)', async () => {
    const sb = buildMock({
      assetById: {
        'anchor-spatial-1': {
          id: 'anchor-spatial-1',
          status: 'APPROVED',
          metadata: { shot_reference: { location_slug: 'bedroom_main' } },
        },
      },
      lookupRows: [
        // A newer approved frame at the SAME location no longer invalidates a
        // still-APPROVED spatial anchor (Director «бред» ruling; the old
        // behaviour caused a serialization trap that failed same-room batches).
        {
          id: 'newer-asset-v2',
          status: 'APPROVED',
          file_type: 'IMG-episode_ref',
          metadata: { shot_reference: { location_slug: 'bedroom_main' } },
          created_at: '2026-05-22T11:00:00Z',
        },
      ],
    });
    const out = await checkPlanAnchorFreshness(sb, 'ep-1', [SPATIAL_ANCHOR]);
    expect(out.ok).toBe(true);
    expect(out.stale).toEqual([]);
  });

  it('flags anchor as stale when anchor asset is no longer APPROVED (auto-demote ripple)', async () => {
    const sb = buildMock({
      assetById: {
        'anchor-spatial-1': {
          id: 'anchor-spatial-1',
          status: 'REVIEW', // auto-demoted by approve-route when v2 landed
          metadata: { shot_reference: { location_slug: 'bedroom_main' } },
        },
      },
      lookupRows: [
        {
          id: 'newer-asset-v2',
          status: 'APPROVED',
          file_type: 'IMG-episode_ref',
          metadata: { shot_reference: { location_slug: 'bedroom_main' } },
          created_at: '2026-05-22T11:00:00Z',
        },
      ],
    });
    const out = await checkPlanAnchorFreshness(sb, 'ep-1', [SPATIAL_ANCHOR]);
    expect(out.ok).toBe(false);
    expect(out.stale).toHaveLength(1);
    expect(out.stale[0].reason).toBe('anchor_no_longer_approved');
    expect(out.stale[0].latestAssetId).toBe('newer-asset-v2');
  });

  it('flags anchor as stale when anchor asset can not be loaded at all', async () => {
    const sb = buildMock({
      assetById: { 'anchor-spatial-1': null },
      lookupRows: [],
    });
    const out = await checkPlanAnchorFreshness(sb, 'ep-1', [SPATIAL_ANCHOR]);
    expect(out.ok).toBe(false);
    expect(out.stale).toHaveLength(1);
    expect(out.stale[0].reason).toBe('anchor_asset_missing');
    expect(out.stale[0].latestAssetId).toBeNull();
  });

  it('flags temporal anchor as stale when newer APPROVED IMG exists for the same shot', async () => {
    const sb = buildMock({
      assetById: {
        'anchor-temporal-1': {
          id: 'anchor-temporal-1',
          status: 'APPROVED',
          metadata: {
            shot_reference: { shot_id: 'SS-S99-E99-A1-SC01-SH01' },
          },
        },
      },
      lookupRows: [
        {
          id: 'newer-temporal-v2',
          status: 'APPROVED',
          file_type: 'IMG-episode_ref',
          metadata: {
            shot_reference: { shot_id: 'SS-S99-E99-A1-SC01-SH01' },
          },
          created_at: '2026-05-22T11:00:01Z',
        },
      ],
    });
    const out = await checkPlanAnchorFreshness(sb, 'ep-1', [TEMPORAL_ANCHOR]);
    expect(out.ok).toBe(false);
    expect(out.stale[0]).toMatchObject({
      kind: 'temporal_previous_shot',
      planAnchorAssetId: 'anchor-temporal-1',
      latestAssetId: 'newer-temporal-v2',
      reason: 'newer_approved_asset_at_same_scope',
    });
  });

  it('reports both anchors when both are stale (multi-stale Plan)', async () => {
    const sb = buildMock({
      assetById: {
        'anchor-spatial-1': {
          id: 'anchor-spatial-1',
          status: 'REVIEW',
          metadata: { shot_reference: { location_slug: 'bedroom_main' } },
        },
        'anchor-temporal-1': {
          id: 'anchor-temporal-1',
          status: 'REVIEW',
          metadata: {
            shot_reference: { shot_id: 'SS-S99-E99-A1-SC01-SH01' },
          },
        },
      },
      // Latest lookup returns the same newer rows for any query (the mock
      // doesn't differentiate by .eq — both stale entries surface).
      lookupRows: [
        {
          id: 'newer-anything',
          status: 'APPROVED',
          file_type: 'IMG-episode_ref',
          metadata: { shot_reference: { location_slug: 'bedroom_main' } },
          created_at: '2026-05-22T11:00:00Z',
        },
      ],
    });
    const out = await checkPlanAnchorFreshness(sb, 'ep-1', [
      SPATIAL_ANCHOR,
      TEMPORAL_ANCHOR,
    ]);
    expect(out.ok).toBe(false);
    expect(out.stale).toHaveLength(2);
    expect(out.stale.map((s) => s.kind).sort()).toEqual([
      'spatial_same_location',
      'temporal_previous_shot',
    ]);
  });
});

describe('formatStaleAnchorMessage', () => {
  it('begins with PLAN_ANCHOR_STALE prefix and names regenerateRefPlan as the next step', () => {
    const msg = formatStaleAnchorMessage('plan-uuid-1', 'SH21', [
      {
        kind: 'spatial_same_location',
        planAnchorAssetId: 'anchor-stale-1',
        latestAssetId: 'newer-asset-1',
        reason: 'newer_approved_asset_at_same_scope',
      },
    ]);
    expect(msg).toMatch(/^PLAN_ANCHOR_STALE:/);
    expect(msg).toContain('plan-uuid-1');
    expect(msg).toContain('SH21');
    expect(msg).toContain('anchor-stale-1');
    expect(msg).toContain('newer-asset-1');
    expect(msg).toContain('regenerateRefPlan');
  });

  it('lists multiple stale entries with kind-specific scope labels', () => {
    const msg = formatStaleAnchorMessage('plan-uuid-1', 'SH22', [
      {
        kind: 'spatial_same_location',
        planAnchorAssetId: 'anchor-1',
        latestAssetId: 'newer-1',
        reason: 'newer_approved_asset_at_same_scope',
      },
      {
        kind: 'temporal_previous_shot',
        planAnchorAssetId: 'anchor-2',
        latestAssetId: null,
        reason: 'anchor_no_longer_approved',
      },
    ]);
    expect(msg).toContain('spatial_same_location');
    expect(msg).toContain('temporal_previous_shot');
    expect(msg).toContain('anchor_no_longer_approved');
    expect(msg).toContain('newer_approved_asset_at_same_scope');
    expect(msg).toContain('location');
    expect(msg).toContain('shot');
  });
});
