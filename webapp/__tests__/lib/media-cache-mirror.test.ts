import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { mirroredCachePath } from '@/lib/media-cache';

describe('mirroredCachePath', () => {
  it('mirrors a DRAFT image into <season>/e<NN>/raw/images', () => {
    const rel = mirroredCachePath('SS-S15-E01-IMG-thumbnail-v03-DRAFT.png');
    expect(rel).toBe(path.join('S15', 'e01', 'raw', 'images', 'SS-S15-E01-IMG-thumbnail-v03-DRAFT.png'));
  });

  it('routes APPROVED / LOCKED into the approved tier', () => {
    expect(mirroredCachePath('SS-S15-E01-IMG-thumbnail-v03-APPROVED.png')).toBe(
      path.join('S15', 'e01', 'approved', 'images', 'SS-S15-E01-IMG-thumbnail-v03-APPROVED.png'),
    );
    expect(mirroredCachePath('SS-S15-E02-VID-final_cut-v01-LOCKED.mp4')).toBe(
      path.join('S15', 'e02', 'approved', 'video', 'SS-S15-E02-VID-final_cut-v01-LOCKED.mp4'),
    );
  });

  it('maps TYPE → media dir (IMG→images, VID→video, AUD→audio)', () => {
    expect(mirroredCachePath('SS-S15-E01-VID-shot_03-v02-REVIEW.mp4')).toContain(
      path.join('raw', 'video'),
    );
    expect(mirroredCachePath('SS-S15-E01-AUD-music-v01-DRAFT.mp3')).toContain(
      path.join('raw', 'audio'),
    );
  });

  it('handles PILOT season/episode tokens', () => {
    expect(mirroredCachePath('SS-PILOT-PILOT-IMG-key_art-v01-DRAFT.png')).toBe(
      path.join('PILOT', 'pilot', 'raw', 'images', 'SS-PILOT-PILOT-IMG-key_art-v01-DRAFT.png'),
    );
  });

  it('treats a missing STATUS tail as raw', () => {
    expect(mirroredCachePath('SS-S15-E01-IMG-thumbnail.png')).toBe(
      path.join('S15', 'e01', 'raw', 'images', 'SS-S15-E01-IMG-thumbnail.png'),
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
