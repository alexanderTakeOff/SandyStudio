// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/api/blocker-escalation.test.ts
// The failure-spine's single escalation vessel — raiseBlockerOnce dedup contract.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { makeMockSupabase } from '../../helpers/mock-supabase';
import { raiseBlockerOnce } from '@/lib/api/blocker-escalation';

const EP = 'ep-1';

function args(overrides: Partial<Parameters<typeof raiseBlockerOnce>[1]> = {}) {
  return {
    episodeId: EP,
    stage: 'shot_plan_cap_halt',
    shotId: 'SH01',
    assetId: 'plan-1',
    actor: 'EXEC-VPREV',
    title: 'HALT — needs Director',
    ...overrides,
  };
}

describe('raiseBlockerOnce', () => {
  it('raises a blocker_raised with a stable blocker_key when none exists', async () => {
    const { client, tables } = makeMockSupabase({ activity_events: [] });
    const outcome = await raiseBlockerOnce(client, args());
    expect(outcome).toBe('raised');
    expect(tables.activity_events).toHaveLength(1);
    const ev = tables.activity_events[0]!;
    expect(ev.event_type).toBe('blocker_raised');
    expect(ev.severity).toBe('error');
    expect((ev.metadata as { blocker_key?: string }).blocker_key).toBe('shot_plan_cap_halt:SH01');
  });

  it('dedups when an UNRESOLVED blocker with the same key already exists', async () => {
    const { client, tables } = makeMockSupabase({
      activity_events: [
        {
          id: 'existing',
          event_type: 'blocker_raised',
          episode_id: EP,
          resolved_at: null,
          metadata: { blocker_key: 'shot_plan_cap_halt:SH01' },
        },
      ],
    });
    const outcome = await raiseBlockerOnce(client, args());
    expect(outcome).toBe('deduped');
    expect(tables.activity_events).toHaveLength(1); // no second row
  });

  it('re-raises when the prior blocker with the same key is RESOLVED', async () => {
    const { client, tables } = makeMockSupabase({
      activity_events: [
        {
          id: 'resolved',
          event_type: 'blocker_raised',
          episode_id: EP,
          resolved_at: '2026-07-16T00:00:00Z',
          metadata: { blocker_key: 'shot_plan_cap_halt:SH01' },
        },
      ],
    });
    const outcome = await raiseBlockerOnce(client, args());
    expect(outcome).toBe('raised');
    expect(tables.activity_events).toHaveLength(2);
  });

  it('raises independently for a DIFFERENT shot (distinct key)', async () => {
    const { client, tables } = makeMockSupabase({
      activity_events: [
        {
          id: 'existing',
          event_type: 'blocker_raised',
          episode_id: EP,
          resolved_at: null,
          metadata: { blocker_key: 'shot_plan_cap_halt:SH01' },
        },
      ],
    });
    const outcome = await raiseBlockerOnce(client, args({ shotId: 'SH02' }));
    expect(outcome).toBe('raised');
    expect(tables.activity_events).toHaveLength(2);
  });
});
