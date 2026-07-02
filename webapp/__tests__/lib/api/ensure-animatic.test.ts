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
});
