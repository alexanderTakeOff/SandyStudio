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
  type ImgRefAssetRow,
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

describe('resolveTimelineCells — status-priority resolution (Director 2026-06-16)', () => {
  it('APPROVED beats a newer REVIEW row (status priority, not version)', () => {
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
    // Canonical tier wins: the APPROVED v01 stays on screen until a newer
    // version is itself APPROVED. A REVIEW pilot does not auto-replace it.
    expect(cells[0]!.kind).toBe('video-canonical');
    expect(cells[0]!.url).toBe('/staging/v01.mp4');
    expect(cells[0]!.status).toBe('APPROVED');
  });

  it('APPROVED v01 survives behind newer DRAFT versions (SH02 regression)', () => {
    const v01Approved = vidShot({
      id: 'approved',
      version: 1,
      status: 'APPROVED',
      drive_path: '/staging/v01.mp4',
      created_at: '2026-06-15T09:00:00Z',
    });
    const drafts = [2, 3, 4].map((v) =>
      vidShot({
        id: `draft-v${v}`,
        version: v,
        status: 'DRAFT',
        drive_path: `/staging/v0${v}.mp4`,
        created_at: `2026-06-15T1${v}:00:00Z`,
      }),
    );
    const cells = resolveTimelineCells(baseContract, [v01Approved, ...drafts]);
    // The exact SH02 bug: 3× DRAFT + 1× APPROVED must show the APPROVED video,
    // not fall back to the animatic image.
    expect(cells[0]!.kind).toBe('video-canonical');
    expect(cells[0]!.url).toBe('/staging/v01.mp4');
    expect(cells[0]!.status).toBe('APPROVED');
  });

  it('newer DRAFT does not shadow an older REVIEW when no APPROVED exists', () => {
    const v01Review = vidShot({
      id: 'review',
      version: 1,
      status: 'REVIEW',
      drive_path: '/staging/v01.mp4',
      created_at: '2026-06-15T09:00:00Z',
    });
    const v02Draft = vidShot({
      id: 'draft',
      version: 2,
      status: 'DRAFT',
      drive_path: '/staging/v02.mp4',
      created_at: '2026-06-15T10:00:00Z',
    });
    const cells = resolveTimelineCells(baseContract, [v01Review, v02Draft]);
    expect(cells[0]!.kind).toBe('video-review');
    expect(cells[0]!.url).toBe('/staging/v01.mp4');
    expect(cells[0]!.status).toBe('REVIEW');
  });

  it('falls back to animatic image when only DRAFT versions exist', () => {
    const draft = vidShot({ status: 'DRAFT' });
    const cells = resolveTimelineCells(baseContract, [draft]);
    expect(cells[0]!.kind).toBe('image');
    expect(cells[0]!.status).toBe('NONE');
  });

  it('skips a higher-version INVALIDATED row and surfaces the APPROVED video (q13)', () => {
    const v01Approved = vidShot({
      id: 'keep',
      version: 1,
      status: 'APPROVED',
      drive_path: '/staging/v01.mp4',
      created_at: '2026-06-05T09:00:00Z',
    });
    const v02Invalidated = vidShot({
      id: 'superseded',
      version: 2,
      status: 'INVALIDATED',
      drive_path: '/staging/v02.mp4',
      created_at: '2026-06-05T10:00:00Z',
    });
    const cells = resolveTimelineCells(baseContract, [v01Approved, v02Invalidated]);
    // INVALIDATED v02 is dropped BEFORE the latest-pick, so the real v01 video
    // surfaces instead of vanishing into the animatic fallback.
    expect(cells[0]!.kind).toBe('video-canonical');
    expect(cells[0]!.url).toBe('/staging/v01.mp4');
  });

  it('within the same tier and version, newer created_at wins', () => {
    // Both APPROVED v01 → tiebreak is created_at (the tiebreak now applies
    // WITHIN a status tier, not across the whole row set).
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
      status: 'APPROVED',
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

// 2026-06-24 — live reference frame. The frozen animatic contract goes stale the
// moment a ref is approved AFTER the last rebuild (Director hit this on SH18: the
// tint + kebab showed an approved ref, but the cell frame was blank because the
// contract had image_url=null). The resolver now resolves the frame live.
function imgRef(shotId: string, o: Partial<ImgRefAssetRow> = {}): ImgRefAssetRow {
  return {
    id: 'ref-' + Math.random().toString(36).slice(2, 7),
    status: 'APPROVED',
    version: 1,
    metadata: { shot_reference: { shot_id: shotId } },
    drive_path: '/staging/ref.png',
    staging_path: null,
    drive_web_view_url: null,
    ...o,
  };
}

const SH01 = 'SS-S14-E01-A1-SC01-SH01';
const nullFrozenContract: AnimaticContract = {
  ...baseContract,
  shot_list: [
    { ...baseContract.shot_list[0]!, image_url: null, asset_id: null },
    baseContract.shot_list[1]!,
  ],
};

describe('resolveTimelineCells — live reference frame (SH18 stale-frozen fix)', () => {
  it('fills a null-frozen shot from a live APPROVED ref', () => {
    const ref = imgRef(SH01, { id: 'live-1', drive_path: '/staging/live-1.png' });
    const cells = resolveTimelineCells(nullFrozenContract, [], [ref]);
    expect(cells[0]!.kind).toBe('image');
    expect(cells[0]!.url).toBe('/staging/live-1.png');
    expect(cells[0]!.asset_id).toBe('live-1');
  });

  it('live APPROVED ref overrides a frozen contract image_url', () => {
    const ref = imgRef(SH01, { id: 'live-9', drive_path: '/staging/live-9.png' });
    const cells = resolveTimelineCells(baseContract, [], [ref]);
    expect(cells[0]!.url).toBe('/staging/live-9.png'); // not /staging/eref-1.png
    expect(cells[0]!.asset_id).toBe('live-9');
  });

  it('prefers APPROVED over REVIEW, newest version within a tier', () => {
    const cells = resolveTimelineCells(baseContract, [], [
      imgRef(SH01, { id: 'rev', status: 'REVIEW', version: 9, drive_path: '/staging/rev.png' }),
      imgRef(SH01, { id: 'app1', status: 'APPROVED', version: 1, drive_path: '/staging/app1.png' }),
      imgRef(SH01, { id: 'app2', status: 'APPROVED', version: 2, drive_path: '/staging/app2.png' }),
    ]);
    expect(cells[0]!.asset_id).toBe('app2');
  });

  it('uses a REVIEW ref as the frame when no approved ref exists', () => {
    const ref = imgRef(SH01, { id: 'rev1', status: 'REVIEW', drive_path: '/staging/rev1.png' });
    const cells = resolveTimelineCells(nullFrozenContract, [], [ref]);
    expect(cells[0]!.kind).toBe('image');
    expect(cells[0]!.asset_id).toBe('rev1');
  });

  it('shows a REVISION frame — any generated frame is viewable (status is a label)', () => {
    const cells = resolveTimelineCells(nullFrozenContract, [], [
      imgRef(SH01, { id: 'rv', status: 'REVISION', drive_path: '/staging/rv.png' }),
    ]);
    expect(cells[0]!.kind).toBe('image');
    expect(cells[0]!.asset_id).toBe('rv');
  });

  it('still ignores INVALIDATED / REJECTED refs (never the frame)', () => {
    const cells = resolveTimelineCells(nullFrozenContract, [], [
      imgRef(SH01, { id: 'inv', status: 'INVALIDATED' }),
      imgRef(SH01, { id: 'rej', status: 'REJECTED' }),
    ]);
    expect(cells[0]!.kind).toBe('placeholder');
  });

  it('skips a url-less ref so a viewable lower-status ref wins', () => {
    const cells = resolveTimelineCells(nullFrozenContract, [], [
      imgRef(SH01, {
        id: 'noUrl',
        status: 'DRAFT',
        drive_path: null,
        staging_path: null,
        drive_web_view_url: null,
      }),
      imgRef(SH01, { id: 'rev', status: 'REVIEW', drive_path: '/staging/rev.png' }),
    ]);
    expect(cells[0]!.asset_id).toBe('rev');
  });

  it('drive-backed ref resolves via /api/media/<id>', () => {
    const ref = imgRef(SH01, { id: 'drv', drive_web_view_url: 'https://drive/view' });
    const cells = resolveTimelineCells(baseContract, [], [ref]);
    expect(cells[0]!.url).toBe('/api/media/drv');
  });

  it('a VID-shot still wins over a live ref (video is downstream-canonical)', () => {
    const vid = vidShot({ status: 'APPROVED', metadata: { shot_id: SH01 } });
    const ref = imgRef(SH01, { id: 'r', status: 'APPROVED' });
    const cells = resolveTimelineCells(baseContract, [vid], [ref]);
    expect(cells[0]!.kind).toBe('video-canonical');
  });
});
