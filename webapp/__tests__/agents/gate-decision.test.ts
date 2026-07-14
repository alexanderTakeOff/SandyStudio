import { describe, it, expect } from 'vitest';

import { GATE_CLASS, decideGate, recordGateDecision } from '@/lib/agents/gate-decision';
import { makeMockSupabase } from '../helpers/mock-supabase';

describe('gate-decision — decideGate (Phase 1: autonomy off, Mode-4 removed)', () => {
  it('every governance mode → require_human (decided_by=human)', () => {
    for (const mode of [1, 2, 3]) {
      const d = decideGate({ agentId: 'EXEC-SB', governanceMode: mode });
      expect(d).toMatchObject({ autonomous: false, decision: 'require_human', decidedBy: 'human' });
    }
  });

  it('null / missing mode → not autonomous', () => {
    expect(decideGate({ agentId: 'EXEC-SW', governanceMode: null }).autonomous).toBe(false);
    expect(decideGate({ agentId: 'EXEC-SW' }).autonomous).toBe(false);
  });

  it('carries the agent gate_class', () => {
    expect(decideGate({ agentId: 'EXEC-PUB', governanceMode: 1 }).gateClass).toBe('hard_limit');
    expect(decideGate({ agentId: 'EXEC-STITCH', governanceMode: 1 }).gateClass).toBe('mechanical');
    expect(decideGate({ agentId: 'EXEC-SW', governanceMode: 1 }).gateClass).toBe('creative');
  });
});

describe('gate-decision — GATE_CLASS taxonomy', () => {
  it('classifies every agent (no unclassified gate)', () => {
    for (const [agent, cls] of Object.entries(GATE_CLASS)) {
      expect(['mechanical', 'creative', 'hard_limit'], `${agent}`).toContain(cls);
    }
  });

  it('PUB is the publish hard-limit', () => {
    expect(GATE_CLASS['EXEC-PUB']).toBe('hard_limit');
  });
});

describe('gate-decision — recordGateDecision (writer)', () => {
  it('writes one row with the decision fields', async () => {
    const { client, tables } = makeMockSupabase();
    await recordGateDecision(client, {
      episodeId: 'ep-1',
      shotId: 'S1-E13-SH03',
      agentId: 'EXEC-VGEN',
      governanceMode: 1,
      decision: decideGate({ agentId: 'EXEC-VGEN', governanceMode: 1 }),
    });
    expect(tables.gate_decision_log).toHaveLength(1);
    expect(tables.gate_decision_log[0]).toMatchObject({
      episode_id: 'ep-1',
      shot_id: 'S1-E13-SH03',
      gate: 'EXEC-VGEN',
      gate_class: 'creative',
      autonomous: false,
      decision: 'require_human',
      decided_by: 'human',
    });
  });

  it('never throws even if the table is missing from the mock store', async () => {
    const { client } = makeMockSupabase();
    await expect(
      recordGateDecision(client, {
        episodeId: 'ep-1',
        agentId: 'EXEC-SB',
        decision: decideGate({ agentId: 'EXEC-SB', governanceMode: 3 }),
      }),
    ).resolves.toBeUndefined();
  });
});
