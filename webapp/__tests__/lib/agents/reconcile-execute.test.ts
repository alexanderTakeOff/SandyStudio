// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/agents/reconcile-execute.test.ts
// Фаза 2b — the reconciler executor (mutations + cascade).
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { makeMockSupabase } from '../../helpers/mock-supabase';
import { reconcileEpisode } from '@/lib/agents/reconcile-execute';
import { armForMode } from '@/lib/agents/production-plan';

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

function seedWithReviewShotPlan(
  ep: { governance_mode?: number | string; metadata?: Record<string, unknown> } = {},
) {
  return makeMockSupabase({
    episodes: [
      {
        id: EP,
        episode_code: 'SS-S1-E1',
        governance_mode: ep.governance_mode ?? '3',
        metadata: ep.metadata ?? {},
      },
    ],
    assets: [
      storyboard([SHOT]),
      { id: 'sp1', episode_id: EP, file_type: 'SPC-shot_plan', status: 'REVIEW', version: 1, metadata: { shot_id: SHOT } },
      { id: 'rev1', episode_id: EP, file_type: 'REV-shot_plan', status: 'APPROVED', version: 1, metadata: { shot_id: SHOT, verdict: 'PASS' } },
    ],
  });
}

describe('reconcileEpisode', () => {
  it('is a no-op when the episode is not armed and not forced', async () => {
    // mode 3 but no reconciler_armed key → isReconcilerArmed === false.
    const { client } = seedWithReviewShotPlan();
    const res = await reconcileEpisode(client, EP); // no force, unarmed
    expect(res.ran).toBe(false);
    expect(res.approvedAssetIds).toHaveLength(0);
  });

  it('auto-advances an ARMED episode WITHOUT force (arm-at-creation path)', async () => {
    for (const mode of [2, 3]) {
      const { client, tables } = seedWithReviewShotPlan({
        governance_mode: mode,
        metadata: { reconciler_armed: true },
      });
      const res = await reconcileEpisode(client, EP); // no force — the arm gate lets it through
      expect(res.ran, `mode ${mode} should run`).toBe(true);
      expect(res.approvedAssetIds).toContain('sp1');
      expect(tables.assets.find((a) => a.id === 'sp1')?.status).toBe('APPROVED');
    }
  });

  it('stays a no-op when armed but mode is 1 (MANUAL disarms)', async () => {
    const { client, tables } = seedWithReviewShotPlan({
      governance_mode: 1,
      metadata: { reconciler_armed: true },
    });
    const res = await reconcileEpisode(client, EP); // armed flag but mode 1 → gate blocks
    expect(res.ran).toBe(false);
    expect(res.approvedAssetIds).toHaveLength(0);
    expect(tables.assets.find((a) => a.id === 'sp1')?.status).toBe('REVIEW');
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

  it('does NOT auto-approve a pilot shot (reserved via episode metadata, no opts)', async () => {
    // reserved_gates defaults to include 'pilots'; SH01 is a recorded pilot.
    const { client, tables } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1', metadata: { eref_pilot_shot_ids: [SHOT] } }],
      assets: [
        storyboard([SHOT]),
        { id: 'sp1', episode_id: EP, file_type: 'SPC-shot_plan', status: 'REVIEW', version: 1, metadata: { shot_id: SHOT } },
        { id: 'rev1', episode_id: EP, file_type: 'REV-shot_plan', status: 'APPROVED', version: 1, metadata: { shot_id: SHOT, verdict: 'PASS' } },
      ],
    });
    // No opts.reservedShots → reconcileEpisode must self-derive pilots from metadata.
    const res = await reconcileEpisode(client, EP, { force: true });
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
    // Slice 4a: the HALT also escalates to the Director Inbox via blocker_raised.
    expect(tables.activity_events.some((e) => e.event_type === 'blocker_raised')).toBe(true);
  });
});

describe('armForMode (arm-at-creation / mode-switch predicate)', () => {
  it('arms only the autonomous modes 2 and 3', () => {
    expect(armForMode(2)).toBe(true);
    expect(armForMode(3)).toBe(true);
  });
  it('never arms MANUAL (mode 1) or an unknown/null mode', () => {
    expect(armForMode(1)).toBe(false);
    expect(armForMode(null)).toBe(false);
    expect(armForMode(undefined)).toBe(false);
    expect(armForMode(4)).toBe(false);
  });
});
