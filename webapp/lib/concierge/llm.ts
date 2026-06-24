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
// Anthropic ships an OpenAI-compatible surface at /v1/ (same OpenAI SDK, just a
// different baseURL + key + model). Routing the concierge here keeps the whole
// existing tool-loop unchanged while running Polina on Claude (Director 2026-06-24:
// try Opus 4.8 for Polina — costs/time/nerves vs gpt-5.*). Tokens use `max_tokens`
// like Gemini; isGpt5 is false for a claude-* model → temperature sent, no
// reasoning_effort (exactly what Claude wants).
const ANTHROPIC_OPENAI_BASE = 'https://api.anthropic.com/v1/';

export type ConciergeProvider = 'openai' | 'gemini' | 'anthropic';

export function conciergeProvider(): ConciergeProvider {
  const p = (process.env.CONCIERGE_PROVIDER ?? '').toLowerCase();
  if (p === 'gemini') return 'gemini';
  if (p === 'anthropic' || p === 'opus' || p === 'claude') return 'anthropic';
  return 'openai';
}

export function conciergeModel(): string {
  const provider = conciergeProvider();
  if (provider === 'gemini') {
    return process.env.CONCIERGE_GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  }
  if (provider === 'anthropic') {
    return process.env.CONCIERGE_ANTHROPIC_MODEL?.trim() || 'claude-opus-4-8';
  }
  return getServerEnv().OPENAI_MODEL || 'gpt-5.4-mini';
}

export function createConciergeClient(): OpenAI {
  const provider = conciergeProvider();
  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        'CONCIERGE_PROVIDER=gemini but GEMINI_API_KEY is missing — set it or unset CONCIERGE_PROVIDER',
      );
    }
    return new OpenAI({ apiKey, baseURL: GEMINI_OPENAI_BASE });
  }
  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        'CONCIERGE_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing — set it or unset CONCIERGE_PROVIDER',
      );
    }
    return new OpenAI({ apiKey, baseURL: ANTHROPIC_OPENAI_BASE });
  }
  return new OpenAI({ apiKey: getServerEnv().OPENAI_API_KEY });
}

/**
 * Output-token cap under the param name the active provider expects.
 * OpenAI: max_completion_tokens · Gemini & Anthropic OpenAI-compat: max_tokens.
 */
export function conciergeMaxTokensParam(n: number): Record<string, number> {
  return conciergeProvider() === 'openai'
    ? { max_completion_tokens: n }
    : { max_tokens: n };
}

/**
 * Whether to send the `temperature` param. Opus 4.x via Anthropic OpenAI-compat
 * rejects it ("`temperature` is deprecated for this model" → 400), so the
 * concierge routes must omit it there. OpenAI (non-gpt5) + Gemini still take it.
 */
export function conciergeSupportsTemperature(): boolean {
  return conciergeProvider() !== 'anthropic';
}
