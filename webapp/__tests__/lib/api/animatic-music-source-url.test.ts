// ──────────────────────────────────────────────────────────────────────────────
// Tests for resolveMusicSourceUrl / resolveMusicPreviewUrl in
// lib/api/animatic-shotlist.ts.
//
// Regression-lock for the 2026-07-18 double-shaping bug:
//   The /animatic-timing route baked Director's fade/trim into a derived mp3
//   and REWROTE `url` to point at it. EXEC-STITCH loads its bytes from `url`
//   and then applies the very same fade/trim again via buildMusicAudioFilter
//   (runner.ts → ffmpeg-stitch.ts), so shaping landed twice in the final cut —
//   `atrim=start=N` on an already-trimmed file cut a further N seconds off.
//
//   Fix: the derivative moved to a separate `preview_url` (player only) and
//   `url` stays the raw source (stitch only). `original_url` is still honoured
//   so assets written by the old code resolve to their raw file without
//   needing a re-save.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import {
  resolveMusicSourceUrl,
  resolveMusicPreviewUrl,
  type AudioTrack,
} from '@/lib/api/animatic-shotlist';

function makeTrack(overrides: Partial<AudioTrack> = {}): AudioTrack {
  return {
    layer: 'music',
    url: '/api/media/raw-track.mp3',
    filename: 'raw-track.mp3',
    ...overrides,
  };
}

describe('resolveMusicSourceUrl — what EXEC-STITCH muxes', () => {
  it('returns url for a plain unshaped track', () => {
    expect(resolveMusicSourceUrl(makeTrack())).toBe('/api/media/raw-track.mp3');
  });

  it('IGNORES preview_url — muxing the derivative is what shaped audio twice', () => {
    const track = makeTrack({ preview_url: '/api/media/raw-track-processed.mp3' });
    expect(resolveMusicSourceUrl(track)).toBe('/api/media/raw-track.mp3');
  });

  it('prefers original_url on legacy assets whose url points at a derivative', () => {
    // Shape written by the pre-2026-07-18 route.
    const legacy = makeTrack({
      url: '/api/media/raw-track-processed.mp3',
      original_url: '/api/media/raw-track.mp3',
    });
    expect(resolveMusicSourceUrl(legacy)).toBe('/api/media/raw-track.mp3');
  });
});

describe('resolveMusicPreviewUrl — what the AnimaticPlayer plays', () => {
  it('falls back to the raw url when no derivative has been baked', () => {
    expect(resolveMusicPreviewUrl(makeTrack())).toBe('/api/media/raw-track.mp3');
  });

  it('prefers the shaped derivative so the preview matches the final cut', () => {
    const track = makeTrack({ preview_url: '/api/media/raw-track-processed.mp3' });
    expect(resolveMusicPreviewUrl(track)).toBe('/api/media/raw-track-processed.mp3');
  });
});

describe('the two resolvers must not converge', () => {
  it('gives stitch the raw file and the player the shaped file for one track', () => {
    const track = makeTrack({ preview_url: '/api/media/raw-track-processed.mp3' });
    expect(resolveMusicSourceUrl(track)).not.toBe(resolveMusicPreviewUrl(track));
  });
});
