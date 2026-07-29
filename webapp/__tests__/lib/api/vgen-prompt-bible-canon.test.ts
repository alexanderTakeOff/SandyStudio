// Tests for Phase A.1 character canon injection in buildShotPromptV2.
// Guards the "Visual canon: <slug>: <description>" segment that anchors
// character appearance in TEXT alongside the EREF reference image.

import { describe, it, expect } from 'vitest';
import {
  buildShotPromptV2,
  makeCharacterCanonSnippets,
  type StoryboardShotV2,
  type CharacterCanonSnippet,
} from '@/lib/api/vgen-shot-helpers';

const baseShot: StoryboardShotV2 = {
  shot_id: 'SS-S01-E01-A1-SC01-SH01',
  shot_role: 'establishing',
  duration_seconds: 4,
  action_prose: 'Sandy enters the cafe.',
  camera_angle: 'WIDE',
  expected_emotion: 'curious',
  characters: [
    { bible_slug: 'sandy_hourglass', display_name: 'Sandy', emotion: 'curious' },
    { bible_slug: 'stopwatch_brass', display_name: 'Stopwatch', emotion: 'serious' },
  ],
};

const sandyCanon: CharacterCanonSnippet = {
  slug: 'sandy_hourglass',
  description:
    'Young man with curly red hair, freckles, wearing a yellow raincoat. Carries a vintage hourglass.',
};
const stopwatchCanon: CharacterCanonSnippet = {
  slug: 'stopwatch_brass',
  description:
    'Brass automaton inspector, polished metal body. Always punctual.',
};
const irrelevantCanon: CharacterCanonSnippet = {
  slug: 'lighthouse_keeper',
  description: 'Old man with grey beard, lives alone in a tower.',
};

describe('buildShotPromptV2 — character canon injection', () => {
  it('injects Visual canon segment when canon is provided AND character is present', () => {
    const p = buildShotPromptV2(baseShot, 'Red Carpet', [sandyCanon]);
    expect(p).toContain('Visual canon: sandy_hourglass:');
    expect(p).toContain('curly red hair');
  });

  it('omits Visual canon segment entirely when no characters match', () => {
    const p = buildShotPromptV2(baseShot, 'Red Carpet', [irrelevantCanon]);
    expect(p).not.toContain('Visual canon:');
  });

  it('omits Visual canon segment when canon is undefined', () => {
    const p = buildShotPromptV2(baseShot, 'Red Carpet');
    expect(p).not.toContain('Visual canon:');
  });

  it('only includes canon for characters present in the shot — not the full cast', () => {
    const p = buildShotPromptV2(baseShot, 'Red Carpet', [
      sandyCanon,
      stopwatchCanon,
      irrelevantCanon,
    ]);
    expect(p).toContain('sandy_hourglass:');
    expect(p).toContain('stopwatch_brass:');
    expect(p).not.toContain('lighthouse_keeper');
  });

  it('falls back to characters_present when characters[] is missing', () => {
    const { characters: _c, ...rest } = baseShot;
    void _c;
    const p = buildShotPromptV2(
      { ...rest, characters_present: ['sandy_hourglass'] },
      'Red Carpet',
      [sandyCanon],
    );
    expect(p).toContain('Visual canon: sandy_hourglass:');
  });
});

describe('makeCharacterCanonSnippets — sentence truncation', () => {
  it('truncates description to first 2 sentences by default', () => {
    const result = makeCharacterCanonSnippets([
      {
        slug: 'sandy',
        description:
          'Young man. Curly red hair, freckles. Wears a yellow raincoat. Likes coffee.',
      },
    ]);
    expect(result[0]?.description).toBe('Young man. Curly red hair, freckles.');
    expect(result[0]?.description).not.toContain('yellow raincoat');
  });

  it('keeps shorter descriptions intact', () => {
    const result = makeCharacterCanonSnippets([
      { slug: 'sandy', description: 'Young man with red hair.' },
    ]);
    expect(result[0]?.description).toBe('Young man with red hair.');
  });

  it('skips entries with empty slug or description', () => {
    const result = makeCharacterCanonSnippets([
      { slug: '', description: 'Whatever' },
      { slug: 'sandy', description: '' },
      { slug: 'real', description: 'Real character.' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe('real');
  });

  it('respects custom sentence count', () => {
    const result = makeCharacterCanonSnippets(
      [{ slug: 's', description: 'One. Two. Three.' }],
      1,
    );
    expect(result[0]?.description).toBe('One.');
  });
});
