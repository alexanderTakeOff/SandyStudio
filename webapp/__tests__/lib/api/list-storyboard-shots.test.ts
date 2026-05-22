// Unit tests for listStoryboardShots — the pure parser behind the
// `listShots` PA tool. Locks the production-order traversal, act/index
// numbering, and tolerance to optional fields. 2026-05-22 vocabulary-gap fix.

import { describe, expect, test } from 'vitest';
import { listStoryboardShots } from '@/lib/api/vgen-shot-helpers';

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
