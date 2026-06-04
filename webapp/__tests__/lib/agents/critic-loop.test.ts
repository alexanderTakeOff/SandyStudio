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
    expect(ev.event_type).toBe('revision_requested');
    expect((ev.metadata as { reason?: string }).reason).toBe('cap_reached');
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
