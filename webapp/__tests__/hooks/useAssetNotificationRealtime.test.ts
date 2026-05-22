// Pure-logic unit tests for useAssetNotificationRealtime — Step 4 of the
// 2026-05-22 Supabase recovery sprint. The hook itself wraps a Supabase
// Realtime subscription; full React-Testing-Library coverage isn't worth
// the dep overhead for this one component. Instead we lock the urgent
// event-type list and the classifier predicate that decides count deltas.

import { describe, expect, test } from 'vitest';
import {
  URGENT_EVENT_TYPES,
  classifyNotificationEvent,
} from '@/hooks/useAssetNotificationRealtime-core';

describe('URGENT_EVENT_TYPES', () => {
  test('locks the canonical 3 types — guard against silent drift', () => {
    expect(URGENT_EVENT_TYPES.has('canon_extension_proposed')).toBe(true);
    expect(URGENT_EVENT_TYPES.has('decision_requested')).toBe(true);
    expect(URGENT_EVENT_TYPES.has('input_requested')).toBe(true);
  });

  test('does not include common non-urgent types', () => {
    expect(URGENT_EVENT_TYPES.has('agent_completed')).toBe(false);
    expect(URGENT_EVENT_TYPES.has('agent_started')).toBe(false);
    expect(URGENT_EVENT_TYPES.has('manual_trigger')).toBe(false);
    expect(URGENT_EVENT_TYPES.has('asset_status_changed')).toBe(false);
  });
});

describe('classifyNotificationEvent', () => {
  test('returns +1 for INSERT of an URGENT unresolved event', () => {
    expect(
      classifyNotificationEvent({
        event: 'INSERT',
        row: { event_type: 'canon_extension_proposed', resolved_at: null },
      }),
    ).toBe(1);
    expect(
      classifyNotificationEvent({
        event: 'INSERT',
        row: { event_type: 'decision_requested' },
      }),
    ).toBe(1);
  });

  test('returns 0 for INSERT that is already resolved (race)', () => {
    expect(
      classifyNotificationEvent({
        event: 'INSERT',
        row: {
          event_type: 'canon_extension_proposed',
          resolved_at: '2026-05-22T10:00:00Z',
        },
      }),
    ).toBe(0);
  });

  test('returns 0 for INSERT of a non-urgent type', () => {
    expect(
      classifyNotificationEvent({
        event: 'INSERT',
        row: { event_type: 'agent_completed', resolved_at: null },
      }),
    ).toBe(0);
  });

  test('returns -1 for UPDATE that flipped resolved_at to non-null', () => {
    expect(
      classifyNotificationEvent({
        event: 'UPDATE',
        row: {
          event_type: 'input_requested',
          resolved_at: '2026-05-22T10:00:00Z',
        },
      }),
    ).toBe(-1);
  });

  test('returns 0 for UPDATE that is still unresolved', () => {
    expect(
      classifyNotificationEvent({
        event: 'UPDATE',
        row: { event_type: 'input_requested', resolved_at: null },
      }),
    ).toBe(0);
  });

  test('returns 0 for UPDATE on a non-urgent type', () => {
    expect(
      classifyNotificationEvent({
        event: 'UPDATE',
        row: {
          event_type: 'agent_completed',
          resolved_at: '2026-05-22T10:00:00Z',
        },
      }),
    ).toBe(0);
  });

  test('returns 0 when event_type field is missing', () => {
    expect(classifyNotificationEvent({ event: 'INSERT', row: {} })).toBe(0);
    expect(classifyNotificationEvent({ event: 'UPDATE', row: {} })).toBe(0);
  });
});
