// F7 (2026-06-12) — per-agent-class LLM routing decision.
// checkers → Gemini free tier in ALL modes while CHECKERS_FREE_TIER is on
// (default); creators → paid Anthropic unless the process-wide
// TEXT_LLM_DEBUG_TIER kill-switch (Mode-4 smokes) frees everything.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { wantsGeminiFreeTier } from '@/lib/agents/providers/anthropic-text';
import { checkersFreeTierEnabled } from '@/lib/agents/chain-flags';

const ENV_KEYS = ['TEXT_LLM_DEBUG_TIER', 'CHECKERS_FREE_TIER'] as const;
const ORIGINAL: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    ORIGINAL[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL[k];
  }
});

describe('checkersFreeTierEnabled — default ON, explicit off', () => {
  it('defaults ON when env is unset', () => {
    expect(checkersFreeTierEnabled()).toBe(true);
  });
  it('rollback via false/0/off', () => {
    for (const v of ['false', '0', 'off', 'OFF', 'False']) {
      process.env.CHECKERS_FREE_TIER = v;
      expect(checkersFreeTierEnabled()).toBe(false);
    }
  });
  it('any other value keeps it on', () => {
    process.env.CHECKERS_FREE_TIER = 'true';
    expect(checkersFreeTierEnabled()).toBe(true);
  });
});

describe('wantsGeminiFreeTier — class routing', () => {
  it('checker → free tier by default (all modes)', () => {
    expect(wantsGeminiFreeTier('checker')).toBe(true);
  });
  it('creator → paid Anthropic by default', () => {
    expect(wantsGeminiFreeTier('creator')).toBe(false);
    expect(wantsGeminiFreeTier(undefined)).toBe(false);
  });
  it('CHECKERS_FREE_TIER=false rolls checkers back to paid', () => {
    process.env.CHECKERS_FREE_TIER = 'false';
    expect(wantsGeminiFreeTier('checker')).toBe(false);
  });
  it('TEXT_LLM_DEBUG_TIER kill-switch frees EVERYTHING (Mode-4 smokes)', () => {
    process.env.TEXT_LLM_DEBUG_TIER = 'true';
    process.env.CHECKERS_FREE_TIER = 'false';
    expect(wantsGeminiFreeTier('creator')).toBe(true);
    expect(wantsGeminiFreeTier('checker')).toBe(true);
    expect(wantsGeminiFreeTier(undefined)).toBe(true);
  });
});
