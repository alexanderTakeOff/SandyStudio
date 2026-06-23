// Tests for the Bible-structure TOC helper (Director 2026-06-23: "Полина должна
// знать структуру приложения; большой документ → оглавление").

import { describe, expect, test } from 'vitest';
import { headingToc } from '@/lib/concierge/doc-toc';

const SAMPLE = [
  '# БИБЛИЯ СЕРИАЛА',
  'intro prose',
  '## 1. Основная идея',
  'body',
  '## 34. Реестр сюжетов: Сезон 1 (Seed Bank)',
  '1. Тема раз',
  '### подсекция',
].join('\n');

describe('headingToc', () => {
  test('extracts heading outline, surfacing the Seed Bank section', () => {
    const toc = headingToc(SAMPLE);
    expect(toc.some((t) => t.includes('Seed Bank'))).toBe(true);
    expect(toc).toContain('БИБЛИЯ СЕРИАЛА');
  });

  test('indents by heading depth', () => {
    const toc = headingToc('# A\n## B\n### C');
    expect(toc).toEqual(['A', '  B', '    C']);
  });

  test('ignores non-heading lines and # inside prose', () => {
    const toc = headingToc('plain line\nsome #hashtag mid line\n# Real');
    expect(toc).toEqual(['Real']);
  });

  test('strips trailing # decorations', () => {
    expect(headingToc('# Title ##')).toEqual(['Title']);
  });

  test('caps entries to protect the context window', () => {
    const many = Array.from({ length: 100 }, (_, i) => `# H${i}`).join('\n');
    expect(headingToc(many, 60)).toHaveLength(60);
  });

  test('tolerates empty / non-string input', () => {
    expect(headingToc('')).toEqual([]);
    expect(headingToc(null)).toEqual([]);
    expect(headingToc(undefined)).toEqual([]);
  });
});
