import { describe, it, expect } from 'vitest';

import {
  GATE_CLASS,
  decideGate,
  resolveGateDecision,
  recordGateDecision,
} from '@/lib/agents/gate-decision';
import { makeMockSupabase } from '../helpers/mock-supabase';

describe('gate-decision — resolveGateDecision (mode-aware brain)', () => {
  it('hard_limit → require_human in every mode', () => {
    for (const mode of [1, 2, 3]) {
      expect(resolveGateDecision('hard_limit', mode)).toBe('require_human');
    }
  });

  it('mechanical → advance in Mode 2/3, require_human in Mode 1', () => {
    expect(resolveGateDecision('mechanical', 1)).toBe('require_human');
    expect(resolveGateDecision('mechanical', 2)).toBe('advance');
    expect(resolveGateDecision('mechanical', 3)).toBe('advance');
  });

  it('creative → advance ONLY in Mode 3 (delegated), else require_human', () => {
    expect(resolveGateDecision('creative', 1)).toBe('require_human');
    expect(resolveGateDecision('creative', 2)).toBe('require_human');
    expect(resolveGateDecision('creative', 3)).toBe('advance');
  });

  it('null / missing mode defaults to Mode 1 (require_human)', () => {
    expect(resolveGateDecision('mechanical', null)).toBe('require_human');
    expect(resolveGateDecision('creative', undefined)).toBe('require_human');
  });
});

describe('gate-decision — decideGate (agent GATE_CLASS × mode)', () => {
  it('creative agent (EXEC-SB) advances only in Mode 3', () => {
    expect(decideGate({ agentId: 'EXEC-SB', governanceMode: 1 })).toMatchObject({
      autonomous: false,
      decision: 'require_human',
      decidedBy: 'human',
    });
    expect(decideGate({ agentId: 'EXEC-SB', governanceMode: 2 }).decision).toBe('require_human');
    expect(decideGate({ agentId: 'EXEC-SB', governanceMode: 3 })).toMatchObject({
      autonomous: true,
      decision: 'advance',
      decidedBy: 'factory',
    });
  });

  it('mechanical agent (EXEC-STITCH) advances in Mode 2 and 3', () => {
    expect(decideGate({ agentId: 'EXEC-STITCH', governanceMode: 1 }).decision).toBe('require_human');
    expect(decideGate({ agentId: 'EXEC-STITCH', governanceMode: 2 }).decision).toBe('advance');
    expect(decideGate({ agentId: 'EXEC-STITCH', governanceMode: 3 }).decision).toBe('advance');
  });

  it('hard_limit agent (EXEC-PUB) never auto-advances', () => {
    for (const mode of [1, 2, 3]) {
      expect(decideGate({ agentId: 'EXEC-PUB', governanceMode: mode }).autonomous).toBe(false);
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
