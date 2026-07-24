// ──────────────────────────────────────────────────────────────────────────────
// Shorts tail wiring — computeNextEvents (2026-07-16, E29 fallout).
//
// A vertical episode must NOT run the thumbnail chain: the Shorts feed never
// renders a custom thumbnail, so the chain burns gpt-image-2 on an unseen image
// and then fails to attach it (E29: setThumbnail 400, PNG 2.08MB > YouTube's
// 2MB cap).
//
// The trap this suite exists to pin: skipping the thumbnail must NOT strand the
// episode. Both publish gates used to require an APPROVED IMG-thumbnail, so a
// naive "just skip the thumbnail" fix would mean EXEC-PUB never fires for a
// Short — a silent dead-end that looks exactly like "still working".
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { computeNextEvents, type AssetForChain } from '@/lib/agents/next-events';
import { mockSupabase } from './helpers/mock-supabase-next-events';

const EP = 'ep-shorts';
const DIRECTOR = 'director-1';

const asset = (file_type: string, id = 'a1'): AssetForChain => ({
  id,
  filename: `SS-S15-E29-${file_type}-v01-APPROVED.x`,
  file_type,
  episode_id: EP,
  updated_at: '2026-07-16T10:00:00Z',
});

const episodeWith = (targets: string[]) => [{ id: EP, metadata: { delivery_targets: targets } }];

const approved = (file_type: string) => ({
  id: `${file_type}-1`,
  episode_id: EP,
  file_type,
  status: 'APPROVED',
  version: 1,
});

const names = (evs: Array<{ name: string }>) => evs.map((e) => e.name);

describe('vertical episode — thumbnail chain is skipped', () => {
  it('SPC-metadata APPROVED does NOT fire the thumbnail designer', async () => {
    const { client } = mockSupabase({
      episodes: episodeWith(['youtube_shorts']),
      assets: [approved('SPC-metadata')],
      jobs: [],
    });
    const events = await computeNextEvents(client, asset('SPC-metadata'), DIRECTOR);
    expect(names(events)).not.toContain('sandystudio/exec-thumb-designer/plan');
  });

  it('landscape episode still fires the thumbnail designer — long-form untouched', async () => {
    const { client } = mockSupabase({
      episodes: episodeWith(['youtube_landscape']),
      assets: [approved('SPC-metadata')],
      jobs: [],
    });
    const events = await computeNextEvents(client, asset('SPC-metadata'), DIRECTOR);
    expect(names(events)).toContain('sandystudio/exec-thumb-designer/plan');
  });

  it('an episode with no delivery_targets defaults to landscape behaviour', async () => {
    const { client } = mockSupabase({
      episodes: [{ id: EP, metadata: {} }],
      assets: [approved('SPC-metadata')],
      jobs: [],
    });
    const events = await computeNextEvents(client, asset('SPC-metadata'), DIRECTOR);
    expect(names(events)).toContain('sandystudio/exec-thumb-designer/plan');
  });
});

describe('vertical episode — publish must not dead-end without a thumbnail', () => {
  it('final cut APPROVED publishes with NO thumbnail when metadata is in', async () => {
    const { client } = mockSupabase({
      episodes: episodeWith(['youtube_shorts']),
      assets: [approved('VID-final_cut'), approved('SPC-metadata')],
      jobs: [],
    });
    const events = await computeNextEvents(client, asset('VID-final_cut'), DIRECTOR);
    expect(names(events)).toContain('sandystudio/exec-pub/publish');
  });

  it('metadata APPROVED last also publishes — approval order must not matter', async () => {
    const { client } = mockSupabase({
      episodes: episodeWith(['youtube_shorts']),
      assets: [approved('VID-final_cut'), approved('SPC-metadata')],
      jobs: [],
    });
    const events = await computeNextEvents(client, asset('SPC-metadata'), DIRECTOR);
    expect(names(events)).toContain('sandystudio/exec-pub/publish');
  });

  it('does NOT publish while the final cut is still missing', async () => {
    const { client } = mockSupabase({
      episodes: episodeWith(['youtube_shorts']),
      assets: [approved('SPC-metadata')],
      jobs: [],
    });
    const events = await computeNextEvents(client, asset('SPC-metadata'), DIRECTOR);
    expect(names(events)).not.toContain('sandystudio/exec-pub/publish');
  });

  it('does not re-fire EXEC-PUB when a publish job already ran', async () => {
    const { client } = mockSupabase({
      episodes: episodeWith(['youtube_shorts']),
      assets: [approved('VID-final_cut'), approved('SPC-metadata')],
      jobs: [{ episode_id: EP, agent_id: 'EXEC-PUB', status: 'COMPLETED', started_at: '2026-07-16T10:30:00Z' }],
    });
    const events = await computeNextEvents(client, asset('VID-final_cut'), DIRECTOR);
    expect(names(events)).not.toContain('sandystudio/exec-pub/publish');
  });
});

describe('landscape episode — publish still waits for the thumbnail', () => {
  it('final cut + metadata alone do NOT publish a long-form episode', async () => {
    const { client } = mockSupabase({
      episodes: episodeWith(['youtube_landscape']),
      assets: [approved('VID-final_cut'), approved('SPC-metadata')],
      jobs: [],
    });
    const events = await computeNextEvents(client, asset('VID-final_cut'), DIRECTOR);
    expect(names(events)).not.toContain('sandystudio/exec-pub/publish');
  });

  it('publishes once the thumbnail lands too', async () => {
    const { client } = mockSupabase({
      episodes: episodeWith(['youtube_landscape']),
      assets: [approved('VID-final_cut'), approved('SPC-metadata'), approved('IMG-thumbnail')],
      jobs: [],
    });
    const events = await computeNextEvents(client, asset('IMG-thumbnail'), DIRECTOR);
    expect(names(events)).toContain('sandystudio/exec-pub/publish');
  });
});
