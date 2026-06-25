import { describe, it, expect, afterEach } from 'vitest';

import { conciergeReasoningParam } from '@/lib/concierge/llm';

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
