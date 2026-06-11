// Motor 1 deterministic pieces of the upgraded EXEC-WCHK runner (2026-06-11):
//   - checkShotDurations (CHK-W05 pure validator)
//   - parseShotStateDeltas (extraction JSON narrowing — drops noise visibly)
// The LLM orchestration itself is exercised by the live smoke; these tests pin
// the pure logic the verdict pool depends on.

import { describe, it, expect } from 'vitest';
import {
  checkShotDurations,
  SHOT_MIN_SECONDS,
  SHOT_MAX_SECONDS,
} from '@/lib/agents/runners/continuity-check';
import {
  parseShotStateDeltas,
  ContinuityExtractError,
} from '@/lib/agents/runners/continuity-extract';
import type { StoryboardShotV2 } from '@/lib/api/vgen-shot-helpers';

describe('checkShotDurations — CHK-W05', () => {
  const shot = (id: string, d?: number): StoryboardShotV2 => ({
    shot_id: id,
    duration_seconds: d,
  });

  it('flags durations outside schema limits, skips missing durations', () => {
    const v = checkShotDurations([
      shot('SH01', 1.0), // too short
      shot('SH02', 5),
      shot('SH03', 12), // too long
      shot('SH04', undefined),
      shot('SH05', SHOT_MIN_SECONDS),
      shot('SH06', SHOT_MAX_SECONDS),
    ]);
    expect(v.map((x) => x.shot_id)).toEqual(['SH01', 'SH03']);
    expect(v[0].description).toContain('SH01');
  });

  it('empty storyboard → no violations', () => {
    expect(checkShotDurations([])).toEqual([]);
  });
});

describe('parseShotStateDeltas — extraction JSON narrowing', () => {
  it('parses valid deltas and normalizes optionals', () => {
    const { deltas, droppedEntries } = parseShotStateDeltas({
      deltas: [
        {
          shot_id: 'SH01',
          shot_index: 0,
          entities_introduced: ['drawer', 7],
          actions: [
            {
              entity: 'drawer',
              verb: 'overstuff',
              agent: 'sandy',
              state_before: 'open',
              state_after: 'overstuffed',
              cause: '',
            },
            { entity: 'room_lights', verb: 'switch_on', agent: null, state_after: 'on' },
          ],
        },
      ],
    });
    expect(droppedEntries).toBe(0);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].entities_introduced).toEqual(['drawer']);
    expect(deltas[0].actions[0].cause).toBeNull(); // empty string → null
    expect(deltas[0].actions[1].agent).toBeNull(); // explicit null preserved
  });

  it('drops malformed entries but keeps the parseable rest, counting drops', () => {
    const { deltas, droppedEntries } = parseShotStateDeltas({
      deltas: [
        { shot_id: 'SH01', shot_index: 0, actions: [{ entity: 'x', state_after: 's' }] },
        { shot_index: 1, actions: [] }, // no shot_id → dropped
        'garbage', // → dropped
        {
          shot_id: 'SH03',
          shot_index: 2,
          actions: [{ verb: 'no_entity' }], // malformed action → dropped
        },
      ],
    });
    expect(deltas.map((d) => d.shot_id)).toEqual(['SH01', 'SH03']);
    expect(droppedEntries).toBe(3);
  });

  it('throws when deltas array is missing or nothing parses', () => {
    expect(() => parseShotStateDeltas({})).toThrow(ContinuityExtractError);
    expect(() => parseShotStateDeltas({ deltas: ['a', 'b'] })).toThrow(
      ContinuityExtractError,
    );
  });
});
