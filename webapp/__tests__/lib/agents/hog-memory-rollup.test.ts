// Phase 4b — pure rollup aggregation for the HoG analytical memory.
// The rollup law under test: each period folds ONLY the previous rollup + the
// rows since it; refuted slugs accumulate forever (анти-повтор); a hypothesis
// confirmed this week surfaces exactly once in confirmed_this_week.

import { describe, expect, test } from 'vitest';
import {
  aggregateWeekly,
  aggregateMonthly,
  type MemoryRow,
} from '@/lib/agents/hog-memory-rollup';

const W = { start: '2026-07-20', end: '2026-07-27' };

function row(partial: Partial<MemoryRow> & { kind: string; created_at: string }): MemoryRow {
  return { status: null, unlock_date: null, payload: {}, ...partial };
}

describe('aggregateWeekly', () => {
  test('empty week, no previous rollup → empty but well-formed payload', () => {
    const p = aggregateWeekly(null, [], W);
    expect(p.open).toEqual([]);
    expect(p.confirmed).toEqual([]);
    expect(p.refuted).toEqual([]);
    expect(p.medians).toEqual({ completion: null, views: null, days: 0 });
  });

  test('latest hypothesis row per slug wins (PENDING → CONFIRMED)', () => {
    const rows = [
      row({ kind: 'hypothesis', created_at: '2026-07-21T10:00:00Z', status: 'PENDING', payload: { slug: 'hook-first-frame', text: 'Хук в 1-м кадре' } }),
      row({ kind: 'hypothesis', created_at: '2026-07-25T10:00:00Z', status: 'CONFIRMED', payload: { slug: 'hook-first-frame' } }),
    ];
    const p = aggregateWeekly(null, rows, W);
    expect(p.open).toEqual([]);
    expect(p.confirmed).toEqual(['hook-first-frame']);
    expect(p.confirmed_this_week.map((h) => h.slug)).toEqual(['hook-first-frame']);
    // Text survives from the first append even when the status update omits it.
    expect(p.confirmed_this_week[0]!.text).toBe('Хук в 1-м кадре');
  });

  test('already-confirmed slugs do NOT re-enter confirmed_this_week', () => {
    const prev = { confirmed: ['hook-first-frame'], refuted: [], open: [] };
    const rows = [
      row({ kind: 'hypothesis', created_at: '2026-07-22T10:00:00Z', status: 'CONFIRMED', payload: { slug: 'hook-first-frame' } }),
    ];
    const p = aggregateWeekly(prev, rows, W);
    expect(p.confirmed_this_week).toEqual([]);
    expect(p.confirmed).toEqual(['hook-first-frame']);
  });

  test('refuted accumulates across weeks (анти-повтор) and open carries forward', () => {
    const prev = {
      confirmed: [],
      refuted: ['dead-intro'],
      open: [{ slug: 'hero-centered', text: 'Герой в центре кадра', unlock_date: '2026-07-28' }],
    };
    const rows = [
      row({ kind: 'hypothesis', created_at: '2026-07-23T10:00:00Z', status: 'REFUTED', payload: { slug: 'retention-drives-reach' } }),
    ];
    const p = aggregateWeekly(prev, rows, W);
    expect(p.refuted.sort()).toEqual(['dead-intro', 'retention-drives-reach']);
    expect(p.open.map((h) => h.slug)).toEqual(['hero-centered']);
    expect(p.open[0]!.unlock_date).toBe('2026-07-28');
  });

  test('medians come from daily_advice channelStats; experiments/decisions pass through', () => {
    const rows = [
      row({ kind: 'daily_advice', created_at: '2026-07-21T06:20:00Z', payload: { mode: 'scout', sampleSize: 3, channelStats: { medianCompletion: 48, medianViews: 100 } } }),
      row({ kind: 'daily_advice', created_at: '2026-07-22T06:20:00Z', payload: { mode: 'scout', sampleSize: 4, channelStats: { medianCompletion: 52, medianViews: 300 } } }),
      row({ kind: 'experiment', created_at: '2026-07-23T09:00:00Z', payload: { slug: 'carwash-recut', variable: 'первые 6с', result: 'PENDING' } }),
      row({ kind: 'decision', created_at: '2026-07-23T09:05:00Z', payload: { text: 'Каденция 1/день' } }),
    ];
    const p = aggregateWeekly(null, rows, W);
    expect(p.medians).toEqual({ completion: 50, views: 200, days: 2 });
    expect(p.advice).toEqual({ days: 2, latestMode: 'scout', latestSampleSize: 4 });
    expect(p.experiments).toHaveLength(1);
    expect(p.decisions).toHaveLength(1);
  });
});

describe('aggregateMonthly', () => {
  test('folds ONLY weekly rollups; cumulative lists come from the latest weekly', () => {
    const weeklies = [
      row({ kind: 'weekly_rollup', created_at: '2026-07-06T06:37:00Z', payload: { confirmed: ['a'], refuted: [], open: [], medians: { completion: 40, views: 90 } } }),
      row({ kind: 'weekly_rollup', created_at: '2026-07-13T06:37:00Z', payload: { confirmed: ['a', 'b'], refuted: ['x'], open: [{ slug: 'c', text: 'C' }], medians: { completion: 50, views: 120 } } }),
      // A stray daily row must be ignored even if the caller passes it in.
      row({ kind: 'daily_advice', created_at: '2026-07-14T06:20:00Z', payload: { channelStats: { medianCompletion: 99 } } }),
    ];
    const p = aggregateMonthly(null, weeklies, { start: '2026-07-01', end: '2026-08-01' });
    expect(p.weeks).toBe(2);
    expect(p.confirmed.sort()).toEqual(['a', 'b']);
    expect(p.refuted).toEqual(['x']);
    expect(p.open.map((h) => h.slug)).toEqual(['c']);
    expect(p.medianCompletionByWeek).toEqual([40, 50]);
    expect(p.medianViewsByWeek).toEqual([90, 120]);
  });

  test('previous monthly lists merge in (nothing forgotten across months)', () => {
    const prev = { confirmed: ['old'], refuted: ['dead'] };
    const p = aggregateMonthly(prev, [], { start: '2026-08-01', end: '2026-09-01' });
    expect(p.confirmed).toEqual(['old']);
    expect(p.refuted).toEqual(['dead']);
    expect(p.weeks).toBe(0);
  });
});
