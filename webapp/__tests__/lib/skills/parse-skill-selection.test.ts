import { describe, it, expect } from 'vitest';

import { parseSkillSelection } from '@/lib/skills/parse-skill-selection';

describe('parseSkillSelection — Step 1 LLM reply parser', () => {
  it('parses clean JSON happy path', () => {
    const raw = '{"activated_skills":["storyboarder-situational-comedy","storyboarder-prose-craft"]}';
    const result = parseSkillSelection(raw);
    expect(result.source).toBe('json');
    expect(result.slugs).toEqual([
      'storyboarder-situational-comedy',
      'storyboarder-prose-craft',
    ]);
    expect(result.error).toBeUndefined();
  });

  it('strips ```json fenced code blocks before parsing', () => {
    const raw = '```json\n{"activated_skills": ["seedance-prompting"]}\n```';
    const result = parseSkillSelection(raw);
    expect(result.source).toBe('json');
    expect(result.slugs).toEqual(['seedance-prompting']);
  });

  it('extracts first JSON object when wrapped in prose', () => {
    const raw = `Here's my selection for this comedy storyboard task:\n\n{"activated_skills": ["storyboarder-situational-comedy"]}\n\nLet me know if you need more.`;
    const result = parseSkillSelection(raw);
    expect(result.source).toBe('json');
    expect(result.slugs).toEqual(['storyboarder-situational-comedy']);
  });

  it('returns empty array when LLM activates no skills', () => {
    const raw = '{"activated_skills": []}';
    const result = parseSkillSelection(raw);
    expect(result.source).toBe('json');
    expect(result.slugs).toEqual([]);
  });

  it('falls back to regex when JSON.parse fails (trailing comma)', () => {
    const raw = '{"activated_skills":["eref-shot-composition",]}';
    const result = parseSkillSelection(raw);
    expect(result.source).toBe('regex');
    expect(result.slugs).toEqual(['eref-shot-composition']);
    expect(result.error).toBeTruthy();
  });

  it('falls back to regex when JSON keys are unquoted', () => {
    const raw = '{activated_skills: ["storyboarder-prose-craft"]}';
    const result = parseSkillSelection(raw);
    expect(result.source).toBe('regex');
    expect(result.slugs).toEqual(['storyboarder-prose-craft']);
  });

  it('dedupes repeated slugs', () => {
    const raw = '{"activated_skills":["a-skill","a-skill","b-skill"]}';
    const result = parseSkillSelection(raw);
    expect(result.slugs).toEqual(['a-skill', 'b-skill']);
  });

  it('filters out non-slug-shaped strings', () => {
    const raw = '{"activated_skills":["valid-slug","UPPER","with spaces","ok-one"]}';
    const result = parseSkillSelection(raw);
    expect(result.slugs).toEqual(['valid-slug', 'ok-one']);
  });

  it('returns empty result on null / whitespace input', () => {
    expect(parseSkillSelection('').source).toBe('empty');
    expect(parseSkillSelection('   \n  ').source).toBe('empty');
    expect(parseSkillSelection('').slugs).toEqual([]);
  });

  it('returns empty with error when no JSON object present', () => {
    const raw = 'I think we should apply situational comedy skill.';
    const result = parseSkillSelection(raw);
    expect(result.source).toBe('empty');
    expect(result.slugs).toEqual([]);
    expect(result.error).toBeTruthy();
  });

  it('handles arrays of non-strings gracefully', () => {
    const raw = '{"activated_skills":[123, true, "valid-slug", null]}';
    const result = parseSkillSelection(raw);
    expect(result.slugs).toEqual(['valid-slug']);
  });

  it('rejects activated_skills that is not an array', () => {
    const raw = '{"activated_skills": "just-one-string"}';
    const result = parseSkillSelection(raw);
    expect(result.source).toBe('empty');
    expect(result.slugs).toEqual([]);
  });
});
