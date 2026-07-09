// D3b/D14 (2026-07-09) — a manual UPLOAD MUSIC must promote music to APPROVED
// with the REAL extension so the stitch gate is satisfied and the pipeline
// advances. These pin the gate-satisfying half (skipBake — the animatic bake is
// covered by ensure-animatic's own suite).

import { describe, it, expect } from 'vitest';
import { ingestUploadedMusic } from '@/lib/api/ingest-music';
import { makeMockSupabase } from '../../helpers/mock-supabase';

const EP = 'ep-1';
const CODE = 'SS-S01-E18';

describe('ingestUploadedMusic — promote uploaded track to APPROVED', () => {
  it('promotes an existing REVIEW AUD-music row and fixes the extension (D14)', async () => {
    const sup = makeMockSupabase({
      episodes: [{ id: EP, episode_code: CODE }],
      assets: [
        {
          id: 'mus-1',
          episode_id: EP,
          file_type: 'AUD-music',
          status: 'REVIEW',
          // mock MGEN wrote a .wav name; the real upload is mp3.
          filename: `${CODE}-AUD-music-v01-REVIEW.wav`,
          metadata: {},
        },
      ],
    });

    const { audMusicId } = await ingestUploadedMusic(sup.client, {
      episodeId: EP,
      browserUrl: '/api/media/track-abc.mp3',
      ext: 'mp3',
      originalFilename: 'song.mp3',
      bytes: 1234,
      mime: 'audio/mpeg',
      uploaderId: 'dir-1',
      targetAudMusicId: 'mus-1',
      skipBake: true,
    });

    const row = sup.tables.assets.find((a) => a.id === 'mus-1')!;
    expect(audMusicId).toBe('mus-1');
    expect(row.status).toBe('APPROVED');
    // extension corrected .wav → .mp3 AND status reflowed to APPROVED.
    expect(row.filename).toBe(`${CODE}-AUD-music-v01-APPROVED.mp3`);
    expect(row.drive_path).toBe('/api/media/track-abc.mp3');
    expect((row.metadata as { uploaded_by_director?: boolean }).uploaded_by_director).toBe(true);
  });

  it('inserts a fresh APPROVED AUD-music row when the episode has none', async () => {
    const sup = makeMockSupabase({
      episodes: [{ id: EP, episode_code: CODE }],
      assets: [],
    });

    await ingestUploadedMusic(sup.client, {
      episodeId: EP,
      browserUrl: '/api/media/track-xyz.wav',
      ext: 'wav',
      originalFilename: 's.wav',
      bytes: 10,
      mime: 'audio/wav',
      uploaderId: 'dir-1',
      skipBake: true,
    });

    const rows = sup.tables.assets.filter((a) => a.file_type === 'AUD-music');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('APPROVED');
    expect(rows[0].filename).toBe(`${CODE}-AUD-music-v01-APPROVED.wav`);
  });
});
