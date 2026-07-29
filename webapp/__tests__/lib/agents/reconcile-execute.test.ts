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

  it('bounces an off-model ref image (on_model FAIL): keeps REVIEW, escalates to the Director', async () => {
    const { client, tables } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1', metadata: {} }],
      assets: [
        storyboard([SHOT]),
        {
          id: 'img1',
          episode_id: EP,
          file_type: 'IMG-episode_ref_sh01',
          status: 'REVIEW',
          version: 1,
          metadata: { shot_reference: { shot_id: SHOT, on_model: { verdict: 'FAIL' } } },
        },
      ],
    });
    const res = await reconcileEpisode(client, EP, { force: true });
    expect(res.bounced).toHaveLength(1);
    expect(res.bounced[0]).toMatchObject({ shotId: SHOT, stage: 'ref_image' });
    // Not approved — the cell stays in REVIEW.
    expect(res.approvedAssetIds).not.toContain('img1');
    expect(tables.assets.find((a) => a.id === 'img1')?.status).toBe('REVIEW');
    // A bounce event + a Director escalation both fired.
    expect(tables.activity_events.some((e) => e.event_type === 'reconcile/bounce')).toBe(true);
    expect(tables.activity_events.some((e) => e.event_type === 'blocker_raised')).toBe(true);
  });

  it('re-authors a shot_plan stuck in REVISION (critic REVISE) then is idempotent', async () => {
    const { client, tables } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1', metadata: {} }],
      assets: [
        storyboard([SHOT]),
        { id: 'sp1', episode_id: EP, file_type: 'SPC-shot_plan', status: 'REVISION', version: 1, metadata: { shot_id: SHOT } },
      ],
    });
    const res = await reconcileEpisode(client, EP, { force: true });
    expect(res.reauthored).toHaveLength(1);
    expect(res.reauthored[0]).toMatchObject({ shotId: SHOT, stage: 'shot_plan' });
    // fired the Animator re-author + logged the reconcile/reauthor audit row
    expect(res.events.some((e) => e.name === 'sandystudio/exec-vanim/plan')).toBe(true);
    expect(tables.activity_events.some((e) => e.event_type === 'reconcile/reauthor')).toBe(true);
    // Idempotent: a second pass over the STILL-REVISION plan does NOT re-fire it.
    const again = await reconcileEpisode(client, EP, { force: true });
    expect(again.reauthored).toHaveLength(0);
    expect(again.events.some((e) => e.name === 'sandystudio/exec-vanim/plan')).toBe(false);
  });

  // E33 SH02 — the Director rejected the video, the Animator re-authored the plan,
  // the plan was approved, and the shot then stood still forever: the REVISION cell
  // belonged to no branch of the reconciler.
  it('re-renders a REJECTED video from the APPROVED plan that supersedes it', async () => {
    const { client, tables } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1', metadata: {} }],
      assets: [
        storyboard([SHOT]),
        { id: 'sp1', episode_id: EP, file_type: 'SPC-shot_plan', status: 'INVALIDATED', version: 1, metadata: { shot_id: SHOT } },
        { id: 'sp2', episode_id: EP, file_type: 'SPC-shot_plan', status: 'APPROVED', version: 2, metadata: { shot_id: SHOT } },
        // the rejected render was built from the OLD plan (sp1)
        { id: 'vid1', episode_id: EP, file_type: 'VID-shot', status: 'REVISION', version: 1, metadata: { shot_id: SHOT, plan_asset_id: 'sp1' } },
      ],
    });
    const res = await reconcileEpisode(client, EP, { force: true });
    expect(
      res.events.some(
        (e) => e.name === 'sandystudio/exec-vgen/single-shot' && e.data.planAssetId === 'sp2',
      ),
    ).toBe(true);
    expect(tables.activity_events.some((e) => e.event_type === 'reconcile/refire')).toBe(true);
  });

  it('refuses to re-roll the very plan that produced the rejected render', async () => {
    const { client } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1', metadata: {} }],
      assets: [
        storyboard([SHOT]),
        { id: 'sp1', episode_id: EP, file_type: 'SPC-shot_plan', status: 'APPROVED', version: 1, metadata: { shot_id: SHOT } },
        { id: 'vid1', episode_id: EP, file_type: 'VID-shot', status: 'REVISION', version: 1, metadata: { shot_id: SHOT, plan_asset_id: 'sp1' } },
      ],
    });
    const res = await reconcileEpisode(client, EP, { force: true });
    // The intent IS planned (the cell has an owner now) — the executor's per-Plan
    // guard is what suppresses the spend, not an absent decision.
    expect(res.actions).toContainEqual(
      expect.objectContaining({ kind: 'refire', stage: 'video', assetId: 'sp1' }),
    );
    expect(res.events.some((e) => e.name === 'sandystudio/exec-vgen/single-shot')).toBe(false);
  });

  it('auto-approves an on-model ref image (on_model PASS) in Mode 3 — gate lets good ones through', async () => {
    const { client, tables } = makeMockSupabase({
      episodes: [{ id: EP, episode_code: 'SS-S1-E1', governance_mode: '3', metadata: {} }],
      assets: [
        storyboard([SHOT]),
        {
          id: 'img1',
          episode_id: EP,
          file_type: 'IMG-episode_ref_sh01',
          status: 'REVIEW',
          version: 1,
          metadata: { shot_reference: { shot_id: SHOT, on_model: { verdict: 'PASS' } } },
        },
      ],
    });
    const res = await reconcileEpisode(client, EP, { force: true });
    expect(res.bounced).toHaveLength(0);
    expect(res.approvedAssetIds).toContain('img1');
    expect(tables.assets.find((a) => a.id === 'img1')?.status).toBe('APPROVED');
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
