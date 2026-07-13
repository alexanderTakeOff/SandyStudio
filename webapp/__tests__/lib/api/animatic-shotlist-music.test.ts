import { describe, it, expect } from 'vitest';

import { newestApprovedMusic, type MusicAssetRow } from '@/lib/api/animatic-shotlist';

function row(p: Partial<MusicAssetRow>): MusicAssetRow {
  return {
    file_type: 'AUD-music',
    status: 'APPROVED',
    version: 1,
    created_at: '2026-07-13T10:00:00Z',
    drive_path: '/api/media/track.mp3',
    drive_web_view_url: null,
    filename: 'SS-S15-E01-AUD-music-v01-APPROVED.mp3',
    ...p,
  };
}

describe('newestApprovedMusic — timeline skeleton music injection', () => {
  it('returns null when there is no AUD-music', () => {
    expect(newestApprovedMusic([])).toBeNull();
    expect(newestApprovedMusic([row({ file_type: 'VID-shot_01' })])).toBeNull();
  });

  it('ignores non-APPROVED AUD-music (REVIEW / DRAFT)', () => {
    expect(newestApprovedMusic([row({ status: 'REVIEW' }), row({ status: 'DRAFT' })])).toBeNull();
  });

  it('returns url + filename for an APPROVED track (drive_path)', () => {
    expect(newestApprovedMusic([row({})])).toEqual({
      url: '/api/media/track.mp3',
      filename: 'SS-S15-E01-AUD-music-v01-APPROVED.mp3',
    });
  });

  it('picks the highest version, then newest created_at', () => {
    const older = row({ version: 1, drive_path: '/api/media/v1.mp3' });
    const newerVer = row({ version: 3, drive_path: '/api/media/v3.mp3' });
    const sameVerNewer = row({ version: 3, created_at: '2026-07-13T12:00:00Z', drive_path: '/api/media/v3b.mp3' });
    expect(newestApprovedMusic([older, newerVer])?.url).toBe('/api/media/v3.mp3');
    expect(newestApprovedMusic([older, newerVer, sameVerNewer])?.url).toBe('/api/media/v3b.mp3');
  });

  it('falls back to drive_web_view_url, and is null when both URLs are absent', () => {
    expect(
      newestApprovedMusic([row({ drive_path: null, drive_web_view_url: 'https://drive/x' })])?.url,
    ).toBe('https://drive/x');
    expect(newestApprovedMusic([row({ drive_path: null, drive_web_view_url: null })])).toBeNull();
  });
});
