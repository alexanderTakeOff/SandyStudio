// Unit tests for the EpisodeTimeline cell resolver — guards Director's
// directives 2026-05-06:
//   #1 shot-centric (one cell ↔ one shot_id)
//   #2 REVIEW vs APPROVED visual distinction
//   #6 fast iteration (latest VID-shot per shot wins)

import { describe, it, expect } from 'vitest';
import {
  resolveTimelineCells,
  countCellsByStatus,
  type VidShotAssetRow,
} from '@/lib/api/timeline-cell-resolver';
import type { AnimaticContract } from '@/lib/api/animatic-shotlist';

const baseContract: AnimaticContract = {
  contract: 'animatic@v1',
  shot_list: [
    {
      shot_id: 'SS-S14-E01-A1-SC01-SH01',
      asset_id: 'eref-1',
      image_url: '/staging/eref-1.png',
      duration_seconds: 4,
      shot_role: 'establishing',
      caption: 'Sandy enters cafe',
    },
    {
      shot_id: 'SS-S14-E01-A1-SC01-SH02',
      asset_id: 'eref-2',
      image_url: '/staging/eref-2.png',
      duration_seconds: 3,
      caption: 'Stopwatch frowns',
    },
  ],
  music_url: null,
  music_filename: null,
  total_duration: 7,
  created_at: '2026-05-06T00:00:00Z',
};

function vidShot(overrides: Partial<VidShotAssetRow>): VidShotAssetRow {
  return {
    id: 'asset-' + Math.random().toString(36).slice(2, 7),
    file_type: 'VID-shot-some-variant',
    status: 'REVIEW',
    version: 1,
    created_at: '2026-05-06T10:00:00Z',
    drive_path: '/staging/some.mp4',
    staging_path: null,
    drive_web_view_url: null,
    metadata: { shot_id: 'SS-S14-E01-A1-SC01-SH01' },
    ...overrides,
  };
}

describe('resolveTimelineCells — directive #1 shot-centric mapping', () => {
  it('returns one cell per storyboard shot', () => {
    const cells = resolveTimelineCells(baseContract, []);
    expect(cells).toHaveLength(2);
    expect(cells[0]!.shot_id).toBe('SS-S14-E01-A1-SC01-SH01');
    expect(cells[1]!.shot_id).toBe('SS-S14-E01-A1-SC01-SH02');
  });

  it('preserves storyboard order', () => {
    const cells = resolveTimelineCells(baseContract, []);
    expect(cells.map((c) => c.shot_id)).toEqual([
      'SS-S14-E01-A1-SC01-SH01',
      'SS-S14-E01-A1-SC01-SH02',
    ]);
  });

  it('falls back to image when no VID-shot exists', () => {
    const cells = resolveTimelineCells(baseContract, []);
    expect(cells[0]!.kind).toBe('image');
    expect(cells[0]!.url).toBe('/staging/eref-1.png');
    expect(cells[0]!.status).toBe('NONE');
  });

  it('skips VID-shot rows without canonical shot_id metadata', () => {
    // Legacy mock rows that have no metadata.shot_id should NOT pollute.
    const legacyMock: VidShotAssetRow = vidShot({
      metadata: { /* no shot_id */ },
      status: 'APPROVED',
    });
    const cells = resolveTimelineCells(baseContract, [legacyMock]);
    expect(cells[0]!.kind).toBe('image'); // not 'video-canonical'
  });
});

describe('resolveTimelineCells — directive #2 REVIEW vs APPROVED', () => {
  it('APPROVED VID-shot becomes video-canonical', () => {
    const approved = vidShot({
      status: 'APPROVED',
      drive_path: '/staging/sh01-approved.mp4',
    });
    const cells = resolveTimelineCells(baseContract, [approved]);
    expect(cells[0]!.kind).toBe('video-canonical');
    expect(cells[0]!.status).toBe('APPROVED');
    expect(cells[0]!.url).toBe('/staging/sh01-approved.mp4');
  });

  it('LOCKED VID-shot also becomes video-canonical', () => {
    const locked = vidShot({ status: 'LOCKED' });
    const cells = resolveTimelineCells(baseContract, [locked]);
    expect(cells[0]!.kind).toBe('video-canonical');
    expect(cells[0]!.status).toBe('LOCKED');
  });

  it('REVIEW VID-shot becomes video-review (tentative)', () => {
    const review = vidShot({ status: 'REVIEW' });
    const cells = resolveTimelineCells(baseContract, [review]);
    expect(cells[0]!.kind).toBe('video-review');
    expect(cells[0]!.status).toBe('REVIEW');
  });

  it('REVISION VID-shot falls back to animatic image (not canonical)', () => {
    const revision = vidShot({ status: 'REVISION' });
    const cells = resolveTimelineCells(baseContract, [revision]);
    // Tentative rejection — animatic image still serves until regenerate.
    expect(cells[0]!.kind).toBe('image');
    expect(cells[0]!.status).toBe('NONE');
  });

  it('REJECTED VID-shot falls back to animatic image', () => {
    const rejected = vidShot({ status: 'REJECTED' });
    const cells = resolveTimelineCells(baseContract, [rejected]);
    expect(cells[0]!.kind).toBe('image');
  });
});

describe('resolveTimelineCells — directive #6 fast iteration / latest wins', () => {
  it('higher version beats older row', () => {
    const v01Approved = vidShot({
      id: 'old',
      version: 1,
      status: 'APPROVED',
      drive_path: '/staging/v01.mp4',
      created_at: '2026-05-06T09:00:00Z',
    });
    const v02Review = vidShot({
      id: 'new',
      version: 2,
      status: 'REVIEW',
      drive_path: '/staging/v02.mp4',
      created_at: '2026-05-06T10:00:00Z',
    });
    const cells = resolveTimelineCells(baseContract, [v01Approved, v02Review]);
    // v02 is latest → its REVIEW status wins, even though older v01 was APPROVED.
    expect(cells[0]!.kind).toBe('video-review');
    expect(cells[0]!.url).toBe('/staging/v02.mp4');
    expect(cells[0]!.status).toBe('REVIEW');
  });

  it('within same version, newer created_at wins', () => {
    const earlier = vidShot({
      id: 'a',
      version: 1,
      status: 'APPROVED',
      created_at: '2026-05-06T09:00:00Z',
      drive_path: '/staging/a.mp4',
    });
    const later = vidShot({
      id: 'b',
      version: 1,
      status: 'REVIEW',
      created_at: '2026-05-06T11:00:00Z',
      drive_path: '/staging/b.mp4',
    });
    const cells = resolveTimelineCells(baseContract, [earlier, later]);
    expect(cells[0]!.url).toBe('/staging/b.mp4');
  });

  it('director_overrides apply to per-cell duration', () => {
    const contractWithOverride: AnimaticContract = {
      ...baseContract,
      director_overrides: {
        'SS-S14-E01-A1-SC01-SH01': { duration_seconds: 7.5 },
      },
    };
    const cells = resolveTimelineCells(contractWithOverride, []);
    expect(cells[0]!.duration_seconds).toBe(7.5);
    expect(cells[1]!.duration_seconds).toBe(3); // unchanged
  });
});

describe('resolveTimelineCells — placeholder fallback', () => {
  it('shot with no image_url and no VID-shot becomes placeholder', () => {
    const noImage: AnimaticContract = {
      ...baseContract,
      shot_list: [{
        shot_id: 'SS-S14-E01-A9-SC99-SH99',
        asset_id: '',
        image_url: '',
        duration_seconds: 2,
      }],
    };
    const cells = resolveTimelineCells(noImage, []);
    expect(cells[0]!.kind).toBe('placeholder');
    expect(cells[0]!.url).toBeNull();
    expect(cells[0]!.asset_id).toBeNull();
  });
});

describe('countCellsByStatus — filter chip counts', () => {
  it('aggregates cells by status', () => {
    const v1 = vidShot({ status: 'APPROVED', metadata: { shot_id: 'SS-S14-E01-A1-SC01-SH01' } });
    const v2 = vidShot({ status: 'REVIEW', metadata: { shot_id: 'SS-S14-E01-A1-SC01-SH02' } });
    const cells = resolveTimelineCells(baseContract, [v1, v2]);
    const counts = countCellsByStatus(cells);
    expect(counts.APPROVED).toBe(1);
    expect(counts.REVIEW).toBe(1);
    expect(counts.NONE).toBe(0);
  });
});
