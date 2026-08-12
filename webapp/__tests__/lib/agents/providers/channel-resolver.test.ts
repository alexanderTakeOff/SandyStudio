// Multi-channel Phase 1 (multi-channel.md §4/§5): the channel cascade, its
// HALT branches, the SANDY legacy-env transition rule, and the identity guard.
// getMyChannel is mocked — no network.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/providers/youtube', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/providers/youtube')>();
  return { ...mod, getMyChannel: vi.fn() };
});

import { getMyChannel } from '@/lib/providers/youtube';
import {
  resolveChannelForEpisode,
  resolveChannelForSeries,
  getChannelForSeries,
  assertChannelIdentity,
  decideYouTubePathway,
  publishDefaultsOf,
  ChannelResolutionError,
  type ChannelPassport,
} from '@/lib/providers/channel-resolver';
import {
  resolveChannelRefreshToken,
  hasAnyYouTubeCredential,
  GoogleAuthError,
} from '@/lib/providers/google-auth';

const SANDY: ChannelPassport = {
  id: 'ch-1',
  name: 'Sandy the Hourglass',
  youtubeChannelId: 'UC_sandy',
  credentialKey: 'SANDY',
  ntfyTopic: 'topic-sandy',
  status: 'ACTIVE',
  metadata: {},
};

/**
 * Minimal supabase double for the cascade: `episodes` → series_id,
 * `series` → channel_id, `channels` → passport row. Awaiting `.eq()` yields
 * `{ data, error }`, matching how the resolver consumes the builder.
 */
function makeSb(opts: {
  seriesId?: string | null;
  channelId?: string | null;
  channelRow?: Record<string, unknown> | null;
}) {
  return {
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          if (table === 'episodes') {
            return Promise.resolve({
              data: opts.seriesId === undefined ? [] : [{ series_id: opts.seriesId }],
              error: null,
            });
          }
          if (table === 'series') {
            return Promise.resolve({
              data: opts.channelId === undefined ? [] : [{ channel_id: opts.channelId }],
              error: null,
            });
          }
          return Promise.resolve({
            data: opts.channelRow ? [opts.channelRow] : [],
            error: null,
          });
        },
      };
    },
  } as never;
}

const SANDY_ROW = {
  id: 'ch-1',
  name: 'Sandy the Hourglass',
  youtube_channel_id: 'UC_sandy',
  credential_key: 'SANDY',
  ntfy_topic: 'topic-sandy',
  status: 'ACTIVE',
};

const ENV_KEYS = ['YOUTUBE_REFRESH_TOKEN', 'YOUTUBE_REFRESH_TOKEN_SANDY', 'YOUTUBE_REFRESH_TOKEN_PT01'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  vi.mocked(getMyChannel).mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('resolveChannelRefreshToken', () => {
  it('reads the suffixed per-channel env var', () => {
    process.env.YOUTUBE_REFRESH_TOKEN_PT01 = 'tok-pt';
    expect(resolveChannelRefreshToken('PT01')).toBe('tok-pt');
  });

  it('transition rule: SANDY falls back to the bare legacy var', () => {
    process.env.YOUTUBE_REFRESH_TOKEN = 'tok-legacy';
    expect(resolveChannelRefreshToken('SANDY')).toBe('tok-legacy');
  });

  it('suffixed var wins over legacy for SANDY', () => {
    process.env.YOUTUBE_REFRESH_TOKEN = 'tok-legacy';
    process.env.YOUTUBE_REFRESH_TOKEN_SANDY = 'tok-suffixed';
    expect(resolveChannelRefreshToken('SANDY')).toBe('tok-suffixed');
  });

  it('non-SANDY keys NEVER fall back to the legacy var (no cross-channel leak)', () => {
    process.env.YOUTUBE_REFRESH_TOKEN = 'tok-legacy';
    expect(() => resolveChannelRefreshToken('PT01')).toThrow(GoogleAuthError);
  });

  it('throws when nothing is configured', () => {
    expect(() => resolveChannelRefreshToken('SANDY')).toThrow(GoogleAuthError);
  });
});

describe('hasAnyYouTubeCredential', () => {
  it('false with no env at all', () => {
    expect(hasAnyYouTubeCredential()).toBe(false);
  });
  it('true with the bare legacy var', () => {
    process.env.YOUTUBE_REFRESH_TOKEN = 'tok';
    expect(hasAnyYouTubeCredential()).toBe(true);
  });
  it('true with only a suffixed var', () => {
    process.env.YOUTUBE_REFRESH_TOKEN_PT01 = 'tok';
    expect(hasAnyYouTubeCredential()).toBe(true);
  });
});

describe('channel cascade', () => {
  it('resolves episode → series → channel passport', async () => {
    const sb = makeSb({ seriesId: 's-1', channelId: 'ch-1', channelRow: SANDY_ROW });
    const passport = await resolveChannelForEpisode(sb, 'ep-1');
    expect(passport).toEqual(SANDY);
  });

  it('getChannelForSeries returns null for an unattached series (soft read)', async () => {
    const sb = makeSb({ channelId: null });
    expect(await getChannelForSeries(sb, 's-1')).toBeNull();
  });

  it('HALT: series without a channel', async () => {
    const sb = makeSb({ seriesId: 's-1', channelId: null });
    await expect(resolveChannelForEpisode(sb, 'ep-1')).rejects.toThrow(ChannelResolutionError);
  });

  it('HALT: episode without a parent series', async () => {
    const sb = makeSb({ seriesId: null });
    await expect(resolveChannelForEpisode(sb, 'ep-1')).rejects.toThrow(ChannelResolutionError);
  });

  it('resolveChannelForSeries HALTs on unattached series', async () => {
    const sb = makeSb({ channelId: null });
    await expect(resolveChannelForSeries(sb, 's-1')).rejects.toThrow(ChannelResolutionError);
  });
});

describe('assertChannelIdentity', () => {
  it('passes when the token belongs to the passport channel', async () => {
    vi.mocked(getMyChannel).mockResolvedValue({ id: 'UC_sandy', title: 'x', uploadsPlaylistId: 'u' });
    await expect(assertChannelIdentity(SANDY, 'tok')).resolves.toBeUndefined();
  });

  it('HALTs on token/channel mismatch', async () => {
    vi.mocked(getMyChannel).mockResolvedValue({ id: 'UC_other', title: 'x', uploadsPlaylistId: 'u' });
    await expect(assertChannelIdentity(SANDY, 'tok')).rejects.toThrow(/mismatch/);
  });
});

describe('decideYouTubePathway (gate matrix)', () => {
  it('mock: no supabase client', async () => {
    process.env.YOUTUBE_REFRESH_TOKEN = 'tok';
    expect(await decideYouTubePathway(null, 'ep-1')).toEqual({ mode: 'mock' });
  });

  it('mock: no YouTube credential at all (replay-pilot / dev)', async () => {
    const sb = makeSb({ seriesId: 's-1', channelId: 'ch-1', channelRow: SANDY_ROW });
    expect(await decideYouTubePathway(sb, 'ep-1')).toEqual({ mode: 'mock' });
  });

  it('real: creds + attached ACTIVE channel + token under its key', async () => {
    process.env.YOUTUBE_REFRESH_TOKEN = 'tok-legacy';
    const sb = makeSb({ seriesId: 's-1', channelId: 'ch-1', channelRow: SANDY_ROW });
    const pathway = await decideYouTubePathway(sb, 'ep-1');
    expect(pathway).toEqual({ mode: 'real', passport: SANDY, refreshToken: 'tok-legacy' });
  });

  it('HALT: creds exist but the series has no channel (the anti-leak rule)', async () => {
    process.env.YOUTUBE_REFRESH_TOKEN = 'tok-legacy';
    const sb = makeSb({ seriesId: 's-1', channelId: null });
    await expect(decideYouTubePathway(sb, 'ep-1')).rejects.toThrow(ChannelResolutionError);
  });

  it('HALT: channel attached but its credential_key has no env token', async () => {
    process.env.YOUTUBE_REFRESH_TOKEN = 'tok-legacy'; // creds exist globally...
    const row = { ...SANDY_ROW, credential_key: 'PT01' }; // ...but not for THIS channel
    const sb = makeSb({ seriesId: 's-1', channelId: 'ch-1', channelRow: row });
    await expect(decideYouTubePathway(sb, 'ep-1')).rejects.toThrow(GoogleAuthError);
  });

  it('HALT: channel not ACTIVE', async () => {
    process.env.YOUTUBE_REFRESH_TOKEN = 'tok-legacy';
    const row = { ...SANDY_ROW, status: 'PAUSED' };
    const sb = makeSb({ seriesId: 's-1', channelId: 'ch-1', channelRow: row });
    await expect(decideYouTubePathway(sb, 'ep-1')).rejects.toThrow(/PAUSED/);
  });
});

describe('publishDefaultsOf (multi-channel Phase 4e)', () => {
  const withPd = (pd: unknown): ChannelPassport => ({ ...SANDY, metadata: { publish_defaults: pd } });

  it('empty object when the passport has no publish_defaults', () => {
    expect(publishDefaultsOf(SANDY)).toEqual({});
  });

  it('empty object when publish_defaults is malformed (array / string)', () => {
    expect(publishDefaultsOf(withPd(['x']))).toEqual({});
    expect(publishDefaultsOf(withPd('23'))).toEqual({});
  });

  it('maps snake_case keys to camelCase upload input', () => {
    const passport = withPd({ category_id: '1', made_for_kids: true, default_language: 'en' });
    expect(publishDefaultsOf(passport)).toEqual({ categoryId: '1', madeForKids: true, defaultLanguage: 'en' });
  });

  it('drops blank strings and wrong-typed values (fallback to provider defaults)', () => {
    const passport = withPd({ category_id: '  ', made_for_kids: 'yes', default_language: 42 });
    expect(publishDefaultsOf(passport)).toEqual({});
  });

  it('made_for_kids=false survives (explicit, not dropped as falsy)', () => {
    expect(publishDefaultsOf(withPd({ made_for_kids: false }))).toEqual({ madeForKids: false });
  });
});
