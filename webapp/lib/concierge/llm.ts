// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/llm.ts
// Single source of truth for the Prod Assistant (concierge / Polina) LLM client.
//
// Default provider is OpenAI (gpt-5.*). Set CONCIERGE_PROVIDER=gemini to route
// the concierge through Gemini's OpenAI-COMPATIBLE endpoint — same OpenAI SDK,
// just a different baseURL + key + model, so function-calling and the existing
// tool-loop keep working unchanged. Director directive 2026-06-15: try Polina on
// the Gemini free tier to stop burning OpenAI credits (he is on Google ULTRA).
//
// Studio production agents are UNAFFECTED — they route through anthropic-text /
// gemini-text on their own flags. This module is concierge-only.
//
// Param note: OpenAI uses `max_completion_tokens`; Gemini's compat layer expects
// `max_tokens`. conciergeMaxTokensParam() returns the right one per provider.
// `isGpt5` in each route is derived from the model string, so a Gemini model
// naturally yields isGpt5=false → temperature is sent, reasoning_effort is not
// (exactly what Gemini wants). No per-route branching needed beyond the client,
// model, and token-param.
// ──────────────────────────────────────────────────────────────────────────────

import OpenAI from 'openai';
import { getServerEnv } from '@/lib/env';

const GEMINI_OPENAI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/';

export type ConciergeProvider = 'openai' | 'gemini';

export function conciergeProvider(): ConciergeProvider {
  return (process.env.CONCIERGE_PROVIDER ?? '').toLowerCase() === 'gemini'
    ? 'gemini'
    : 'openai';
}

export function conciergeModel(): string {
  if (conciergeProvider() === 'gemini') {
    return process.env.CONCIERGE_GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  }
  return getServerEnv().OPENAI_MODEL || 'gpt-5.4-mini';
}

export function createConciergeClient(): OpenAI {
  if (conciergeProvider() === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        'CONCIERGE_PROVIDER=gemini but GEMINI_API_KEY is missing — set it or unset CONCIERGE_PROVIDER',
      );
    }
    return new OpenAI({ apiKey, baseURL: GEMINI_OPENAI_BASE });
  }
  return new OpenAI({ apiKey: getServerEnv().OPENAI_API_KEY });
}

/**
 * Output-token cap under the param name the active provider expects.
 * OpenAI: max_completion_tokens · Gemini compat: max_tokens.
 */
export function conciergeMaxTokensParam(n: number): Record<string, number> {
  return conciergeProvider() === 'gemini'
    ? { max_tokens: n }
    : { max_completion_tokens: n };
}
