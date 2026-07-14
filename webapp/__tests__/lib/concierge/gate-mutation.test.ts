// q9 (2026-06-09) — unit tests for the mode-aware mutating-tool gate.
//
// Contract:
//   - Mode '1' (MANUAL) / '2' / '2.5': non-hard-limit mutations STILL require
//     verbal approval (current behavior, unchanged).
//   - Mode '3' (DELEGATED) / '4' (AUTOTEST): non-hard-limit mutations auto-pass
//     WITHOUT a fresh Director token.
//   - Hard-limit tools (skill-canon writes, triggerAgent EXEC-PUB) are
//     Director-gated in EVERY mode, including bold modes.

import { describe, expect, test } from 'vitest';
import { gateMutation, isHardLimitTool } from '@/lib/concierge/approval-check';
import type { ConciergeMode, ConciergeTurnRow } from '@/lib/concierge/types';

function directorTurn(content: string, i = 0): ConciergeTurnRow {
  return {
    id: `turn-${i}`,
    thread_id: 'thread-1',
    role: 'director',
    event_type: 'message',
    content,
    metadata: {},
    token_count: null,
    created_at: new Date(2026, 5, 9, 12, 0, i).toISOString(),
  };
}

const NO_APPROVAL: ConciergeTurnRow[] = [directorTurn('что там по кадру?')];
const WITH_APPROVAL: ConciergeTurnRow[] = [directorTurn('одобряю, поехали')];

describe('gateMutation — strict modes require verbal approval', () => {
  const strictModes: ConciergeMode[] = ['1', '2', '2.5'];
  for (const mode of strictModes) {
    test(`Mode ${mode} BLOCKS a non-hard-limit mutation without approval`, () => {
      const out = gateMutation('approveAsset', { mode, turns: NO_APPROVAL });
      expect(out.approved).toBe(false);
    });
    test(`Mode ${mode} ALLOWS a non-hard-limit mutation WITH approval`, () => {
      const out = gateMutation('approveAsset', { mode, turns: WITH_APPROVAL });
      expect(out.approved).toBe(true);
    });
  }
});

describe('gateMutation — bold modes auto-pass non-hard-limit mutations', () => {
  const boldModes: ConciergeMode[] = ['3'];
  for (const mode of boldModes) {
    test(`Mode ${mode} AUTO-ALLOWS a non-hard-limit mutation with NO approval`, () => {
      const out = gateMutation('approveAsset', { mode, turns: NO_APPROVAL });
      expect(out.approved).toBe(true);
      expect(out.reason).toMatch(/bold/i);
    });

    test(`Mode ${mode} AUTO-ALLOWS triggerAgent for a non-publish agent`, () => {
      const out = gateMutation('triggerAgent', {
        mode,
        turns: NO_APPROVAL,
        args: { agentCode: 'EXEC-SW' },
      });
      expect(out.approved).toBe(true);
    });
  }
});

describe('gateMutation — hard limits stay Director-only in EVERY mode', () => {
  const allModes: ConciergeMode[] = ['1', '2', '2.5', '3'];

  for (const mode of allModes) {
    test(`Mode ${mode} BLOCKS skill-canon write (proposeSkill) without approval`, () => {
      const out = gateMutation('proposeSkill', { mode, turns: NO_APPROVAL });
      expect(out.approved).toBe(false);
    });

    test(`Mode ${mode} BLOCKS triggerAgent EXEC-PUB (publish) without approval`, () => {
      const out = gateMutation('triggerAgent', {
        mode,
        turns: NO_APPROVAL,
        args: { agentCode: 'EXEC-PUB' },
      });
      expect(out.approved).toBe(false);
    });
  }

  test('hard-limit blocked even in bold Mode 3 despite delegation', () => {
    const out = gateMutation('approveSkill', { mode: '3', turns: NO_APPROVAL });
    expect(out.approved).toBe(false);
    expect(out.reason).toMatch(/hard limit/i);
  });

  test('hard limit WITH verbal approval still passes (Director consented)', () => {
    const out = gateMutation('updateSkill', { mode: '3', turns: WITH_APPROVAL });
    expect(out.approved).toBe(true);
  });
});

describe('isHardLimitTool classification', () => {
  test('skill-canon writes are hard limits', () => {
    expect(isHardLimitTool('proposeSkill')).toBe(true);
    expect(isHardLimitTool('updateSkill')).toBe(true);
    expect(isHardLimitTool('approveSkill')).toBe(true);
  });

  test('triggerAgent is a hard limit ONLY for EXEC-PUB', () => {
    expect(isHardLimitTool('triggerAgent', { agentCode: 'EXEC-PUB' })).toBe(true);
    expect(isHardLimitTool('triggerAgent', { agentCode: 'EXEC-SW' })).toBe(false);
    // No args → cannot prove publish → treated as non-hard-limit (the route +
    // gateMutation re-check with real args; the EXEC-PUB string check is exact).
    expect(isHardLimitTool('triggerAgent')).toBe(false);
  });

  test('ordinary mutations are not hard limits', () => {
    expect(isHardLimitTool('approveAsset')).toBe(false);
    expect(isHardLimitTool('requestRevision')).toBe(false);
    expect(isHardLimitTool('regenerateShotPlan')).toBe(false);
  });
});
