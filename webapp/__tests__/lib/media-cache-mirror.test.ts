import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { mirroredCachePath } from '@/lib/media-cache';

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
