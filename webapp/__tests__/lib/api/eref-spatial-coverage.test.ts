// Unit tests for deriveSpatialCoverage (Spatial Coverage Manifest layer).
//
// Why: prevent regression to the "all 19 shots collapse onto one flat plate"
// bug Director surfaced 2026-05-12.

import { describe, expect, test } from 'vitest';

import {
  deriveSpatialCoverage,
  formatSpatialBlockForPrompt,
  type SpatialShotInput,
} from '@/lib/api/eref-spatial-coverage';

const baseShot = (overrides: Partial<SpatialShotInput>): SpatialShotInput => ({
  shot_id: overrides.shot_id ?? 'shot1',
  location: overrides.location ?? 'perfume_counter_bar',
  characters_present: overrides.characters_present ?? ['sandy_hourglass'],
  ...overrides,
});

describe('deriveSpatialCoverage', () => {
  test('lifts location.sub_area verbatim into spatial_anchor when provided', () => {
    const [entry] = deriveSpatialCoverage([
      baseShot({ shot_id: 's1', location_sub_area: 'entrance end' }),
    ]);
    expect(entry?.spatial_anchor).toBe('entrance end');
  });

  test('infers anchor from camera_angle + shot_role when sub_area absent', () => {
    const out = deriveSpatialCoverage([
      baseShot({ shot_id: 's_wide', camera_angle: 'wide', shot_role: 'establishing' }),
      baseShot({ shot_id: 's_close', camera_angle: 'extreme_close_up', shot_role: 'reaction' }),
    ]);
    expect(out[0]?.spatial_anchor).toMatch(/wide vantage/i);
    expect(out[1]?.spatial_anchor).toMatch(/tight framing/i);
  });

  test('maps known camera_movement vocabulary to a one-line direction', () => {
    const [orbit] = deriveSpatialCoverage([
      baseShot({ shot_id: 's', camera_movement: 'slow_orbit_around_subject' }),
    ]);
    expect(orbit?.camera_direction).toMatch(/arcs slowly around/i);
  });

  test('flags repeated anchors inside the same location', () => {
    const out = deriveSpatialCoverage([
      baseShot({ shot_id: 's1', location_sub_area: 'counter centre' }),
      baseShot({ shot_id: 's2', location_sub_area: 'counter centre' }),
      baseShot({ shot_id: 's3', location_sub_area: 'shelf side' }),
    ]);
    expect(out[0]?.variation_note).toMatch(/First shot inside/);
    expect(out[1]?.variation_note).toMatch(/already used/i);
    expect(out[1]?.variation_note).toMatch(/visibly DIFFERENT vantage/);
    // Third shot uses a different anchor — should not raise the "already used"
    // warning, but should still nudge against replicating angles.
    expect(out[2]?.variation_note).not.toMatch(/already used/i);
    expect(out[2]?.variation_note).toMatch(/does NOT replicate/);
  });

  test('counts variations per location, not globally', () => {
    const out = deriveSpatialCoverage([
      baseShot({ shot_id: 's1', location: 'loc_a', location_sub_area: 'corner' }),
      baseShot({ shot_id: 's2', location: 'loc_b', location_sub_area: 'corner' }),
    ]);
    // Both are "first shot in their location" — corner is reused across
    // locations but that's fine, the audience reads them as different places.
    expect(out[0]?.variation_note).toMatch(/First shot inside/);
    expect(out[1]?.variation_note).toMatch(/First shot inside/);
  });

  test('falls back gracefully when no camera vocabulary is present', () => {
    const [entry] = deriveSpatialCoverage([baseShot({ shot_id: 's' })]);
    expect(entry?.camera_direction).toMatch(/static framing/i);
    expect(entry?.spatial_anchor).toBeTruthy();
  });
});

describe('formatSpatialBlockForPrompt', () => {
  test('renders anchor + direction + variation as bulleted lines', () => {
    const [entry] = deriveSpatialCoverage([
      baseShot({
        shot_id: 's',
        location_sub_area: 'reverse from behind counter',
        camera_movement: 'slow_pullback',
      }),
    ]);
    const block = formatSpatialBlockForPrompt(entry!);
    expect(block[0]).toMatch(/Camera & spatial direction/);
    expect(block.some((l) => l.includes('reverse from behind counter'))).toBe(true);
    expect(block.some((l) => l.includes('slow backward dolly'))).toBe(true);
    expect(block.some((l) => l.startsWith('- Variation rule:'))).toBe(true);
  });
});
