import { describe, it, expect } from 'vitest';

import {
  BLOCKER_EVENT_TYPES,
  CLEARABLE_EVENT_TYPES,
  eventTypesForFilter,
  isClearableInboxItem,
} from '@/lib/api/inbox-clear';

describe('eventTypesForFilter (Clear inbox scope)', () => {
  it('sweeps every notification type for `all` and `non_visual`', () => {
    expect(eventTypesForFilter('all')).toEqual(CLEARABLE_EVENT_TYPES);
    expect(eventTypesForFilter('non_visual')).toEqual(CLEARABLE_EVENT_TYPES);
  });

  it('narrows to blocker types for the `blockers` pill', () => {
    expect(eventTypesForFilter('blockers')).toEqual(BLOCKER_EVENT_TYPES);
    expect(eventTypesForFilter('blockers')).not.toContain('decision_requested');
  });

  it('sweeps nothing for `visual` — event rows are never visual', () => {
    expect(eventTypesForFilter('visual')).toEqual([]);
  });

  it('never includes canon extension proposals — their payload lives in the event', () => {
    for (const filter of ['all', 'non_visual', 'blockers', 'visual'] as const) {
      expect(eventTypesForFilter(filter)).not.toContain('canon_extension_proposed');
    }
  });
});

describe('isClearableInboxItem', () => {
  it('clears plain notification events', () => {
    expect(
      isClearableInboxItem({
        id: 'event:11111111-1111-1111-1111-111111111111',
        metadata: { event_type: 'input_requested' },
      }),
    ).toBe(true);
    expect(
      isClearableInboxItem({
        id: 'event:22222222-2222-2222-2222-222222222222',
        metadata: { event_type: 'blocker_raised' },
      }),
    ).toBe(true);
  });

  it('never clears an asset awaiting approval', () => {
    expect(
      isClearableInboxItem({
        id: 'asset:33333333-3333-3333-3333-333333333333',
        metadata: { file_type: 'IMG' } as never,
      }),
    ).toBe(false);
  });

  it('never clears a Bible extension proposal', () => {
    expect(
      isClearableInboxItem({
        id: 'event:44444444-4444-4444-4444-444444444444',
        metadata: { event_type: 'canon_extension_proposed' },
      }),
    ).toBe(false);
  });

  it('treats an event row with no declared type as a notification', () => {
    expect(isClearableInboxItem({ id: 'event:abc' })).toBe(true);
    expect(isClearableInboxItem({ id: 'event:abc', metadata: null })).toBe(true);
  });
});
