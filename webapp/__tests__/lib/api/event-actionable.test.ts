import { describe, it, expect } from 'vitest';

import {
  isActionableEventType,
  isSelfCausedNotify,
} from '@/lib/api/event-actionable';

describe('isActionableEventType', () => {
  it('recognises pipeline + decision events', () => {
    expect(isActionableEventType('agent_completed')).toBe(true);
    expect(isActionableEventType('approval_granted')).toBe(true);
    expect(isActionableEventType('manual_trigger')).toBe(true);
  });

  it('rejects non-actionable types', () => {
    expect(isActionableEventType('asset_updated')).toBe(false);
    expect(isActionableEventType('whatever')).toBe(false);
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
