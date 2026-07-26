import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { mirroredCachePath, readAssetMediaAsBase64 } from '@/lib/media-cache';

// Layout 2026-06-02 (Director): flat per-episode `<SEASON>/<EPISODE>/media/<file>`
// — supersedes the old raw/approved/<type> 3-tier mirror (findability + cleanup).
describe('mirroredCachePath', () => {
  it('mirrors an image into <SEASON>/<EPISODE>/media (flat)', () => {
    const rel = mirroredCachePath('SS-S15-E01-IMG-thumbnail-v03-DRAFT.png');
    expect(rel).toBe(path.join('S15', 'E01', 'media', 'SS-S15-E01-IMG-thumbnail-v03-DRAFT.png'));
  });

  it('does NOT split by status — APPROVED / LOCKED land in the same flat media/ folder', () => {
    expect(mirroredCachePath('SS-S15-E01-IMG-thumbnail-v03-APPROVED.png')).toBe(
      path.join('S15', 'E01', 'media', 'SS-S15-E01-IMG-thumbnail-v03-APPROVED.png'),
    );
    expect(mirroredCachePath('SS-S15-E02-VID-final_cut-v01-LOCKED.mp4')).toBe(
      path.join('S15', 'E02', 'media', 'SS-S15-E02-VID-final_cut-v01-LOCKED.mp4'),
    );
  });

  it('does NOT split by media type — IMG / VID / AUD all share the flat media/ folder', () => {
    expect(mirroredCachePath('SS-S15-E01-VID-shot_03-v02-REVIEW.mp4')).toBe(
      path.join('S15', 'E01', 'media', 'SS-S15-E01-VID-shot_03-v02-REVIEW.mp4'),
    );
    expect(mirroredCachePath('SS-S15-E01-AUD-music-v01-DRAFT.mp3')).toBe(
      path.join('S15', 'E01', 'media', 'SS-S15-E01-AUD-music-v01-DRAFT.mp3'),
    );
  });

  it('handles PILOT season/episode tokens', () => {
    expect(mirroredCachePath('SS-PILOT-PILOT-IMG-key_art-v01-DRAFT.png')).toBe(
      path.join('PILOT', 'PILOT', 'media', 'SS-PILOT-PILOT-IMG-key_art-v01-DRAFT.png'),
    );
  });

  it('matches a filename with no STATUS tail', () => {
    expect(mirroredCachePath('SS-S15-E01-IMG-thumbnail.png')).toBe(
      path.join('S15', 'E01', 'media', 'SS-S15-E01-IMG-thumbnail.png'),
    );
  });

  it('returns null for non-SS filenames (caller falls back to flat key)', () => {
    expect(mirroredCachePath('random-file.png')).toBeNull();
    expect(mirroredCachePath('SS-S15-E01-SCR-script-v01-APPROVED.md')).toBeNull(); // text type, not media
  });

  it('strips path traversal from the leaf segment', () => {
    const rel = mirroredCachePath('SS-S15-E01-IMG-x.png');
    expect(rel).not.toBeNull();
    expect(rel!.includes('..')).toBe(false);
  });
});

// TD: media-no-branches reader — agents must not die on a stale /staging path
// (regenerated or worktree-deleted masters). Regression guard for the
// 2026-06-02 "Scene master bytes unreadable from /staging/regen-…png" failure.
describe('readAssetMediaAsBase64', () => {
  it('returns null when there is nothing to read (no filename, no drive, no staging)', async () => {
    expect(await readAssetMediaAsBase64({})).toBeNull();
  });

  it('returns null for a stale /staging path with no file on disk', async () => {
    const out = await readAssetMediaAsBase64({
      stagingPath: '/staging/regen-deadbeef-0000.png',
    });
    expect(out).toBeNull();
  });

  it('ignores a non-/staging legacy path (no traversal escape)', async () => {
    const out = await readAssetMediaAsBase64({ stagingPath: '/etc/passwd' });
    expect(out).toBeNull();
  });
});

// Phase 4e — series-scoped Bible Library media stopped falling flat into the root.
describe('mirroredCachePath — SBL (series bible) layout', () => {
  it('maps SBL media into <S>/bible/media/', () => {
    expect(mirroredCachePath('SS-S15-SBL-location_carwash-v01-LOCKED.png')).toBe(
      path.join('S15', 'bible', 'media', 'SS-S15-SBL-location_carwash-v01-LOCKED.png'),
    );
  });

  it('two series never share a bible cache directory', () => {
    const a = mirroredCachePath('SS-S15-SBL-style_main-v01-LOCKED.png');
    const b = mirroredCachePath('SS-S17-SBL-style_main-v01-LOCKED.png');
    expect(a).not.toBe(b);
    expect(a).toContain('S15');
    expect(b).toContain('S17');
  });
});
