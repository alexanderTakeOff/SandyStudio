// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/api/anchor-usage.test.ts
// The reverse anchor index: given a reference frame, which APPROVED Plans depend
// on it? Born from S20-E01 (2026-07-31), where replacing one frame silently
// invalidated five Plans because nothing could answer this question.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import { findPlansAnchoredTo, formatAnchorUsage } from '@/lib/api/anchor-usage';

interface PlanFixture {
  id: string;
  filename: string;
  content: string | null;
  created_at?: string | null;
  metadata?: unknown;
}

function planContent(anchors: Array<{ kind: string; asset_id: string }>): string {
  return [
    'Some prose the Designer wrote.',
    '```json',
    JSON.stringify({ continuity_anchors: anchors.map((a) => ({ ...a, resolved_at: '2026-07-31T10:00:00.000Z' })) }),
    '```',
  ].join('\n');
}

/** `.from().select().eq().eq().like()` resolves to the configured rows. */
function buildMock(rows: PlanFixture[], opts: { error?: boolean } = {}) {
  const result = { data: opts.error ? null : rows, error: opts.error ? { message: 'boom' } : null };
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            like: async () => result,
          }),
        }),
      }),
    }),
  } as never;
}

const SH04_V1 = '0317947e-6120-4ed3-93de-ee360d0b81c9';

describe('findPlansAnchoredTo', () => {
  it('returns every APPROVED plan whose anchor points at the frame', async () => {
    const sb = buildMock([
      {
        id: 'plan-sh03',
        filename: 'SS-S20-E01-SPC-ref_plan-S20-E01-SH03-v02-APPROVED.md',
        content: planContent([{ kind: 'spatial_same_location', asset_id: SH04_V1 }]),
        metadata: { shot_id: 'S20-E01-SH03' },
      },
      {
        id: 'plan-sh05',
        filename: 'SS-S20-E01-SPC-ref_plan-S20-E01-SH05-v02-APPROVED.md',
        content: planContent([{ kind: 'temporal_previous_shot', asset_id: SH04_V1 }]),
        metadata: { shot_id: 'S20-E01-SH05' },
      },
      {
        id: 'plan-sh02',
        filename: 'SS-S20-E01-SPC-ref_plan-S20-E01-SH02-v02-APPROVED.md',
        content: planContent([{ kind: 'spatial_same_location', asset_id: 'some-other-frame' }]),
        metadata: { shot_id: 'S20-E01-SH02' },
      },
    ]);

    const found = await findPlansAnchoredTo(sb, 'ep-1', SH04_V1);

    expect(found.map((p) => p.shotId).sort()).toEqual(['S20-E01-SH03', 'S20-E01-SH05']);
    expect(found.find((p) => p.shotId === 'S20-E01-SH05')?.anchorKind).toBe('temporal_previous_shot');
  });

  it('falls back to the filename when metadata carries no shot_id', async () => {
    const sb = buildMock([
      {
        id: 'plan-sh07',
        filename: 'SS-S20-E01-SPC-ref_plan-S20-E01-SH07-v02-APPROVED.md',
        content: planContent([{ kind: 'spatial_same_location', asset_id: SH04_V1 }]),
        metadata: {},
      },
    ]);
    const found = await findPlansAnchoredTo(sb, 'ep-1', SH04_V1);
    expect(found).toHaveLength(1);
    expect(found[0].shotId).toBe('S20-E01-SH07');
  });

  it('skips an unparseable plan instead of throwing — advisory must never block', async () => {
    const sb = buildMock([
      { id: 'broken', filename: 'x-SH01-v01-APPROVED.md', content: 'no json block here' },
      { id: 'nulled', filename: 'y-SH02-v01-APPROVED.md', content: null },
    ]);
    await expect(findPlansAnchoredTo(sb, 'ep-1', SH04_V1)).resolves.toEqual([]);
  });

  it('returns empty on a DB error rather than propagating it', async () => {
    const sb = buildMock([], { error: true });
    await expect(findPlansAnchoredTo(sb, 'ep-1', SH04_V1)).resolves.toEqual([]);
  });

  it('returns empty when ids are missing', async () => {
    const sb = buildMock([]);
    await expect(findPlansAnchoredTo(sb, '', SH04_V1)).resolves.toEqual([]);
    await expect(findPlansAnchoredTo(sb, 'ep-1', '')).resolves.toEqual([]);
  });
});

describe('formatAnchorUsage', () => {
  it('stays silent when nothing depends on the frame', () => {
    expect(formatAnchorUsage([])).toBe('');
  });

  it('names the dependent shots once each, sorted', () => {
    const line = formatAnchorUsage([
      { planAssetId: 'a', planFilename: 'f', shotId: 'S20-E01-SH05', anchorKind: 'spatial_same_location' },
      { planAssetId: 'b', planFilename: 'f', shotId: 'S20-E01-SH03', anchorKind: 'spatial_same_location' },
      { planAssetId: 'c', planFilename: 'f', shotId: 'S20-E01-SH03', anchorKind: 'temporal_previous_shot' },
    ]);
    expect(line).toContain('S20-E01-SH03, S20-E01-SH05');
    expect(line).toContain('якорь непрерывности');
  });
});
