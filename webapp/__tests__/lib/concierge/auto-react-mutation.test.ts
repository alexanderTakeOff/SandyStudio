// E13 (2026-07-01) — unit tests for the auto-react / nudge mutating-tool gate.
//
// Contract (decideAutoReactMutation):
//   - Hard limits (skill-canon, triggerAgent EXEC-PUB) → blocked in EVERY mode,
//     even under an authorized nudge.
//   - Bold modes ('3'/'4') → mutations run (unchanged q9 behavior).
//   - Authorized-principal nudge in a STRICT mode ('1'/'2'/'2.5') → OPERATIONAL
//     mutations run, but creative gate approvals (approveAsset) stay Director-only.
//   - Strict mode WITHOUT an authorized nudge → all mutations blocked (unchanged).
//
// This is the code that lets Тео drive Polina through the ~4 operational dispatch
// points while the Director keeps every creative APPROVE (plan Step 0).

import { describe, expect, test } from 'vitest';
import {
  decideAutoReactMutation,
  CREATIVE_APPROVAL_TOOL_NAMES,
} from '@/lib/concierge/approval-check';
import type { ConciergeMode } from '@/lib/concierge/types';

const STRICT_MODES: ConciergeMode[] = ['1', '2', '2.5'];
const BOLD_MODES: ConciergeMode[] = ['3', '4'];

describe('decideAutoReactMutation — authorized nudge unblocks OPERATIONAL mutations in strict modes', () => {
  for (const mode of STRICT_MODES) {
    test(`Mode ${mode}: authorized nudge PERMITS an operational mutation (createEpisode)`, () => {
      const d = decideAutoReactMutation({
        toolName: 'createEpisode',
        mode,
        authorizedOperational: true,
      });
      expect(d.permitted).toBe(true);
    });

    test(`Mode ${mode}: authorized nudge PERMITS triggerAgent for a non-publish agent`, () => {
      const d = decideAutoReactMutation({
        toolName: 'triggerAgent',
        mode,
        authorizedOperational: true,
        args: { agentCode: 'EXEC-SW' },
      });
      expect(d.permitted).toBe(true);
    });
  }
});

describe('decideAutoReactMutation — creative gate approvals stay Director-only under a nudge', () => {
  for (const mode of STRICT_MODES) {
    test(`Mode ${mode}: authorized nudge BLOCKS approveAsset (gate stays with Director)`, () => {
      const d = decideAutoReactMutation({
        toolName: 'approveAsset',
        mode,
        authorizedOperational: true,
      });
      expect(d.permitted).toBe(false);
      if (!d.permitted) {
        expect(d.code).toBe('auto_react_mutating_blocked');
        expect(d.reason).toMatch(/creative gate approval/i);
      }
    });
  }

  test('approveAsset is classified as a creative gate approval', () => {
    expect(CREATIVE_APPROVAL_TOOL_NAMES.has('approveAsset')).toBe(true);
    // requestRevision loops the gate, it does NOT pass it → not protected here.
    expect(CREATIVE_APPROVAL_TOOL_NAMES.has('requestRevision')).toBe(false);
  });
});

describe('decideAutoReactMutation — no regression for the unauthorized strict path', () => {
  for (const mode of STRICT_MODES) {
    test(`Mode ${mode}: UNauthorized nudge BLOCKS an operational mutation`, () => {
      const d = decideAutoReactMutation({
        toolName: 'createEpisode',
        mode,
        authorizedOperational: false,
      });
      expect(d.permitted).toBe(false);
      if (!d.permitted) expect(d.code).toBe('auto_react_mutating_blocked');
    });

    test(`Mode ${mode}: missing authorizedOperational is treated as unauthorized`, () => {
      const d = decideAutoReactMutation({ toolName: 'castEpisode', mode });
      expect(d.permitted).toBe(false);
    });
  }
});

describe('decideAutoReactMutation — bold modes still run mutations (q9 unchanged)', () => {
  for (const mode of BOLD_MODES) {
    test(`Mode ${mode}: approveAsset auto-runs (bold delegation)`, () => {
      const d = decideAutoReactMutation({ toolName: 'approveAsset', mode });
      expect(d.permitted).toBe(true);
    });
  }
});

describe('decideAutoReactMutation — hard limits blocked in EVERY mode, even authorized', () => {
  const ALL: ConciergeMode[] = ['1', '2', '2.5', '3', '4'];
  for (const mode of ALL) {
    test(`Mode ${mode}: proposeSkill (skill-canon) blocked even with an authorized nudge`, () => {
      const d = decideAutoReactMutation({
        toolName: 'proposeSkill',
        mode,
        authorizedOperational: true,
      });
      expect(d.permitted).toBe(false);
      if (!d.permitted) expect(d.code).toBe('auto_react_hard_limit_blocked');
    });

    test(`Mode ${mode}: triggerAgent EXEC-PUB (publish) blocked even with an authorized nudge`, () => {
      const d = decideAutoReactMutation({
        toolName: 'triggerAgent',
        mode,
        authorizedOperational: true,
        args: { agentCode: 'EXEC-PUB' },
      });
      expect(d.permitted).toBe(false);
      if (!d.permitted) expect(d.code).toBe('auto_react_hard_limit_blocked');
    });
  }
});
