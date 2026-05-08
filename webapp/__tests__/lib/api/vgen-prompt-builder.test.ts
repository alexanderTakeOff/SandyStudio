// Unit tests for buildShotPromptV2 — guards Veo 3.1 prompt structure so that
// changes to its shape (which directly affect every generation) surface in CI
// instead of after a paid live run.

import { describe, it, expect } from 'vitest';
import {
  buildShotPromptV2,
  type StoryboardShotV2,
} from '@/lib/api/vgen-shot-helpers';

const baseShot: StoryboardShotV2 = {
  shot_id: 'SS-S01-E01-A1-SC01-SH01',
  shot_role: 'establishing',
  duration_seconds: 4,
  action_prose: 'Sandy enters the cafe, scanning for a free table.',
  camera_angle: 'WIDE',
  expected_gag: 'Sandy trips on a stray umbrella',
  expected_emotion: 'curious',
  characters: [
    { bible_slug: 'sandy', display_name: 'Sandy', emotion: 'curious' },
  ],
};

describe('buildShotPromptV2 — structure', () => {
  it('does NOT use the legacy [bracket] prefix', () => {
    const prompt = buildShotPromptV2(baseShot, 'Red Carpet');
    expect(prompt.startsWith('[')).toBe(false);
  });

  it('mentions the episode title as setting flavour, not as a label', () => {
    const prompt = buildShotPromptV2(baseShot, 'Red Carpet');
    expect(prompt).toContain('"Red Carpet"');
    // Should not contain the literal label `title:` or similar that risks
    // showing up as on-screen text.
    expect(prompt.toLowerCase()).not.toContain('title:');
  });

  it('falls back to a generic setting when title is empty', () => {
    const prompt = buildShotPromptV2(baseShot, '');
    expect(prompt).toContain('2D animated comedy short');
    expect(prompt).not.toContain('"');
  });

  it('includes a negative-prompt block forbidding text/watermarks', () => {
    const prompt = buildShotPromptV2(baseShot, 'Red Carpet');
    expect(prompt).toMatch(/Avoid:/);
    expect(prompt.toLowerCase()).toContain('on-screen text');
    expect(prompt.toLowerCase()).toContain('watermark');
  });

  it('includes a positive style block with cartoon anchors', () => {
    const prompt = buildShotPromptV2(baseShot, 'Red Carpet');
    expect(prompt).toContain('Style:');
    expect(prompt.toLowerCase()).toContain('2d animation');
  });
});

describe('buildShotPromptV2 — camera mapping', () => {
  it('translates WIDE → static wide establishing shot', () => {
    const p = buildShotPromptV2({ ...baseShot, camera_angle: 'WIDE' }, 'X');
    expect(p).toContain('Camera: static wide establishing shot.');
  });

  it('translates OTS → over-the-shoulder', () => {
    const p = buildShotPromptV2({ ...baseShot, camera_angle: 'OTS' }, 'X');
    expect(p).toMatch(/Camera: over-the-shoulder/);
  });

  it('translates CU → static close-up', () => {
    const p = buildShotPromptV2({ ...baseShot, camera_angle: 'CU' }, 'X');
    expect(p).toContain('Camera: static close-up.');
  });

  it('handles unknown camera value as lowercase free-form phrase', () => {
    const p = buildShotPromptV2(
      { ...baseShot, camera_angle: 'CRANE_UP' },
      'X',
    );
    expect(p).toContain('Camera: crane up.');
  });

  it('defaults to static medium shot when camera_angle is missing', () => {
    const { camera_angle: _, ...rest } = baseShot;
    void _;
    const p = buildShotPromptV2(rest, 'X');
    expect(p).toContain('Camera: static medium shot.');
  });
});

describe('buildShotPromptV2 — role flavouring', () => {
  it('prefixes establishing shots with "Establishing the scene"', () => {
    const p = buildShotPromptV2(baseShot, 'X');
    expect(p).toContain('Establishing the scene:');
  });

  it('prefixes punchlines with "Punchline payoff"', () => {
    const p = buildShotPromptV2(
      { ...baseShot, shot_role: 'punchline' },
      'X',
    );
    expect(p).toContain('Punchline payoff:');
  });

  it('omits role prefix for unknown roles', () => {
    const p = buildShotPromptV2(
      { ...baseShot, shot_role: 'made_up_role' },
      'X',
    );
    // Action line should appear without a leading role-prefix:
    //   ✓ "Sandy enters the cafe …"
    //   ✗ "Establishing the scene: Sandy enters the cafe …"
    expect(p).not.toContain('Establishing the scene:');
    expect(p).not.toContain('Punchline payoff:');
    // The action itself is still present (no role-aware framing applied).
    expect(p).toContain('Sandy enters the cafe');
  });
});

describe('buildShotPromptV2 — gag vs emotion separation', () => {
  it('puts the gag on its own Beat: line', () => {
    const p = buildShotPromptV2(baseShot, 'X');
    expect(p).toContain('Beat: Sandy trips on a stray umbrella.');
  });

  it('puts the emotion on its own Mood: line', () => {
    const p = buildShotPromptV2(baseShot, 'X');
    expect(p).toContain('Mood: curious.');
  });

  it('skips Beat: line entirely when no gag is set', () => {
    const { expected_gag: _, ...rest } = baseShot;
    void _;
    const p = buildShotPromptV2(rest, 'X');
    expect(p).not.toMatch(/Beat:/);
  });

  it('skips Mood: line entirely when no emotion is set', () => {
    const { expected_emotion: _, ...rest } = baseShot;
    void _;
    const p = buildShotPromptV2(rest, 'X');
    expect(p).not.toMatch(/Mood:/);
  });
});

describe('buildShotPromptV2 — characters', () => {
  it('lists characters with display_name + emotion', () => {
    const p = buildShotPromptV2(baseShot, 'X');
    expect(p).toContain('Characters:');
    expect(p).toContain('Sandy');
  });

  it('falls back to characters_present slugs when characters[] is absent', () => {
    const { characters: _, ...rest } = baseShot;
    void _;
    const p = buildShotPromptV2(
      { ...rest, characters_present: ['stopwatch'] },
      'X',
    );
    expect(p).toContain('Characters: stopwatch.');
  });

  it('omits the Characters: line when neither field is provided', () => {
    const { characters: _c, characters_present: _p, ...rest } = baseShot;
    void _c;
    void _p;
    const p = buildShotPromptV2(rest, 'X');
    expect(p).not.toContain('Characters:');
  });
});
