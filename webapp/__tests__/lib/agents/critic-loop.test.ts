// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/agents/critic-loop.test.ts
// I9 (2026-06-04): the generalized auto-bounce mechanic. The verify trio's mock
// critic path always returns PASS, so the cap/HALT coercion is NOT exercised by
// replay-pilot — this is its dedicated coverage.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import { applyCriticVerdict, mapVerdictToPlanStatus } from '@/lib/agents/critic-loop';
import { makeMockSupabase } from '../../helpers/mock-supabase';

const PLAN_ID = 'plan-1';
const EPISODE_ID = 'ep-1';
const SHOT_ID = 'SS-S01-E02-A1-SC01-SH01';

function seedPlan(version: number) {
  return makeMockSupabase({
    assets: [{ id: PLAN_ID, version, status: 'REVIEW', file_type: 'SPC-shot_plan' }],
  });
}

describe('mapVerdictToPlanStatus', () => {
  it('leaves PASS / PASS_WITH_UNCERTAINTY / HALT in REVIEW (null)', () => {
    expect(mapVerdictToPlanStatus('PASS')).toBeNull();
    expect(mapVerdictToPlanStatus('PASS_WITH_UNCERTAINTY')).toBeNull();
    expect(mapVerdictToPlanStatus('HALT')).toBeNull();
  });
  it('maps FAIL → REJECTED and REVISE / UNKNOWN → REVISION', () => {
    expect(mapVerdictToPlanStatus('FAIL')).toBe('REJECTED');
    expect(mapVerdictToPlanStatus('REVISE')).toBe('REVISION');
    expect(mapVerdictToPlanStatus('UNKNOWN')).toBe('REVISION');
  });
});

describe('applyCriticVerdict — cap enforcement', () => {
  it('REVISE under the cap flips the Plan to REVISION and does not escalate', async () => {
    const { client, tables } = seedPlan(1); // attempt 1 = 0 revisions so far
    const res = await applyCriticVerdict({
      supabase: client,
      rawVerdict: 'REVISE',
      planAssetId: PLAN_ID,
      episodeId: EPISODE_ID,
      shotId: SHOT_ID,
      actor: 'EXEC-VPREV',
      reviewKind: 'shot_plan',
    });
    expect(res.effectiveVerdict).toBe('REVISE');
    expect(res.planStatusAfter).toBe('REVISION');
    expect(res.revisionsSoFar).toBe(0);
    expect(tables.assets[0]!.status).toBe('REVISION');
    expect(tables.activity_events).toHaveLength(0);
  });

  it('REVISE at the cap is coerced to HALT — Plan stays REVIEW, Director escalation emitted', async () => {
    const { client, tables } = seedPlan(3); // attempt 3 = 2 revisions so far = cap
    const res = await applyCriticVerdict({
      supabase: client,
      rawVerdict: 'REVISE',
      planAssetId: PLAN_ID,
      episodeId: EPISODE_ID,
      shotId: SHOT_ID,
      actor: 'EXEC-VPREV',
      reviewKind: 'shot_plan',
    });
    expect(res.effectiveVerdict).toBe('HALT');
    expect(res.planStatusAfter).toBeNull();
    expect(res.revisionsSoFar).toBe(2);
    // Plan NOT flipped — left in REVIEW for the Director.
    expect(tables.assets[0]!.status).toBe('REVIEW');
    // Exactly one escalation event in the Director Inbox.
    expect(tables.activity_events).toHaveLength(1);
    const ev = tables.activity_events[0]!;
    expect(ev.event_type).toBe('blocker_raised'); // Director-actionable → Inbox
    expect((ev.metadata as { reason?: string }).reason).toBe('cap_reached');
  });

  // 2026-07-19 — UNKNOWN bounces the plan to REVISION exactly like REVISE
  // (see mapVerdictToPlanStatus above), but only the literal 'REVISE' was
  // cap-coerced. So the one verdict that means "the critic did not answer"
  // could re-author forever.
  it('UNKNOWN under the cap bounces the Plan to REVISION (unchanged)', async () => {
    const { client, tables } = seedPlan(1);
    const res = await applyCriticVerdict({
      supabase: client,
      rawVerdict: 'UNKNOWN',
      planAssetId: PLAN_ID,
      episodeId: EPISODE_ID,
      shotId: SHOT_ID,
      actor: 'EXEC-VPREV',
      reviewKind: 'shot_plan',
    });
    expect(res.effectiveVerdict).toBe('UNKNOWN');
    expect(tables.assets[0]!.status).toBe('REVISION');
  });

  it('UNKNOWN at the cap is coerced to HALT — no infinite bounce', async () => {
    const { client, tables } = seedPlan(3); // 2 revisions so far = cap
    const res = await applyCriticVerdict({
      supabase: client,
      rawVerdict: 'UNKNOWN',
      planAssetId: PLAN_ID,
      episodeId: EPISODE_ID,
      shotId: SHOT_ID,
      actor: 'EXEC-VPREV',
      reviewKind: 'shot_plan',
    });
    expect(res.effectiveVerdict).toBe('HALT');
    expect(res.planStatusAfter).toBeNull();
    expect(tables.assets[0]!.status).toBe('REVIEW');
    expect(tables.activity_events).toHaveLength(1);
    expect(tables.activity_events[0]!.event_type).toBe('blocker_raised');
  });

  it('PASS leaves the Plan in REVIEW and does not escalate', async () => {
    const { client, tables } = seedPlan(2);
    const res = await applyCriticVerdict({
      supabase: client,
      rawVerdict: 'PASS',
      planAssetId: PLAN_ID,
      episodeId: EPISODE_ID,
      shotId: SHOT_ID,
      actor: 'EXEC-EPREV',
      reviewKind: 'ref_plan',
    });
    expect(res.effectiveVerdict).toBe('PASS');
    expect(res.planStatusAfter).toBeNull();
    expect(tables.assets[0]!.status).toBe('REVIEW');
    expect(tables.activity_events).toHaveLength(0);
  });

  it('PASS on a DRAFT plan lifts it to REVIEW (TD-76 recovery, F3 2026-06-12)', async () => {
    const { client, tables } = makeMockSupabase({
      assets: [{ id: PLAN_ID, version: 4, status: 'DRAFT', file_type: 'SPC-shot_plan' }],
    });
    const res = await applyCriticVerdict({
      supabase: client,
      rawVerdict: 'PASS',
      planAssetId: PLAN_ID,
      episodeId: EPISODE_ID,
      shotId: SHOT_ID,
      actor: 'EXEC-VPREV',
      reviewKind: 'shot_plan',
    });
    expect(res.effectiveVerdict).toBe('PASS');
    expect(res.planStatusAfter).toBe('REVIEW');
    expect(tables.assets[0]!.status).toBe('REVIEW');
  });

  it('HALT on a DRAFT plan also lifts it to REVIEW so the Director can act', async () => {
    const { client, tables } = makeMockSupabase({
      assets: [{ id: PLAN_ID, version: 5, status: 'DRAFT', file_type: 'SPC-shot_plan' }],
    });
    const res = await applyCriticVerdict({
      supabase: client,
      rawVerdict: 'HALT',
      planAssetId: PLAN_ID,
      episodeId: EPISODE_ID,
      shotId: SHOT_ID,
      actor: 'EXEC-VPREV',
      reviewKind: 'shot_plan',
    });
    expect(res.effectiveVerdict).toBe('HALT');
    expect(tables.assets[0]!.status).toBe('REVIEW');
    expect(tables.activity_events).toHaveLength(1);
  });

  it('PASS never demotes an APPROVED plan', async () => {
    const { client, tables } = makeMockSupabase({
      assets: [{ id: PLAN_ID, version: 2, status: 'APPROVED', file_type: 'SPC-shot_plan' }],
    });
    const res = await applyCriticVerdict({
      supabase: client,
      rawVerdict: 'PASS',
      planAssetId: PLAN_ID,
      episodeId: EPISODE_ID,
      shotId: SHOT_ID,
      actor: 'EXEC-VPREV',
      reviewKind: 'shot_plan',
    });
    expect(res.planStatusAfter).toBeNull();
    expect(tables.assets[0]!.status).toBe('APPROVED');
  });

  it('FAIL flips the Plan to REJECTED', async () => {
    const { client, tables } = seedPlan(1);
    const res = await applyCriticVerdict({
      supabase: client,
      rawVerdict: 'FAIL',
      planAssetId: PLAN_ID,
      episodeId: EPISODE_ID,
      shotId: SHOT_ID,
      actor: 'EXEC-VPREV',
      reviewKind: 'shot_plan',
    });
    expect(res.effectiveVerdict).toBe('FAIL');
    expect(res.planStatusAfter).toBe('REJECTED');
    expect(tables.assets[0]!.status).toBe('REJECTED');
  });
});
