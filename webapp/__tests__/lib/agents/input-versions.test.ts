// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/agents/input-versions.test.ts
// Фаза 1b — upstream-version stamping (write side of generic freshness).
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { makeMockSupabase } from '../../helpers/mock-supabase';
import { computeInputVersions } from '@/lib/agents/input-versions';

const EP = 'ep-1';
const SHOT = 'SH01';

describe('computeInputVersions', () => {
  it('stamps the latest APPROVED shot_plan version for a VGEN (video) output', async () => {
    const { client } = makeMockSupabase({
      assets: [
        { id: 'sp1', episode_id: EP, file_type: 'SPC-shot_plan', status: 'APPROVED', version: 1, metadata: { shot_id: SHOT } },
        { id: 'sp2', episode_id: EP, file_type: 'SPC-shot_plan', status: 'APPROVED', version: 3, metadata: { shot_id: SHOT } },
      ],
    });
    const iv = await computeInputVersions(client, 'EXEC-VGEN', EP, SHOT);
    expect(iv).toEqual({ shot_plan: 3 });
  });

  it('stamps the latest APPROVED ref_image version for a VANIM (shot_plan) output', async () => {
    const { client } = makeMockSupabase({
      assets: [
        { id: 'ri1', episode_id: EP, file_type: 'IMG-episode_ref', status: 'APPROVED', version: 2, metadata: { shot_reference: { shot_id: SHOT } } },
      ],
    });
    const iv = await computeInputVersions(client, 'EXEC-VANIM', EP, SHOT);
    expect(iv).toEqual({ ref_image: 2 });
  });

  it('ignores upstream rows for OTHER shots', async () => {
    const { client } = makeMockSupabase({
      assets: [
        { id: 'sp-other', episode_id: EP, file_type: 'SPC-shot_plan', status: 'APPROVED', version: 9, metadata: { shot_id: 'SH99' } },
        { id: 'sp1', episode_id: EP, file_type: 'SPC-shot_plan', status: 'APPROVED', version: 1, metadata: { shot_id: SHOT } },
      ],
    });
    const iv = await computeInputVersions(client, 'EXEC-VGEN', EP, SHOT);
    expect(iv).toEqual({ shot_plan: 1 });
  });

  it('returns null for an agent with no tracked upstream', async () => {
    const { client } = makeMockSupabase({ assets: [] });
    expect(await computeInputVersions(client, 'EXEC-EREF-DESIGNER', EP, SHOT)).toBeNull();
  });

  it('returns null when no shotId is known', async () => {
    const { client } = makeMockSupabase({ assets: [] });
    expect(await computeInputVersions(client, 'EXEC-VGEN', EP, null)).toBeNull();
  });

  it('returns null when no APPROVED upstream exists yet', async () => {
    const { client } = makeMockSupabase({
      assets: [
        { id: 'sp1', episode_id: EP, file_type: 'SPC-shot_plan', status: 'REVIEW', version: 1, metadata: { shot_id: SHOT } },
      ],
    });
    expect(await computeInputVersions(client, 'EXEC-VGEN', EP, SHOT)).toBeNull();
  });
});
