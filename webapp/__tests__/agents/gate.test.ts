import { describe, it, expect, beforeEach } from 'vitest';

import { validateAgentInputs } from '@/lib/agents/gate';
import { makeMockSupabase } from '../helpers/mock-supabase';

describe('validateAgentInputs — upstream asset gate + governance', () => {
  it('EXEC-SW passes when an APPROVED brief exists', async () => {
    const sup = makeMockSupabase({
      episodes: [{ id: 'ep-1', governance_mode: 4 }],
      assets: [
        {
          id: 'a1',
          episode_id: 'ep-1',
          file_type: 'SPC-brief',
          status: 'APPROVED',
        },
      ],
    });
    const result = await validateAgentInputs({
      supabase: sup.client,
      agentId: 'EXEC-SW',
      episodeId: 'ep-1',
    });
    expect(result.passed).toBe(true);
  });

  it('EXEC-SW fails when no APPROVED brief exists', async () => {
    const sup = makeMockSupabase({
      episodes: [{ id: 'ep-1', governance_mode: 4 }],
      assets: [
        {
          id: 'a1',
          episode_id: 'ep-1',
          file_type: 'SPC-brief',
          status: 'DRAFT',
        },
      ],
    });
    const result = await validateAgentInputs({
      supabase: sup.client,
      agentId: 'EXEC-SW',
      episodeId: 'ep-1',
    });
    expect(result.passed).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.reason).toMatch(/Brief/);
  });

  it('EXEC-WCHK requires 3 APPROVED storyboard assets', async () => {
    const sup = makeMockSupabase({
      episodes: [{ id: 'ep-1', governance_mode: 4 }],
      assets: [
        { id: 'a1', episode_id: 'ep-1', file_type: 'STB-act1', status: 'APPROVED' },
        { id: 'a2', episode_id: 'ep-1', file_type: 'STB-act2', status: 'APPROVED' },
        // only 2 approved — should fail
      ],
    });
    const result = await validateAgentInputs({
      supabase: sup.client,
      agentId: 'EXEC-WCHK',
      episodeId: 'ep-1',
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/Storyboard/);
  });

  it('EXEC-PUB blocks in Mode 1 without director_confirm', async () => {
    const sup = makeMockSupabase({
      episodes: [{ id: 'ep-1', governance_mode: 1 }],
      assets: [
        { id: 'a1', episode_id: 'ep-1', file_type: 'VID-animatic', status: 'APPROVED' },
        { id: 'a2', episode_id: 'ep-1', file_type: 'SPC-metadata', status: 'APPROVED' },
        { id: 'a3', episode_id: 'ep-1', file_type: 'IMG-thumbnail', status: 'APPROVED' },
      ],
    });
    const result = await validateAgentInputs({
      supabase: sup.client,
      agentId: 'EXEC-PUB',
      episodeId: 'ep-1',
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/PUBLISH blocked/);
  });

  it('EXEC-PUB passes in Mode 1 WITH director_confirm', async () => {
    const sup = makeMockSupabase({
      episodes: [{ id: 'ep-1', governance_mode: 1 }],
      assets: [
        { id: 'a1', episode_id: 'ep-1', file_type: 'VID-animatic', status: 'APPROVED' },
        { id: 'a2', episode_id: 'ep-1', file_type: 'SPC-metadata', status: 'APPROVED' },
        { id: 'a3', episode_id: 'ep-1', file_type: 'IMG-thumbnail', status: 'APPROVED' },
      ],
    });
    const result = await validateAgentInputs({
      supabase: sup.client,
      agentId: 'EXEC-PUB',
      episodeId: 'ep-1',
      eventContext: { directorConfirm: true },
    });
    expect(result.passed).toBe(true);
  });

  it('EXEC-PUB passes in Mode 4 without director_confirm (AUTOTEST)', async () => {
    const sup = makeMockSupabase({
      episodes: [{ id: 'ep-1', governance_mode: 4 }],
      assets: [
        { id: 'a1', episode_id: 'ep-1', file_type: 'VID-animatic', status: 'APPROVED' },
        { id: 'a2', episode_id: 'ep-1', file_type: 'SPC-metadata', status: 'APPROVED' },
        { id: 'a3', episode_id: 'ep-1', file_type: 'IMG-thumbnail', status: 'APPROVED' },
      ],
    });
    const result = await validateAgentInputs({
      supabase: sup.client,
      agentId: 'EXEC-PUB',
      episodeId: 'ep-1',
    });
    expect(result.passed).toBe(true);
  });
});
