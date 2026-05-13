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

  it('does NOT quote the episode title (avoids on-screen text rendering)', () => {
    // Director report 2026-05-13: Veo rendered `"Red Carpet"` quoted text
    // as an actual on-screen title card. The title is now dropped from the
    // prompt body entirely — the EREF carries setting context.
    const prompt = buildShotPromptV2(baseShot, 'Red Carpet');
    expect(prompt).not.toContain('"Red Carpet"');
    expect(prompt).not.toContain('set in the world of');
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

describe('buildShotPromptV2 — role label removed (2026-05-13)', () => {
  // Director report 2026-05-13: Veo occasionally rendered the role label
  // ("Reaction shot:", "Establishing the scene:") as on-screen text.
  // The label was decorative — the EREF already encodes framing — so we
  // dropped role prefixes entirely. These tests pin the new contract.

  it('does not prefix establishing shots with a role label', () => {
    const p = buildShotPromptV2(baseShot, 'X');
    expect(p).not.toContain('Establishing the scene:');
  });

  it('does not prefix punchlines with a role label', () => {
    const p = buildShotPromptV2(
      { ...baseShot, shot_role: 'punchline' },
      'X',
    );
    expect(p).not.toContain('Punchline payoff:');
  });

  it('still surfaces the action sentence', () => {
    const p = buildShotPromptV2(
      { ...baseShot, shot_role: 'made_up_role' },
      'X',
    );
    expect(p).toContain('Sandy enters the cafe');
  });
});

describe('buildShotPromptV2 — gag vs emotion (no labels)', () => {
  // Beat: / Mood: labels removed 2026-05-13 — Veo printed the labels as
  // on-screen text. The substance is kept, woven into the flow without
  // a colon-prefixed label so the model reads it as composition guidance.

  it('keeps the gag substance', () => {
    const p = buildShotPromptV2(baseShot, 'X');
    expect(p).toContain('Sandy trips on a stray umbrella');
    expect(p).not.toContain('Beat:');
  });

  it('keeps the emotion substance', () => {
    const p = buildShotPromptV2(baseShot, 'X');
    expect(p).toContain('curious');
    expect(p).not.toContain('Mood:');
  });

  it('omits the gag fragment entirely when expected_gag is unset', () => {
    const { expected_gag: _, ...rest } = baseShot;
    void _;
    const p = buildShotPromptV2(rest, 'X');
    expect(p).not.toContain('Sandy trips on a stray umbrella');
  });

  it('omits the emotion fragment entirely when expected_emotion is unset', () => {
    const { expected_emotion: _, ...rest } = baseShot;
    void _;
    const p = buildShotPromptV2(rest, 'X');
    // `curious` would otherwise have been emitted as a standalone fragment.
    // Characters block can still mention emotion in parentheses if a
    // character carries an `emotion` field, so we look for the *standalone*
    // sentence form (period-terminated) rather than the bare token.
    expect(p).not.toMatch(/\bcurious\.\s/);
  });

  it('forces native 16:9 composition (no square-inside-wide drift)', () => {
    const p = buildShotPromptV2(baseShot, 'X');
    expect(p).toContain('16:9 widescreen landscape composition from the very first frame');
  });

  it('does not quote the episode title (avoid on-screen text rendering)', () => {
    const p = buildShotPromptV2(baseShot, 'The Violet Distance');
    expect(p).not.toContain('"The Violet Distance"');
    expect(p).not.toContain('set in the world of');
  });

  it('truncates multi-sentence literary action_prose to the first sentence', () => {
    const p = buildShotPromptV2(
      {
        ...baseShot,
        action_prose:
          'The counter fills the entire frame. Not a smear of violet. The distance is exact. Precise. Unbridgeable..',
      },
      'X',
    );
    expect(p).toContain('The counter fills the entire frame');
    expect(p).not.toContain('Unbridgeable');
    expect(p).not.toMatch(/\.\./);
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
