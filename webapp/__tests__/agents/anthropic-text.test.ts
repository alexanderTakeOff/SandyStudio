import { describe, it, expect } from 'vitest';

import {
  computeCostUsd,
  extractLastJsonBlock,
} from '@/lib/agents/providers/anthropic-text';

describe('anthropic-text — pure helpers', () => {
  describe('computeCostUsd', () => {
    it('prices Sonnet at $3/M input + $15/M output', () => {
      const cost = computeCostUsd(
        { inputTokens: 1_000_000, outputTokens: 0 },
        'claude-sonnet-4-6',
      );
      expect(cost).toBeCloseTo(3.0, 4);
    });

    it('prices Haiku at $0.80/M input + $4/M output', () => {
      const cost = computeCostUsd(
        { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        'claude-haiku-4-5',
      );
      expect(cost).toBeCloseTo(4.8, 4);
    });

    it('prices Opus at $15/M input + $75/M output', () => {
      const cost = computeCostUsd(
        { inputTokens: 0, outputTokens: 100_000 },
        'claude-opus-4-7',
      );
      expect(cost).toBeCloseTo(7.5, 4);
    });

    it('rounds to 4 decimal places', () => {
      const cost = computeCostUsd(
        { inputTokens: 7, outputTokens: 13 },
        'claude-sonnet-4-6',
      );
      // 7 * 3 / 1e6 + 13 * 15 / 1e6 = 0.000021 + 0.000195 = 0.000216
      // Rounded to 4 decimals → 0.0002
      expect(cost).toBe(0.0002);
    });

    it('falls back to Sonnet rate for unknown model id', () => {
      const cost = computeCostUsd(
        { inputTokens: 1_000_000, outputTokens: 0 },
        'unknown-model-xyz',
      );
      expect(cost).toBeCloseTo(3.0, 4);
    });

    it('handles zero usage without NaN', () => {
      const cost = computeCostUsd(
        { inputTokens: 0, outputTokens: 0 },
        'claude-sonnet-4-6',
      );
      expect(cost).toBe(0);
    });
  });

  describe('extractLastJsonBlock', () => {
    it('parses a single fenced ```json block', () => {
      const md = [
        '# Script',
        '',
        'Some prose.',
        '',
        '```json',
        '{ "scenes": [{ "scene_id": "S1" }] }',
        '```',
      ].join('\n');
      expect(extractLastJsonBlock(md)).toEqual({
        scenes: [{ scene_id: 'S1' }],
      });
    });

    it('returns the LAST block when multiple are present', () => {
      const md = [
        '```json',
        '{ "schema_example": true }',
        '```',
        '',
        'Then the actual output:',
        '',
        '```json',
        '{ "real": "data" }',
        '```',
      ].join('\n');
      expect(extractLastJsonBlock(md)).toEqual({ real: 'data' });
    });

    it('returns null on no fenced block', () => {
      expect(extractLastJsonBlock('# No JSON here\n\nJust prose.')).toBeNull();
    });

    it('returns null on malformed JSON', () => {
      const md = '```json\n{ broken: ,, }\n```';
      expect(extractLastJsonBlock(md)).toBeNull();
    });

    it('returns null when block content is a JSON array (not object)', () => {
      // The contract is a top-level object — arrays are rejected so callers
      // can rely on Record<string, unknown>.
      const md = '```json\n[1,2,3]\n```';
      expect(extractLastJsonBlock(md)).toBeNull();
    });

    it('handles whitespace and newlines around the block', () => {
      const md = '\n\n  ```json   \n\n  {"x":1}  \n\n  ```  \n\n';
      expect(extractLastJsonBlock(md)).toEqual({ x: 1 });
    });
  });
});
