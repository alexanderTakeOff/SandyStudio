import { describe, it, expect } from 'vitest';

import {
  isActionableEventType,
  isSelfCausedNotify,
} from '@/lib/api/event-actionable';

describe('isActionableEventType', () => {
  // D17 curation (2026-07-08): the paid-wake gate is the 8 MUST-WAKE types only —
  // events that carry a decision / block / failure. See lib/api/event-actionable.ts.
  it('wakes on the 8 MUST-WAKE decision/failure events', () => {
    for (const t of [
      'agent_failed',
      'approval_revision',
      'approval_rejected',
      'blocker_raised',
      'decision_requested',
      'input_requested',
      'budget_threshold_reached',
      'canon_extension_proposed',
    ]) {
      expect(isActionableEventType(t)).toBe(true);
    }
  });

  it('rejects non-actionable types', () => {
    expect(isActionableEventType('asset_updated')).toBe(false);
    expect(isActionableEventType('whatever')).toBe(false);
  });

  it('does NOT spend a paid wake on already-happened telemetry / self-echoes', () => {
    // D17: agent_completed / episode_archived / asset_created are mechanical
    // telemetry (still injected as ambient CONTEXT); approval_granted +
    // manual_trigger were the Director's OWN clicks echoing back (the largest
    // paid category on E18). agent_started was already dropped 2026-06-25.
    for (const t of [
      'agent_started',
      'agent_completed',
      'approval_granted',
      'manual_trigger',
      'episode_archived',
      'asset_created',
    ]) {
      expect(isActionableEventType(t)).toBe(false);
    }
  });
});

describe('isSelfCausedNotify — loop-breaker for the concierge auto-react spiral', () => {
  const AI = 'exec-dir-ai'; // EXEC_DIR_AI_ACTOR_ID — Polina's auto-react principal
  const HUMAN = 'a2207ef9-d937-4b1c-8fe4-385714800000'; // UUID Director

  it('suppresses the AI principal reacting to its OWN approvals/dispatches', () => {
    expect(isSelfCausedNotify('approval_granted', AI)).toBe(true);
    expect(isSelfCausedNotify('approval_revision', AI)).toBe(true);
    expect(isSelfCausedNotify('approval_rejected', AI)).toBe(true);
    expect(isSelfCausedNotify('manual_trigger', AI)).toBe(true);
    expect(isSelfCausedNotify('approval_granted', 'EXEC-DIR-AI')).toBe(true); // case variant
  });

  it('NEVER suppresses a human Director approval (UUID actor)', () => {
    expect(isSelfCausedNotify('approval_granted', HUMAN)).toBe(false);
    expect(isSelfCausedNotify('manual_trigger', HUMAN)).toBe(false);
  });

  it('NEVER suppresses agent lifecycle events (legitimate one-time reactions)', () => {
    expect(isSelfCausedNotify('agent_completed', 'EXEC-EREF')).toBe(false);
    expect(isSelfCausedNotify('agent_failed', 'EXEC-EREF')).toBe(false);
    expect(isSelfCausedNotify('agent_started', AI)).toBe(false); // not a decision event
  });

  it('handles null/system actor as non-self', () => {
    expect(isSelfCausedNotify('approval_granted', null)).toBe(false);
    expect(isSelfCausedNotify('approval_granted', undefined)).toBe(false);
  });
});
