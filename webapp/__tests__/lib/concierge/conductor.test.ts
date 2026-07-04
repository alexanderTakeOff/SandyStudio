// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/concierge/conductor.test.ts
// Фаза 4 — the conductor tools (getStateMatrix / reconcileEpisode).
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { makeMockSupabase } from '../../helpers/mock-supabase';
import { getStateMatrix, reconcileEpisode } from '@/lib/concierge/tools/conductor';
import type { ToolContext } from '@/lib/concierge/tools/types';

const EP = 'ep-1';

function ctx(over: Partial<ToolContext> & { supabase: ToolContext['supabase'] }): ToolContext {
  return {
    threadId: 't',
    mode: 'delegated' as unknown as ToolContext['mode'],
    appOrigin: 'http://localhost:3000',
    ...over,
  } as ToolContext;
}

describe('getStateMatrix tool', () => {
  it('returns the rendered matrix for the active episode', async () => {
    const { client } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1', metadata: {} }],
      assets: [
        {
          id: 'stb', episode_id: EP, file_type: 'STB-storyboard', status: 'APPROVED', version: 1,
          content: ['```json', JSON.stringify({ acts: [{ shots: [{ shot_id: 'SH01', duration_seconds: 3 }] }] }), '```'].join('\n'),
        },
        { id: 'v1', episode_id: EP, file_type: 'VID-shot', status: 'APPROVED', version: 1, metadata: { shot_id: 'SH01' } },
      ],
    });
    const res = await getStateMatrix.execute({}, ctx({ supabase: client, episodeId: EP }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.summary).toContain('State Matrix');
      expect(res.summary).toContain('SH01');
    }
  });

  it('fails clearly when no episode is in context', async () => {
    const { client } = makeMockSupabase({});
    const res = await getStateMatrix.execute({}, ctx({ supabase: client, episodeId: null }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/episodeId is required/i);
  });
});

describe('reconcileEpisode tool', () => {
  it('fails clearly when no episode is in context (before any fetch)', async () => {
    const { client } = makeMockSupabase({});
    const res = await reconcileEpisode.execute({}, ctx({ supabase: client, episodeId: null }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/episodeId is required/i);
  });

  it('is declared mutating (routes through the guarded /reconcile endpoint)', () => {
    expect(reconcileEpisode.mutating).toBe(true);
    expect(getStateMatrix.mutating).toBe(false);
  });
});
