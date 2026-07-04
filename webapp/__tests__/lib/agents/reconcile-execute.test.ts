// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/agents/reconcile-execute.test.ts
// Фаза 2b — the reconciler executor (mutations + cascade).
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { makeMockSupabase } from '../../helpers/mock-supabase';
import { reconcileEpisode } from '@/lib/agents/reconcile-execute';

const EP = 'ep-1';
const SHOT = 'SH01';

function storyboard(shotIds: string[]) {
  return {
    id: 'stb-1',
    episode_id: EP,
    file_type: 'STB-storyboard',
    status: 'APPROVED',
    version: 1,
    content: [
      '```json',
      JSON.stringify({ acts: [{ shots: shotIds.map((id) => ({ shot_id: id, duration_seconds: 3 })) }] }),
      '```',
    ].join('\n'),
  };
}

function seedWithReviewShotPlan() {
  return makeMockSupabase({
    episodes: [{ id: EP, episode_code: 'SS-S1-E1', governance_mode: '3', metadata: {} }],
    assets: [
      storyboard([SHOT]),
      { id: 'sp1', episode_id: EP, file_type: 'SPC-shot_plan', status: 'REVIEW', version: 1, metadata: { shot_id: SHOT } },
      { id: 'rev1', episode_id: EP, file_type: 'REV-shot_plan', status: 'APPROVED', version: 1, metadata: { shot_id: SHOT, verdict: 'PASS' } },
    ],
  });
}

describe('reconcileEpisode', () => {
  it('is a no-op when MECHANICS_AUTO_ADVANCE is off and not forced', async () => {
    const { client } = seedWithReviewShotPlan();
    const res = await reconcileEpisode(client, EP); // no force, flag unset
    expect(res.ran).toBe(false);
    expect(res.approvedAssetIds).toHaveLength(0);
  });

  it('force-approves a critic-PASS mechanical stage and flips its status', async () => {
    const { client, tables } = seedWithReviewShotPlan();
    const res = await reconcileEpisode(client, EP, { force: true });
    expect(res.ran).toBe(true);
    expect(res.approvedAssetIds).toContain('sp1');
    const sp1 = tables.assets.find((a) => a.id === 'sp1');
    expect(sp1?.status).toBe('APPROVED'); // actually mutated
    // an auto-approve activity event was surfaced
    expect(tables.activity_events.some((e) => e.event_type === 'reconcile/auto-approved')).toBe(true);
  });

  it('is idempotent — a second pass approves nothing new', async () => {
    const { client } = seedWithReviewShotPlan();
    await reconcileEpisode(client, EP, { force: true });
    const again = await reconcileEpisode(client, EP, { force: true });
    expect(again.approvedAssetIds).toHaveLength(0); // sp1 already APPROVED → not actionable
  });

  it('does not approve a reserved shot', async () => {
    const { client, tables } = seedWithReviewShotPlan();
    const res = await reconcileEpisode(client, EP, { force: true, reservedShots: new Set([SHOT]) });
    expect(res.approvedAssetIds).toHaveLength(0);
    expect(tables.assets.find((a) => a.id === 'sp1')?.status).toBe('REVIEW');
  });

  it('HALTs and surfaces when a plan exceeds the critic cap', async () => {
    const { client, tables } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1', metadata: {} }],
      assets: [
        storyboard([SHOT]),
        { id: 'sp1', episode_id: EP, file_type: 'SPC-shot_plan', status: 'REVIEW', version: 1, metadata: { shot_id: SHOT } },
        // Three REVISE verdicts across versions → count 3 ≥ cap.
        { id: 'r1', episode_id: EP, file_type: 'REV-shot_plan', status: 'APPROVED', version: 1, metadata: { shot_id: SHOT, verdict: 'REVISE' } },
        { id: 'r2', episode_id: EP, file_type: 'REV-shot_plan', status: 'APPROVED', version: 2, metadata: { shot_id: SHOT, verdict: 'REVISE' } },
        { id: 'r3', episode_id: EP, file_type: 'REV-shot_plan', status: 'APPROVED', version: 3, metadata: { shot_id: SHOT, verdict: 'REVISE' } },
      ],
    });
    const res = await reconcileEpisode(client, EP, { force: true, criticCap: 3 });
    expect(res.halted).toHaveLength(1);
    expect(res.approvedAssetIds).toHaveLength(0);
    expect(tables.activity_events.some((e) => e.event_type === 'reconcile/halt')).toBe(true);
  });
});
