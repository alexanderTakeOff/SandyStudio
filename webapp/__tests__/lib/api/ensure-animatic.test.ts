// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/api/ensure-animatic.test.ts
// Timeline-as-home Phase 3 — silent EDL materialization for parallel episodes.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { makeMockSupabase } from '../../helpers/mock-supabase';
import { ensureEpisodeAnimaticEDL } from '@/lib/api/ensure-animatic';
import { isAnimaticV1 } from '@/lib/api/animatic-shotlist';

const EP = 'ep-1';
const SHOT = 'SS-S1-E1-A1-SC1-SH01';

const STB_CONTENT = [
  'Some storyboard prose.',
  '```json',
  JSON.stringify({
    acts: [{ shots: [{ shot_id: SHOT, duration_seconds: 3, action: 'Sandy enters' }] }],
  }),
  '```',
].join('\n');

function stbRow() {
  return {
    id: 'stb-1',
    episode_id: EP,
    file_type: 'STB-storyboard',
    status: 'APPROVED',
    version: 1,
    content: STB_CONTENT,
  };
}

function approvedRef() {
  return {
    id: 'ref-1',
    episode_id: EP,
    file_type: 'IMG-episode_ref',
    status: 'APPROVED',
    version: 1,
    staging_path: '/staging/ref1.png',
    drive_path: null,
    drive_web_view_url: null,
    filename: 'ref1.png',
    metadata: { shot_reference: { shot_id: SHOT } },
  };
}

function approvedMusic() {
  return {
    id: 'mus-1',
    episode_id: EP,
    file_type: 'AUD-music',
    status: 'APPROVED',
    version: 1,
    drive_path: 'https://drive/theme.mp3',
    staging_path: null,
    filename: 'theme.mp3',
    created_at: '2026-07-03T00:00:00Z',
  };
}

const CONTRACT_ID = 'animatic@v1';

/** A stale, music-less v1 contract — mirrors what the EDL bakes at pilot time,
 *  BEFORE music is approved. */
function musicLessAnimaticRow() {
  return {
    id: 'anim-stale',
    episode_id: EP,
    file_type: 'VID-animatic',
    status: 'APPROVED',
    version: 1,
    metadata: {
      animatic_v1: {
        contract: CONTRACT_ID,
        shot_list: [{ shot_id: SHOT, duration_seconds: 3 }],
        audio_tracks: [],
        music_url: null,
        music_filename: null,
        total_duration: 3,
        created_at: '2026-07-03T00:00:00Z',
      },
    },
  };
}

type AnimRow = { metadata?: { animatic_v1?: { music_url?: string | null; audio_tracks?: Array<{ layer?: string }> } } };
function musicOf(row: AnimRow | undefined) {
  return row?.metadata?.animatic_v1;
}

describe('ensureEpisodeAnimaticEDL', () => {
  it('is idempotent — returns the existing animatic id and inserts nothing', async () => {
    const { client, tables } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1' }],
      assets: [
        { id: 'anim-existing', episode_id: EP, file_type: 'VID-animatic', status: 'APPROVED', version: 1 },
      ],
    });
    const id = await ensureEpisodeAnimaticEDL(client, EP);
    expect(id).toBe('anim-existing');
    // No new VID-animatic row inserted.
    expect(tables.assets.filter((a) => a.file_type === 'VID-animatic')).toHaveLength(1);
  });

  it('returns null when there is no approved storyboard yet', async () => {
    const { client } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1' }],
      assets: [approvedRef()], // ref exists but no storyboard
    });
    const id = await ensureEpisodeAnimaticEDL(client, EP);
    expect(id).toBeNull();
  });

  it('returns null when the storyboard exists but no references are approved', async () => {
    const { client } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1' }],
      assets: [stbRow()], // storyboard but zero approved refs
    });
    const id = await ensureEpisodeAnimaticEDL(client, EP);
    expect(id).toBeNull();
  });

  it('materializes an APPROVED VID-animatic with a v1 contract when ready', async () => {
    const { client, tables } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1' }],
      assets: [stbRow(), approvedRef()],
    });
    const id = await ensureEpisodeAnimaticEDL(client, EP);
    expect(id).toBeTruthy();
    const row = tables.assets.find((a) => a.id === id) as
      | { file_type?: string; status?: string; version?: number; metadata?: unknown }
      | undefined;
    expect(row?.file_type).toBe('VID-animatic');
    expect(row?.status).toBe('APPROVED'); // silent EDL — no ceremony
    expect(row?.version).toBe(1);
    expect(isAnimaticV1(row?.metadata)).toBe(true);
  });

  // ── Фаза 0 — music bake (F8 fix) ─────────────────────────────────────────
  it('bakes APPROVED music into a freshly materialized EDL', async () => {
    const { client, tables } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1' }],
      assets: [stbRow(), approvedRef(), approvedMusic()],
    });
    const id = await ensureEpisodeAnimaticEDL(client, EP);
    const c = musicOf(tables.assets.find((a) => a.id === id) as AnimRow);
    expect(c?.music_url).toBe('https://drive/theme.mp3');
    expect((c?.audio_tracks ?? []).some((t) => t.layer === 'music')).toBe(true);
  });

  it('refreshes music into a STALE music-less EDL when music is approved later', async () => {
    // The EDL was materialized at pilot time (null music); music is APPROVED now.
    const { client, tables } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1' }],
      assets: [musicLessAnimaticRow(), approvedMusic()],
    });
    const id = await ensureEpisodeAnimaticEDL(client, EP);
    expect(id).toBe('anim-stale'); // idempotent — same row, no new insert
    expect(tables.assets.filter((a) => a.file_type === 'VID-animatic')).toHaveLength(1);
    const c = musicOf(tables.assets.find((a) => a.id === 'anim-stale') as AnimRow);
    expect(c?.music_url).toBe('https://drive/theme.mp3'); // rebaked in place
    expect((c?.audio_tracks ?? []).some((t) => t.layer === 'music')).toBe(true);
  });

  it('is a no-op on the idempotent path when the EDL already has music', async () => {
    const withMusic = {
      id: 'anim-stale',
      episode_id: EP,
      file_type: 'VID-animatic',
      status: 'APPROVED',
      version: 1,
      metadata: {
        animatic_v1: {
          contract: CONTRACT_ID,
          shot_list: [{ shot_id: SHOT, duration_seconds: 3 }],
          audio_tracks: [
            { layer: 'music', url: 'https://drive/old.mp3', filename: 'old.mp3', volume: 1, muted: false },
          ],
          music_url: 'https://drive/old.mp3',
          music_filename: 'old.mp3',
          total_duration: 3,
          created_at: '2026-07-03T00:00:00Z',
        },
      },
    };
    const { client, tables } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1' }],
      assets: [withMusic, approvedMusic()],
    });
    const id = await ensureEpisodeAnimaticEDL(client, EP);
    expect(id).toBe('anim-stale');
    // Existing music is NOT clobbered by the newer approved track.
    const c = musicOf(tables.assets.find((a) => a.id === 'anim-stale') as AnimRow);
    expect(c?.music_url).toBe('https://drive/old.mp3');
  });
});
