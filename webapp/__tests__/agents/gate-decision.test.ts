import { describe, it, expect } from 'vitest';

import { GATE_CLASS, decideGate, recordGateDecision } from '@/lib/agents/gate-decision';
import { makeMockSupabase } from '../helpers/mock-supabase';

describe('gate-decision — decideGate (behaviour-preserving)', () => {
  it('Mode 4 → autonomous advance (decided_by=factory)', () => {
    const d = decideGate({ agentId: 'EXEC-SB', governanceMode: 4 });
    expect(d).toMatchObject({ autonomous: true, decision: 'advance', decidedBy: 'factory' });
  });

  it('Mode 1 → require_human (decided_by=human)', () => {
    const d = decideGate({ agentId: 'EXEC-SB', governanceMode: 1 });
    expect(d).toMatchObject({ autonomous: false, decision: 'require_human', decidedBy: 'human' });
  });

  it('Modes 2 / 2.5 / 3 are all NOT autonomous (only Mode 4 is)', () => {
    for (const mode of [2, 3]) {
      expect(decideGate({ agentId: 'EXEC-EREF', governanceMode: mode }).autonomous).toBe(false);
    }
  });

  it('AUTOTEST sentinel (next-events path) is the Mode-4 proxy', () => {
    expect(decideGate({ agentId: 'EXEC-SB', directorUserId: 'AUTOTEST' }).autonomous).toBe(true);
    expect(decideGate({ agentId: 'EXEC-SB', directorUserId: 'some-uuid' }).autonomous).toBe(false);
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
        decision: decideGate({ agentId: 'EXEC-SB', governanceMode: 4 }),
      }),
    ).resolves.toBeUndefined();
  });
});
