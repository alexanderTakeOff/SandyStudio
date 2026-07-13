import { describe, it, expect, afterEach } from 'vitest';

import {
  conciergeReasoningParam,
  conciergeOpenAiReasoningParam,
  isOpenAiGpt5Model,
} from '@/lib/concierge/llm';

const ENV_KEYS = ['CONCIERGE_PROVIDER', 'CONCIERGE_REASONING_EFFORT'] as const;
const saved: Record<string, string | undefined> = {};

function setEnv(k: string, v: string | undefined) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

afterEach(() => {
  for (const k of ENV_KEYS) setEnv(k, saved[k]);
});

// Capture originals once.
for (const k of ENV_KEYS) saved[k] = process.env[k];

describe('conciergeReasoningParam — caps Opus extended thinking (2026-06-25 $-fix)', () => {
  it('returns reasoning_effort:minimal for the anthropic provider', () => {
    setEnv('CONCIERGE_PROVIDER', 'anthropic');
    setEnv('CONCIERGE_REASONING_EFFORT', undefined);
    expect(conciergeReasoningParam()).toEqual({ reasoning_effort: 'minimal' });
  });

  it('honors CONCIERGE_REASONING_EFFORT override on anthropic', () => {
    setEnv('CONCIERGE_PROVIDER', 'opus'); // alias → anthropic
    setEnv('CONCIERGE_REASONING_EFFORT', 'low');
    expect(conciergeReasoningParam()).toEqual({ reasoning_effort: 'low' });
  });

  it('returns {} for openai (gpt-5 keeps its own route-side reasoning handling)', () => {
    setEnv('CONCIERGE_PROVIDER', 'openai');
    expect(conciergeReasoningParam()).toEqual({});
  });

  it('returns {} when provider unset (defaults to openai)', () => {
    setEnv('CONCIERGE_PROVIDER', undefined);
    expect(conciergeReasoningParam()).toEqual({});
  });

  it('returns {} for gemini', () => {
    setEnv('CONCIERGE_PROVIDER', 'gemini');
    expect(conciergeReasoningParam()).toEqual({});
  });
});

describe('isOpenAiGpt5Model — GPT-5-family detection (single source of truth)', () => {
  it('matches every GPT-5.6 tier id, including codename suffixes', () => {
    for (const m of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6']) {
      expect(isOpenAiGpt5Model(m)).toBe(true);
    }
  });

  it('matches earlier GPT-5 point releases and mini variants', () => {
    expect(isOpenAiGpt5Model('gpt-5.5')).toBe(true);
    expect(isOpenAiGpt5Model('gpt-5.4-mini')).toBe(true);
    expect(isOpenAiGpt5Model('gpt-5')).toBe(true);
  });

  it('does NOT match bare tier codenames or other providers', () => {
    // bare `sol` was the catalogue bug — not a valid API id, must be false
    expect(isOpenAiGpt5Model('sol')).toBe(false);
    expect(isOpenAiGpt5Model('terra')).toBe(false);
    expect(isOpenAiGpt5Model('gpt-4o')).toBe(false);
    expect(isOpenAiGpt5Model('claude-opus-4-8')).toBe(false);
    expect(isOpenAiGpt5Model('gemini-2.5-flash')).toBe(false);
  });
});

describe('conciergeOpenAiReasoningParam — tools + reasoning_effort=none rule', () => {
  it('forces reasoning_effort:none on tool rounds for any GPT-5 model', () => {
    // The 400 fix: gpt-5.6-* default to reasoning, so OMITTING the param on a
    // tool round still trips "Function tools with reasoning_effort not supported".
    expect(conciergeOpenAiReasoningParam(true, true, 'high')).toEqual({
      reasoning_effort: 'none',
    });
    expect(conciergeOpenAiReasoningParam(true, true, undefined)).toEqual({
      reasoning_effort: 'none',
    });
  });

  it('honors the configured effort on tool-disabled rounds', () => {
    expect(conciergeOpenAiReasoningParam(true, false, 'medium')).toEqual({
      reasoning_effort: 'medium',
    });
  });

  it('omits the param when no effort configured and no tools', () => {
    expect(conciergeOpenAiReasoningParam(true, false, undefined)).toEqual({});
  });

  it('returns {} for non-GPT-5 models regardless of tools/effort', () => {
    expect(conciergeOpenAiReasoningParam(false, true, 'high')).toEqual({});
    expect(conciergeOpenAiReasoningParam(false, false, 'high')).toEqual({});
  });
});
