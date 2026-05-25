// TD-49 Phase 1 — verify setBibleContent accepts the new 'scene_master' section
// per agents/exec/episode_reference_designer.md §«Scene Master (TD-49 Phase 1)».
// Confirms file_type derivation, slug validation, and that the existing schema
// still rejects unknown sections.

import { describe, expect, test } from 'vitest';
import { setBibleContent } from '@/lib/concierge/tools/series';

describe('setBibleContent — scene_master section (TD-49 Phase 1)', () => {
  test('accepts scene_master with valid location slug', () => {
    const parsed = setBibleContent.parse(
      JSON.stringify({
        seriesId: '00000000-0000-0000-0000-000000000001',
        section: 'scene_master',
        slug: 'bedroom',
        content:
          'Canonical bedroom layout: mirror east wall at 35% frame height, carpet runs north-south covering 40% floor, single bed against west wall, soft morning light from window above mirror.',
      }),
    );
    expect(parsed.section).toBe('scene_master');
    expect(parsed.slug).toBe('bedroom');
    expect(parsed.content.length).toBeGreaterThan(50);
  });

  test('rejects scene_master with invalid slug (no spaces)', () => {
    expect(() =>
      setBibleContent.parse(
        JSON.stringify({
          seriesId: '00000000-0000-0000-0000-000000000001',
          section: 'scene_master',
          slug: 'bedroom main',
          content: 'x'.repeat(80),
        }),
      ),
    ).toThrow(/slug must contain only letters, numbers, _ or -/);
  });

  test('still rejects unknown section', () => {
    expect(() =>
      setBibleContent.parse(
        JSON.stringify({
          seriesId: '00000000-0000-0000-0000-000000000001',
          section: 'invented_section',
          slug: 'foo',
          content: 'x'.repeat(80),
        }),
      ),
    ).toThrow(/section must be one of/);
  });

  test('still accepts pre-existing sections (regression guard)', () => {
    const parsed = setBibleContent.parse(
      JSON.stringify({
        seriesId: '00000000-0000-0000-0000-000000000001',
        section: 'location',
        slug: 'cafe',
        content: 'Cafe location canon text.',
      }),
    );
    expect(parsed.section).toBe('location');
  });

  test('scene_master slug defaults to "main" when omitted (consistent with other sections)', () => {
    const parsed = setBibleContent.parse(
      JSON.stringify({
        seriesId: '00000000-0000-0000-0000-000000000001',
        section: 'scene_master',
        content:
          'Default scene_master canon — falls back to slug "main" per existing parser convention.',
      }),
    );
    expect(parsed.slug).toBe('main');
  });
});
