// Unit tests for listStoryboardShots — the pure parser behind the
// `listShots` PA tool. Locks the production-order traversal, act/index
// numbering, and tolerance to optional fields. 2026-05-22 vocabulary-gap fix.

import { describe, expect, test } from 'vitest';
import {
  listStoryboardShots,
  shortShotLabel,
  getStoryboardShotById,
} from '@/lib/api/vgen-shot-helpers';

function makeStb(acts: Array<{ act: number; shots: Array<Record<string, unknown>> }>): string {
  return [
    '# Storyboard — test',
    '',
    '```json',
    JSON.stringify({ acts }),
    '```',
  ].join('\n');
}

describe('listStoryboardShots', () => {
  test('returns empty for malformed content', () => {
    expect(listStoryboardShots('')).toEqual([]);
    expect(listStoryboardShots('no json here')).toEqual([]);
    expect(listStoryboardShots('```json\n{"not_acts": []}\n```')).toEqual([]);
  });

  test('returns empty when acts array is empty', () => {
    expect(listStoryboardShots(makeStb([]))).toEqual([]);
  });

  test('extracts every shot in production order with running globalIndex', () => {
    const stb = makeStb([
      {
        act: 1,
        shots: [
          { shot_id: 'SH01', action_prose: 'Sandy enters.' },
          { shot_id: 'SH02', action_prose: 'Sandy looks around.' },
        ],
      },
      {
        act: 2,
        shots: [{ shot_id: 'SH03', action_prose: 'Anvil arrives.' }],
      },
    ]);
    const result = listStoryboardShots(stb);
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.shotId)).toEqual(['SH01', 'SH02', 'SH03']);
    expect(result.map((s) => s.act)).toEqual([1, 1, 2]);
    expect(result.map((s) => s.shotIndex)).toEqual([0, 1, 0]);
    expect(result.map((s) => s.globalIndex)).toEqual([0, 1, 2]);
  });

  test('truncates long action prose with ellipsis', () => {
    const long = 'x'.repeat(200);
    const stb = makeStb([
      { act: 1, shots: [{ shot_id: 'SH01', action_prose: long }] },
    ]);
    const [first] = listStoryboardShots(stb);
    expect(first.actionPreview?.length).toBeLessThanOrEqual(120);
    expect(first.actionPreview?.endsWith('…')).toBe(true);
  });

  test('captures location string and object forms', () => {
    const stb = makeStb([
      {
        act: 1,
        shots: [
          { shot_id: 'SH01', location: 'bedroom' },
          { shot_id: 'SH02', location: { slug: 'kitchen_morning' } },
          { shot_id: 'SH03' }, // no location
        ],
      },
    ]);
    const result = listStoryboardShots(stb);
    expect(result[0].location).toBe('bedroom');
    expect(result[1].location).toBe('kitchen_morning');
    expect(result[2].location).toBeUndefined();
  });

  test('collects characters from `characters` array (v2 bible_slug shape)', () => {
    const stb = makeStb([
      {
        act: 1,
        shots: [
          {
            shot_id: 'SH01',
            characters: [
              { bible_slug: 'sandy' },
              { bible_slug: 'anvil' },
            ],
          },
        ],
      },
    ]);
    const [first] = listStoryboardShots(stb);
    expect(first.charactersPresent).toEqual(['sandy', 'anvil']);
  });

  test('falls back to characters_present (v1 shape) when v2 absent', () => {
    const stb = makeStb([
      {
        act: 1,
        shots: [
          {
            shot_id: 'SH01',
            characters_present: ['sandy', 'anvil'],
          },
        ],
      },
    ]);
    const [first] = listStoryboardShots(stb);
    expect(first.charactersPresent).toEqual(['sandy', 'anvil']);
  });

  test('preserves shot_role, duration_seconds, camera_angle, expected_gag', () => {
    const stb = makeStb([
      {
        act: 1,
        shots: [
          {
            shot_id: 'SH01',
            shot_role: 'establishing',
            duration_seconds: 5,
            camera_angle: 'WIDE',
            expected_gag: 'Trumeau wobble',
          },
        ],
      },
    ]);
    const [first] = listStoryboardShots(stb);
    expect(first.shotRole).toBe('establishing');
    expect(first.durationSeconds).toBe(5);
    expect(first.cameraAngle).toBe('WIDE');
    expect(first.expectedGag).toBe('Trumeau wobble');
  });

  test('shortShotLabel returns the bare SH token from any id shape', () => {
    // Refactor 2026-06-26 (q8): SH is episode-unique → the token alone labels.
    // Reads both the new identity and the legacy compound.
    expect(shortShotLabel('S15-E12-SH08')).toBe('SH08'); // new canonical
    expect(shortShotLabel('S15-E12-SH123')).toBe('SH123');
    expect(shortShotLabel('SS-S15-E01-A2-SC04-SH08')).toBe('SH08'); // legacy compound
    expect(shortShotLabel('sh08')).toBe('SH08'); // case-normalized
    expect(shortShotLabel('SH09')).toBe('SH09');
  });

  test('shortShotLabel passes through unparseable input', () => {
    expect(shortShotLabel('')).toBe('');
    expect(shortShotLabel(null)).toBe('');
    expect(shortShotLabel(undefined)).toBe('');
    // No SH<digits> pattern → return as-is (don't crash, don't lie).
    expect(shortShotLabel('something-else')).toBe('something-else');
  });

  test('skips shots that lack a shot_id', () => {
    const stb = makeStb([
      {
        act: 1,
        shots: [
          { shot_id: 'SH01' },
          { action_prose: 'orphan with no id' },
          { shot_id: 'SH02' },
        ],
      },
    ]);
    const result = listStoryboardShots(stb);
    expect(result.map((s) => s.shotId)).toEqual(['SH01', 'SH02']);
  });
});

describe('getStoryboardShotById — exact canonical match only (refactor 2026-06-26)', () => {
  // Identity = S-E-SH (no act/scene to misremember). The dispatch door resolves
  // any human/tool reference to the canonical id (resolveShotId), so the lookup
  // is a strict exact match — the old SH-number / wrong-scene fallback is gone.
  const stb = makeStb([
    {
      act: 1,
      shots: [
        { shot_id: 'S15-E12-SH01', action_prose: 'Sandy walks.' },
        { shot_id: 'S15-E12-SH02', action_prose: 'Sandy notices phone.' },
      ],
    },
    {
      act: 2,
      shots: [
        { shot_id: 'S15-E12-SH03', action_prose: 'Phone slides in.' },
        { shot_id: 'S15-E12-SH04', action_prose: 'Sandy reaches.' },
      ],
    },
  ]);

  test('exact canonical id matches', () => {
    expect(getStoryboardShotById(stb, 'S15-E12-SH03')?.shot_id).toBe('S15-E12-SH03');
    expect(getStoryboardShotById(stb, 'S15-E12-SH01')?.action_prose).toBe('Sandy walks.');
  });

  test('a non-existent id fails loud (null) — never masked', () => {
    expect(getStoryboardShotById(stb, 'S15-E12-SH99')).toBeNull();
  });

  test('a bare or legacy-shaped id does NOT resolve here (resolve at the door first)', () => {
    // The lookup is strict: a bare "SH03" or a legacy compound is not silently
    // matched. Callers funnel through resolveShotId before reaching here.
    expect(getStoryboardShotById(stb, 'SH03')).toBeNull();
    expect(getStoryboardShotById(stb, 'SS-S15-E12-A2-SC02-SH03')).toBeNull();
  });
});

// E33 P1 #12 — the parser dropped `props_in_frame`, so the Designer, instructed
// to "copy props_in_frame verbatim" into the Plan, was never handed the list.
describe('shotToV2 — props_in_frame survives the parse', () => {
  test('carries the canon prop slugs through, trimmed and de-blanked', () => {
    const stb = makeStb([
      {
        act: 1,
        shots: [
          {
            shot_id: 'S15-E33-SH04',
            props_in_frame: ['object_sandy_bed', '  object_yellow_rug  ', '', 7],
          },
        ],
      },
    ]);
    expect(getStoryboardShotById(stb, 'S15-E33-SH04')?.props_in_frame).toEqual([
      'object_sandy_bed',
      'object_yellow_rug',
    ]);
  });

  test('absent / non-array props_in_frame stays undefined (not an empty array)', () => {
    const stb = makeStb([
      {
        act: 1,
        shots: [
          { shot_id: 'S15-E33-SH01' },
          { shot_id: 'S15-E33-SH02', props_in_frame: 'object_sandy_bed' },
        ],
      },
    ]);
    expect(getStoryboardShotById(stb, 'S15-E33-SH01')?.props_in_frame).toBeUndefined();
    expect(getStoryboardShotById(stb, 'S15-E33-SH02')?.props_in_frame).toBeUndefined();
  });
});
