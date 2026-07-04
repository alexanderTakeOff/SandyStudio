// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/agents/state-matrix.test.ts
// Фаза 1 — the Episode State Matrix projection.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { makeMockSupabase } from '../../helpers/mock-supabase';
import {
  getEpisodeStateMatrix,
  downstreamCone,
  renderStateMatrixMarkdown,
  STAGE_ORDER,
} from '@/lib/agents/state-matrix';

const EP = 'ep-1';

function storyboard(shotIds: string[]) {
  const content = [
    'Board prose.',
    '```json',
    JSON.stringify({
      acts: [{ shots: shotIds.map((id) => ({ shot_id: id, duration_seconds: 3 })) }],
    }),
    '```',
  ].join('\n');
  return {
    id: 'stb-1',
    episode_id: EP,
    file_type: 'STB-storyboard',
    status: 'APPROVED',
    version: 1,
    content,
  };
}

function asset(over: Record<string, unknown>) {
  return {
    episode_id: EP,
    status: 'APPROVED',
    version: 1,
    created_at: '2026-07-04T00:00:00Z',
    ...over,
  };
}

describe('getEpisodeStateMatrix', () => {
  it('projects the storyboard spine with latest-version-wins per shot×stage', async () => {
    const { client } = makeMockSupabase({
      episodes: [
        {
          id: EP,
          episode_code: 'SS-S1-E1',
          governance_mode: 'MODE_3',
          metadata: { excluded_shot_ids: ['SH02'] },
        },
      ],
      assets: [
        storyboard(['SH01', 'SH02', 'SH03']),
        asset({ id: 'rp1a', file_type: 'SPC-ref_plan', version: 1, metadata: { shot_id: 'SH01' } }),
        asset({ id: 'rp1b', file_type: 'SPC-ref_plan', version: 2, status: 'REVIEW', metadata: { shot_id: 'SH01' } }),
        asset({ id: 'ri1', file_type: 'IMG-episode_ref', metadata: { shot_reference: { shot_id: 'SH01' } } }),
        asset({ id: 'sp1', file_type: 'SPC-shot_plan', metadata: { shot_id: 'SH01' } }),
        asset({ id: 'v1', file_type: 'VID-shot', metadata: { shot_id: 'SH01', input_versions: { shot_plan: 1 } } }),
        asset({ id: 'mus', file_type: 'AUD-music' }),
        asset({ id: 'fc', file_type: 'VID-final_cut', status: 'REVIEW' }),
      ],
    });

    const m = await getEpisodeStateMatrix(client, EP);

    expect(m.shots.map((s) => s.shot_id)).toEqual(['SH01', 'SH02', 'SH03']);
    expect(m.governance_mode).toBe('MODE_3');

    const sh01 = m.shots[0];
    // latest ref_plan wins → v2 REVIEW, not v1 APPROVED
    expect(sh01.stages.ref_plan.version).toBe(2);
    expect(sh01.stages.ref_plan.status).toBe('REVIEW');
    // video built from current shot_plan v1 → fresh
    expect(sh01.stages.video.status).toBe('APPROVED');
    expect(sh01.stages.video.fresh).toBe(true);

    // SH02 excluded + no assets → all stages empty
    const sh02 = m.shots[1];
    expect(sh02.excluded).toBe(true);
    expect(STAGE_ORDER.every((st) => sh02.stages[st].asset_id === null)).toBe(true);

    expect(m.music.status).toBe('APPROVED');
    expect(m.final_cut.status).toBe('REVIEW');
    expect(m.gates.reserved).toContain('publish');
  });

  it('flags a stage STALE when input_versions no longer match the current upstream', async () => {
    const { client } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1', metadata: {} }],
      assets: [
        storyboard(['SH01']),
        // A newer shot_plan v2 was approved AFTER the video was built from v1.
        asset({ id: 'sp1', file_type: 'SPC-shot_plan', version: 2, metadata: { shot_id: 'SH01' } }),
        asset({ id: 'v1', file_type: 'VID-shot', metadata: { shot_id: 'SH01', input_versions: { shot_plan: 1 } } }),
      ],
    });

    const m = await getEpisodeStateMatrix(client, EP);
    const video = m.shots[0].stages.video;
    expect(video.fresh).toBe(false);
    expect(video.blocked_reason).toMatch(/stale/i);
  });

  it('a newer INVALIDATED row does not mask the usable APPROVED version beneath it', async () => {
    const { client } = makeMockSupabase({
      episodes: [{ id: EP, metadata: {} }],
      assets: [
        storyboard(['SH01']),
        asset({ id: 'ri1a', file_type: 'IMG-episode_ref', version: 1, status: 'APPROVED', metadata: { shot_reference: { shot_id: 'SH01' } } }),
        asset({ id: 'ri1b', file_type: 'IMG-episode_ref', version: 2, status: 'INVALIDATED', metadata: { shot_reference: { shot_id: 'SH01' } } }),
      ],
    });
    const m = await getEpisodeStateMatrix(client, EP);
    const cell = m.shots[0].stages.ref_image;
    expect(cell.status).toBe('APPROVED'); // the live v1, not the tombstone v2
    expect(cell.version).toBe(1);
    expect(cell.fresh).toBe(true);
  });

  it('marks INVALIDATED assets as not fresh', async () => {
    const { client } = makeMockSupabase({
      episodes: [{ id: EP, metadata: {} }],
      assets: [
        storyboard(['SH01']),
        asset({ id: 'rp1', file_type: 'SPC-ref_plan', status: 'INVALIDATED', metadata: { shot_id: 'SH01' } }),
      ],
    });
    const m = await getEpisodeStateMatrix(client, EP);
    expect(m.shots[0].stages.ref_plan.fresh).toBe(false);
  });

  it('surfaces a stuck shot (generation failed, empty cell) in plain language', async () => {
    const { client } = makeMockSupabase({
      episodes: [{ id: EP, metadata: {} }],
      assets: [storyboard(['SH16'])], // shot exists in board, but no video ever produced
      activity_events: [
        { episode_id: EP, event_type: 'agent_failed', description: 'fal request polling timed out', created_at: '2026-07-04T03:00:00Z', metadata: { shot_id: 'SH16', agent: 'EXEC-VGEN' } },
        { episode_id: EP, event_type: 'agent_failed', description: 'fal request polling timed out', created_at: '2026-07-04T02:00:00Z', metadata: { shot_id: 'SH16', agent: 'EXEC-VGEN' } },
      ],
    });
    const m = await getEpisodeStateMatrix(client, EP);
    const video = m.shots[0].stages.video;
    expect(video.status).toBeNull(); // never produced
    expect(video.blocked_reason).toMatch(/упала ×2/);
    expect(video.blocked_reason).toMatch(/timed out/);
  });

  it('falls back to asset-derived spine when no approved storyboard exists', async () => {
    const { client } = makeMockSupabase({
      episodes: [{ id: EP, metadata: {} }],
      assets: [
        asset({ id: 'v1', file_type: 'VID-shot', metadata: { shot_id: 'SH07' } }),
      ],
    });
    const m = await getEpisodeStateMatrix(client, EP);
    expect(m.shots.map((s) => s.shot_id)).toEqual(['SH07']);
  });
});

describe('downstreamCone', () => {
  it('returns downstream stages of the same shot + final cut', () => {
    const cone = downstreamCone('SH01', 'ref_plan');
    expect(cone.map((c) => c.stage)).toEqual(['ref_image', 'shot_plan', 'video']);
    expect(cone.every((c) => c.shotId === 'SH01')).toBe(true);
    expect(cone.includesFinalCut).toBe(true);
  });

  it('a video change has no downstream stages but still invalidates the final cut', () => {
    const cone = downstreamCone('SH01', 'video');
    expect(cone).toHaveLength(0);
    expect(cone.includesFinalCut).toBe(true);
  });
});

describe('renderStateMatrixMarkdown', () => {
  it('renders a table with excluded strikethrough and a stale warning', async () => {
    const { client } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1', metadata: { excluded_shot_ids: ['SH02'] } }],
      assets: [
        storyboard(['SH01', 'SH02']),
        asset({ id: 'sp1', file_type: 'SPC-shot_plan', version: 2, metadata: { shot_id: 'SH01' } }),
        asset({ id: 'v1', file_type: 'VID-shot', metadata: { shot_id: 'SH01', input_versions: { shot_plan: 1 } } }),
      ],
    });
    const md = renderStateMatrixMarkdown(await getEpisodeStateMatrix(client, EP));
    expect(md).toContain('SH01');
    expect(md).toContain('~~SH02~~');
    expect(md).toContain('⚠️');
    expect(md).toContain('Blocked / stale');
  });
});
