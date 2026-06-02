import { describe, it, expect } from 'vitest';
import { parsePlanVariants } from '@/lib/agents/runners/thumbnail-renderer';

function planMarkdown(variants: unknown[], halt: string | null = null): string {
  return [
    '# Thumbnail Plan',
    'rationale prose…',
    '```json',
    JSON.stringify({ episode_code: 'SS-S15-E01', halt, rationale: 'r', variants }),
    '```',
  ].join('\n');
}

describe('parsePlanVariants', () => {
  it('extracts usable variants (those with a non-empty prompt)', () => {
    const md = planMarkdown([
      { concept: 'emotion-led', prompt: 'Sandy shocked, big eyes', overlay_text: 'TOO HEAVY!' },
      { concept: 'broken', prompt: '' }, // dropped — empty prompt
      { concept: 'text-led', prompt: 'bold text concept', overlay_text: 'HELP!' },
    ]);
    const out = parsePlanVariants(md);
    expect(out).toHaveLength(2);
    expect(out[0].overlay_text).toBe('TOO HEAVY!');
  });

  it('caps at 10 variants', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ concept: `c${i}`, prompt: `p${i}` }));
    expect(parsePlanVariants(planMarkdown(many))).toHaveLength(10);
  });

  it('throws when the designer HALTed', () => {
    expect(() => parsePlanVariants(planMarkdown([], 'missing protagonist canon'))).toThrow(/HALT/i);
  });

  it('throws on empty content or no json block', () => {
    expect(() => parsePlanVariants(null)).toThrow();
    expect(() => parsePlanVariants('no fenced block here')).toThrow(/json/i);
  });

  it('throws when no variant has a usable prompt', () => {
    expect(() => parsePlanVariants(planMarkdown([{ concept: 'x', prompt: '' }]))).toThrow(/no usable/i);
  });
});
