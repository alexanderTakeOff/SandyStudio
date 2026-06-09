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
  replaceMusicLayer,
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

describe('replaceMusicLayer — Replace-music writer (2026-06-09 regression-lock)', () => {
  it('overwrites a stale music track that would otherwise shadow music_url', () => {
    // SS-S15-E03 v03: a mock wav sat in audio_tracks[music] while a fresh mp3
    // was uploaded to music_url. getAudioTracks PREFERS audio_tracks → player +
    // stitch played the stale wav. After replaceMusicLayer the canonical reader
    // returns the NEW mp3.
    const stale = makeContract({
      audio_tracks: [
        { layer: 'music', url: 'H:/My Drive/mock_track.wav', filename: 'mock.wav' },
      ],
      music_url: 'H:/My Drive/mock_track.wav',
      music_filename: 'mock.wav',
    });
    const next = replaceMusicLayer(stale, {
      url: '/api/media/SS-S15-E03-VID-animatic-v03-DRAFT-e60582733cf7c014.mp3',
      filename: 'Twang Relay.mp3',
    });
    const tracks = getAudioTracks(next);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].url).toBe(
      '/api/media/SS-S15-E03-VID-animatic-v03-DRAFT-e60582733cf7c014.mp3',
    );
    expect(tracks[0].filename).toBe('Twang Relay.mp3');
    // legacy field kept in sync for any old reader
    expect(next.music_url).toBe(tracks[0].url);
    expect(next.music_filename).toBe('Twang Relay.mp3');
  });

  it('preserves non-music layers (voice/sfx/ambience) and replaces only music', () => {
    const withVoice = makeContract({
      audio_tracks: [
        { layer: 'music', url: '/old.wav', filename: 'old.wav' },
        { layer: 'voice', url: '/narration.mp3', filename: 'narration.mp3' },
      ],
    });
    const next = replaceMusicLayer(withVoice, { url: '/new.mp3', filename: 'new.mp3' });
    expect(next.audio_tracks).toHaveLength(2);
    const music = next.audio_tracks!.find((t) => t.layer === 'music');
    const voice = next.audio_tracks!.find((t) => t.layer === 'voice');
    expect(music?.url).toBe('/new.mp3');
    expect(voice?.url).toBe('/narration.mp3');
  });

  it('drops stale fade/trim shaping from the prior track (new source file)', () => {
    const shaped = makeContract({
      audio_tracks: [
        {
          layer: 'music',
          url: '/old.mp3',
          filename: 'old.mp3',
          fade_in_seconds: 2,
          fade_out_seconds: 3,
          trim_in_seconds: 5,
          original_url: '/raw-old.mp3',
        },
      ],
    });
    const next = replaceMusicLayer(shaped, { url: '/new.mp3', filename: 'new.mp3' });
    const music = next.audio_tracks!.find((t) => t.layer === 'music')!;
    expect(music.fade_in_seconds).toBeUndefined();
    expect(music.fade_out_seconds).toBeUndefined();
    expect(music.trim_in_seconds).toBeUndefined();
    expect(music.original_url).toBeUndefined();
  });
});
