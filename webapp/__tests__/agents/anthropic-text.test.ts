import { describe, it, expect } from 'vitest';

import {
  anthropicTimeoutMs,
  computeCostUsd,
  extractLastJsonBlock,
} from '@/lib/providers/anthropic-text';

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

    it('prices gpt-5.5 at $5/M input + $30/M output (not Sonnet-default)', () => {
      const cost = computeCostUsd(
        { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        'gpt-5.5',
      );
      expect(cost).toBeCloseTo(35.0, 4);
    });

    it('prices gpt-5.4-mini at $0.75/M input + $4.50/M output (more-specific prefix wins)', () => {
      const cost = computeCostUsd(
        { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        'gpt-5.4-mini',
      );
      expect(cost).toBeCloseTo(5.25, 4);
    });

    it('prices gpt-5.4 (full) at $2.50/M input + $15/M output', () => {
      const cost = computeCostUsd(
        { inputTokens: 1_000_000, outputTokens: 0 },
        'gpt-5.4',
      );
      expect(cost).toBeCloseTo(2.5, 4);
    });

    it('prices gemini-2.5-flash at $0.30/M input + $2.50/M output', () => {
      const cost = computeCostUsd(
        { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        'gemini-2.5-flash',
      );
      expect(cost).toBeCloseTo(2.8, 4);
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

  describe('anthropicTimeoutMs (D6 — maxTokens-scaled SDK timeout)', () => {
    it('gives the 4k critic ~3 min — enough for a healthy critic call', () => {
      // floor 60s + 4000 * 30ms = 180_000ms
      expect(anthropicTimeoutMs(4000)).toBe(180_000);
    });

    it('does NOT clip the 16k Screenwriter (clamps to the 8-min cap, still > ~5 min)', () => {
      // 60s + 16000*30ms = 540_000 would exceed the belt → clamped to 480_000
      expect(anthropicTimeoutMs(16000)).toBe(8 * 60_000);
    });

    it('stays strictly below the 10-minute exec-* finishTimeout belt for any input', () => {
      for (const tokens of [0, 4000, 12000, 16000, 100000]) {
        expect(anthropicTimeoutMs(tokens)).toBeLessThan(10 * 60_000);
      }
    });

    it('never returns below the fixed floor (short/zero-token calls)', () => {
      expect(anthropicTimeoutMs(0)).toBe(60_000);
      expect(anthropicTimeoutMs(-5)).toBe(60_000);
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
