// Motor 1 deterministic pieces of the upgraded EXEC-WCHK runner (2026-06-11):
//   - checkShotDurations (CHK-W05 pure validator)
//   - parseShotStateDeltas (extraction JSON narrowing — drops noise visibly)
// The LLM orchestration itself is exercised by the live smoke; these tests pin
// the pure logic the verdict pool depends on.

import { describe, it, expect } from 'vitest';
import {
  checkShotDurations,
  selectCanonObjects,
  SHOT_MIN_SECONDS,
  SHOT_MAX_SECONDS,
  type BibleAssetLike,
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

// ── CHK-W04 prop scope (E33) — props resolve through the location card ────────
describe('selectCanonObjects — prop scope', () => {
  const obj = (slug: string): BibleAssetLike => ({
    filename: `SS-S15-SBL-object_${slug}-v01-LOCKED.png`,
    description: `Canon card for ${slug}.`,
    status: 'LOCKED',
    file_type: `SBL-object_${slug}`,
  });
  const bedroom: BibleAssetLike = {
    filename: 'SS-S15-SBL-location_sandy_bedroom-v01-LOCKED.png',
    description:
      'Locked object references to preserve: sandy_bed, teal_desk_lamp, yellow_rug.',
    content: 'Also standing: round_side_table.',
    status: 'LOCKED',
    file_type: 'SBL-location_sandy_bedroom',
  };
  const all = [
    obj('sandy_bed'),
    obj('teal_desk_lamp'),
    obj('yellow_rug'),
    obj('round_side_table'),
    obj('hero_prop'), // in the episode cast
    obj('padel_racket'), // another episode's prop — out of scope
    bedroom,
  ];
  const cast = new Set(['hero_prop', 'sandy_bedroom']);
  const inCast = (a: BibleAssetLike) =>
    cast.has(a.file_type.replace(/^SBL-(object|location)_/, ''));

  it('keeps every prop the cast location card names, plus the cast props', () => {
    const slugs = selectCanonObjects(all, inCast, [bedroom]).map((a) => a.file_type);
    expect(slugs).toEqual([
      'SBL-object_sandy_bed',
      'SBL-object_teal_desk_lamp',
      'SBL-object_yellow_rug',
      'SBL-object_round_side_table',
      'SBL-object_hero_prop',
    ]);
    // the six-of-six false positives came from these being absent
    expect(slugs).not.toContain('SBL-object_padel_racket');
  });

  it('without the location card only the cast props survive — the E33 empty inventory', () => {
    expect(selectCanonObjects(all, inCast, []).map((a) => a.file_type)).toEqual([
      'SBL-object_hero_prop',
    ]);
  });
});
