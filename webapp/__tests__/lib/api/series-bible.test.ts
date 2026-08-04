// Unit tests for the bibleSlug helper — guards against the greedy-regex bug
// (compound slugs like `city_systems` collapsing to `systems`) that broke
// Continuity Check matching. Single source of truth lives in
// lib/api/series-bible.ts; inline filename regex is forbidden.

import { describe, it, expect } from 'vitest';
import {
  bibleSlug,
  bibleSlugForms,
  bibleSlugFromFileType,
  sectionFromFileType,
} from '@/lib/api/series-bible';

describe('bibleSlug — file_type → slug', () => {
  it('extracts simple character slug', () => {
    expect(bibleSlug('SBL-character_sandy')).toBe('sandy');
  });

  it('extracts compound character slug (city_systems)', () => {
    // The greedy `[a-z_]+_` regex used to collapse this to "systems".
    expect(bibleSlug('SBL-character_city_systems')).toBe('city_systems');
  });

  it('extracts compound location slug (central_public_square)', () => {
    expect(bibleSlug('SBL-location_central_public_square')).toBe('central_public_square');
  });

  it('extracts simple location slug', () => {
    expect(bibleSlug('SBL-location_cafe')).toBe('cafe');
  });

  it('extracts object slug', () => {
    expect(bibleSlug('SBL-object_red_telephone')).toBe('red_telephone');
  });

  it('extracts style slug', () => {
    expect(bibleSlug('SBL-style_visual_language')).toBe('visual_language');
  });

  it('returns null for non-SBL file_type', () => {
    expect(bibleSlug('IMG-thumbnail')).toBeNull();
    expect(bibleSlug('SCR-script')).toBeNull();
    expect(bibleSlug('STB-storyboard')).toBeNull();
    expect(bibleSlug('')).toBeNull();
  });

  it('lowercases the slug', () => {
    expect(bibleSlug('SBL-character_Sandy')).toBe('sandy');
  });

  it('preserves trailing numeric chars in slug', () => {
    expect(bibleSlug('SBL-character_robot_v2')).toBe('robot_v2');
  });
});

describe('bibleSlugFromFileType — section + slug pair', () => {
  it('returns both for compound slug', () => {
    expect(bibleSlugFromFileType('SBL-character_city_systems')).toEqual({
      section: 'character',
      slug: 'city_systems',
    });
  });

  it('returns slug="" for bare general_idea (SBL-general_idea)', () => {
    expect(bibleSlugFromFileType('SBL-general_idea')).toEqual({
      section: 'general_idea',
      slug: '',
    });
  });

  it('returns null on non-SBL prefix', () => {
    expect(bibleSlugFromFileType('IMG-episode_ref_a1_sandy_at_cafe')).toBeNull();
  });
});

describe('bibleSlugForms — both names an entry answers to (D14)', () => {
  it('returns short AND sectioned form', () => {
    // The casting preflight matched the short form only, while every surface
    // that SHOWS canon prints the sectioned one — so locked canon read as missing.
    expect(bibleSlugForms('SBL-character_bathyscaphe_turnaround')).toEqual([
      'bathyscaphe_turnaround',
      'character_bathyscaphe_turnaround',
    ]);
  });

  it('keeps compound slugs intact in both forms', () => {
    expect(bibleSlugForms('SBL-location_bathyscaphe_interior')).toEqual([
      'bathyscaphe_interior',
      'location_bathyscaphe_interior',
    ]);
  });

  it('returns nothing for a section with no slug', () => {
    expect(bibleSlugForms('SBL-general_idea')).toEqual([]);
  });

  it('returns nothing for a non-SBL file_type', () => {
    expect(bibleSlugForms('IMG-episode_ref_a1_sandy_at_cafe')).toEqual([]);
  });
});

describe('sectionFromFileType — backward-compat smoke', () => {
  it('still resolves character', () => {
    expect(sectionFromFileType('SBL-character_city_systems')).toBe('character');
  });
  it('still resolves location', () => {
    expect(sectionFromFileType('SBL-location_neon_cafe')).toBe('location');
  });
});
