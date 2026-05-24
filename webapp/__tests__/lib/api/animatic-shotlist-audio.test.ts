// ──────────────────────────────────────────────────────────────────────────────
// Tests for getAudioTracks() in lib/api/animatic-shotlist.ts.
//
// Regression-lock for 2026-05-23 audio-render bug:
//   `audio_tracks: []` (empty array, present in SS-S15-E01 animatic v01)
//   used to short-circuit the legacy `music_url` fallback even though the
//   asset row had a correct music_url. AnimaticPlayer rendered no audio.
//   Fix: check `Array.isArray && length > 0` before returning audio_tracks.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import {
  getAudioTracks,
  type AnimaticContract,
} from '@/lib/api/animatic-shotlist';

function makeContract(overrides: Partial<AnimaticContract> = {}): AnimaticContract {
  return {
    contract: 'animatic@v1',
    shot_list: [],
    music_url: null,
    music_filename: null,
    total_duration: 0,
    created_at: '2026-05-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('getAudioTracks — audio fallback', () => {
  it('returns [] when neither audio_tracks nor music_url is set', () => {
    const out = getAudioTracks(makeContract());
    expect(out).toEqual([]);
  });

  it('returns the populated audio_tracks[] when present and non-empty', () => {
    const out = getAudioTracks(
      makeContract({
        audio_tracks: [
          {
            layer: 'music',
            url: '/staging/music/track-a.mp3',
            filename: 'track-a.mp3',
            volume: 0.8,
            muted: false,
          },
          {
            layer: 'voice',
            url: '/staging/voice/narration.mp3',
            filename: 'narration.mp3',
            volume: 1.0,
            muted: false,
          },
        ],
      }),
    );
    expect(out).toHaveLength(2);
    expect(out[0].layer).toBe('music');
    expect(out[1].layer).toBe('voice');
  });

  it('falls back to music_url when audio_tracks is the empty array (2026-05-23 regression)', () => {
    // SS-S15-E01 animatic v01 had this exact shape: audio_tracks: []
    // alongside a correct music_url. Player rendered nothing before the
    // fix; assert it now fabricates the single-track from music_url.
    const out = getAudioTracks(
      makeContract({
        audio_tracks: [],
        music_url: '/staging/music/0fac50cb1b1b6971.mp3',
        music_filename: 'Flacon Pop Loop.mp3',
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      layer: 'music',
      url: '/staging/music/0fac50cb1b1b6971.mp3',
      filename: 'Flacon Pop Loop.mp3',
      volume: 1.0,
      muted: false,
    });
  });

  it('falls back to music_url when audio_tracks is absent and music_url present (legacy v1 asset)', () => {
    const out = getAudioTracks(
      makeContract({
        music_url: '/staging/music/legacy.mp3',
        music_filename: 'legacy.mp3',
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('/staging/music/legacy.mp3');
    expect(out[0].filename).toBe('legacy.mp3');
  });

  it('defaults filename to "music" when music_filename is absent', () => {
    const out = getAudioTracks(
      makeContract({ music_url: '/staging/music/no-name.mp3' }),
    );
    expect(out[0].filename).toBe('music');
  });
});
