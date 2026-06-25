// Unit tests for the goal-loop slice 1 spin guard (2026-06-23). The round cap
// became a runaway backstop; these guards are what keep a high cap safe given
// Polina's own LLM rounds are not budget-tracked.

import { describe, expect, test } from 'vitest';
import {
  AUTO_REACT_ROUND_BACKSTOP,
  MAX_NOPROGRESS_ROUNDS,
  evaluateRound,
  toolCallSignature,
  type RoundCall,
} from '@/lib/concierge/auto-react-loop';

const read = (name: string, argsJson?: string): RoundCall => ({
  name,
  argsJson: argsJson ?? '{}',
  mutating: false,
});
const mutate = (name: string, argsJson?: string): RoundCall => ({
  name,
  argsJson: argsJson ?? '{}',
  mutating: true,
});

describe('constants', () => {
  test('backstop is a tight per-wake runaway cap (2026-06-25: 25→6, env-driven)', () => {
    // The SPIN guard stops earlier on duplicate/no-progress; the cap is a
    // last-resort bound that fails safe-and-visible (cut-off escalates).
    expect(AUTO_REACT_ROUND_BACKSTOP).toBeGreaterThanOrEqual(2);
    expect(AUTO_REACT_ROUND_BACKSTOP).toBeLessThanOrEqual(10);
    expect(MAX_NOPROGRESS_ROUNDS).toBe(3);
  });
});

describe('toolCallSignature', () => {
  test('same name + semantically-equal args share a signature (key order/whitespace agnostic)', () => {
    const a = toolCallSignature('getAsset', '{"id":"x","v":1}');
    const b = toolCallSignature('getAsset', '{ "v": 1, "id": "x" }');
    expect(a).toBe(b);
  });

  test('different args produce different signatures', () => {
    expect(toolCallSignature('getAsset', '{"id":"x"}')).not.toBe(
      toolCallSignature('getAsset', '{"id":"y"}'),
    );
  });

  test('different tool names produce different signatures', () => {
    expect(toolCallSignature('a', '{}')).not.toBe(toolCallSignature('b', '{}'));
  });

  test('tolerates malformed args json', () => {
    expect(() => toolCallSignature('t', 'not json')).not.toThrow();
    expect(() => toolCallSignature('t', undefined)).not.toThrow();
  });
});

describe('evaluateRound', () => {
  test('a healthy round with new calls makes progress and does not stop', () => {
    const seen = new Set<string>();
    const state = { noProgress: 0 };
    expect(evaluateRound([read('getEpisode'), mutate('triggerAgent', '{"a":1}')], seen, state)).toEqual({
      stop: false,
    });
    expect(state.noProgress).toBe(0);
  });

  test('stops IMMEDIATELY on a duplicate mutating call (duplicate generation)', () => {
    const seen = new Set<string>();
    const state = { noProgress: 0 };
    evaluateRound([mutate('triggerAgent', '{"shot":"A1"}')], seen, state);
    const verdict = evaluateRound([mutate('triggerAgent', '{"shot":"A1"}')], seen, state);
    expect(verdict.stop).toBe(true);
    if (verdict.stop) expect(verdict.reason).toContain('duplicate mutating call triggerAgent');
  });

  test('a repeated READ-ONLY call does NOT stop immediately (only counts as no-progress)', () => {
    const seen = new Set<string>();
    const state = { noProgress: 0 };
    evaluateRound([read('getRecentActivityEvents')], seen, state);
    const verdict = evaluateRound([read('getRecentActivityEvents')], seen, state);
    expect(verdict.stop).toBe(false);
    expect(state.noProgress).toBe(1);
  });

  test('stops after MAX_NOPROGRESS_ROUNDS rounds with no new action', () => {
    const seen = new Set<string>();
    const state = { noProgress: 0 };
    evaluateRound([read('getEpisode')], seen, state); // progress
    expect(evaluateRound([read('getEpisode')], seen, state).stop).toBe(false); // 1
    expect(evaluateRound([read('getEpisode')], seen, state).stop).toBe(false); // 2
    const third = evaluateRound([read('getEpisode')], seen, state); // 3 → stop
    expect(third.stop).toBe(true);
    if (third.stop) expect(third.reason).toContain('no new action');
  });

  test('progress resets the no-progress streak', () => {
    const seen = new Set<string>();
    const state = { noProgress: 0 };
    evaluateRound([read('getEpisode')], seen, state);
    evaluateRound([read('getEpisode')], seen, state); // noProgress 1
    expect(state.noProgress).toBe(1);
    evaluateRound([read('getNextGate')], seen, state); // new → reset
    expect(state.noProgress).toBe(0);
  });
});
