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

// ── Live provider override (Director 2026-07-05) ─────────────────────────────
// The studio Settings → Providers "Полина" dropdown persists a { provider, model }
// choice in app_config; concierge routes apply it into this process-level cache at
// request start (applyConciergeProviderOverride in lib/api/concierge-provider-config).
// All the sync resolvers below read the cache FIRST, then env — so a dropdown flip
// takes effect on the next request with no restart. Global by design (studio-wide
// choice), so the shared per-process cache converging on the latest value is correct.
let _override: { provider: ConciergeProvider; model?: string } | null = null;
export function _setConciergeOverride(o: { provider: ConciergeProvider; model?: string } | null): void {
  _override = o;
}

export function conciergeProvider(): ConciergeProvider {
  if (_override) return _override.provider;
  const p = (process.env.CONCIERGE_PROVIDER ?? '').toLowerCase();
  if (p === 'gemini') return 'gemini';
  if (p === 'anthropic' || p === 'opus' || p === 'claude') return 'anthropic';
  return 'openai';
}

export function conciergeModel(): string {
  const provider = conciergeProvider();
  if (_override?.model && _override.provider === provider) return _override.model;
  if (provider === 'gemini') {
    return process.env.CONCIERGE_GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  }
  if (provider === 'anthropic') {
    return process.env.CONCIERGE_ANTHROPIC_MODEL?.trim() || 'claude-opus-4-8';
  }
  return getServerEnv().OPENAI_MODEL || 'gpt-5.4-mini';
}

const PROVIDER_DISPLAY: Record<ConciergeProvider, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  anthropic: 'Anthropic',
};

/**
 * Honest, human-readable name of the model that ACTUALLY serves the Prod
 * Assistant right now — e.g. "OpenAI · gpt-5.5", "Anthropic · claude-opus-4-8".
 * Read live from env (same source the client uses), so the chat header never
 * lies about which provider/model is running. Surfaced via GET /api/concierge/chat.
 */
export function conciergeModelLabel(): string {
  return `${PROVIDER_DISPLAY[conciergeProvider()]} · ${conciergeModel()}`;
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

/**
 * Reasoning-budget param for the anthropic provider (2026-06-25 cost fix).
 *
 * Root cause of the $100/day drain: Opus 4.x defaults to UNCAPPED extended
 * thinking (billed at output rate), and the routes only sent `reasoning_effort`
 * when `isGpt5` — so for claude-opus-4-8 it was dropped and thinking ran free.
 * Polina is a dispatcher (call a tool / answer short), so thinking should be
 * minimal. On Anthropic's OpenAI-compat surface the lever is `reasoning_effort`
 * (the native `thinking:{type:disabled}` struct isn't exposed there); 'minimal'
 * is the lowest setting. Override via CONCIERGE_REASONING_EFFORT.
 *
 * OpenAI (gpt-5) keeps its existing route-side reasoning handling (applied only
 * on tool-disabled rounds) → return {} here. Gemini → {}.
 */
export function conciergeReasoningParam(): Record<string, string> {
  if (conciergeProvider() !== 'anthropic') return {};
  const effort = process.env.CONCIERGE_REASONING_EFFORT?.trim() || 'minimal';
  return { reasoning_effort: effort };
}

/**
 * Is `model` an OpenAI GPT-5-family model? Single source of truth for the three
 * concierge routes (was a copy-pasted regex in each).
 *
 * The GPT-5 family names by tier suffix, not just version — per OpenAI's model
 * catalogue (developers.openai.com/api/docs/models): `gpt-5.6-sol` (frontier,
 * alias `gpt-5.6`), `gpt-5.6-terra` (balanced), `gpt-5.6-luna` (cost). Earlier
 * points ship too (`gpt-5.5`, `gpt-5.4-mini`). All are reasoning models, so all
 * hit the tools-vs-reasoning_effort rule below — the match must therefore accept
 * `gpt-5` followed by a dot (`gpt-5.6…`), a dash (`gpt-5-…`), or end of string.
 * Bare tier codenames (`sol`/`terra`/`luna` without the `gpt-5.6-` prefix) are
 * NOT valid API ids and are intentionally NOT matched — keep catalogue ids full.
 */
export function isOpenAiGpt5Model(model: string): boolean {
  return /^gpt-5(\.|-|$)/.test(model);
}

/**
 * OpenAI gpt-5* `reasoning_effort` for one chat.completions round.
 *
 * gpt-5* on /v1/chat/completions REJECTS function tools combined with any
 * reasoning_effort other than 'none' (400: "Function tools with reasoning_effort
 * are not supported for <model> … set reasoning_effort to 'none'"). Older gpt-5
 * models tolerated OMITTING the param on a tool round; newer ones (gpt-5.6-luna)
 * default to a reasoning mode, so omission STILL trips the 400 — the only safe
 * value alongside tools is an explicit 'none'. On tool-disabled rounds we honor
 * the configured effort (OPENAI_REASONING_EFFORT), defaulting to omit.
 *
 * Returns {} for non-gpt-5 models (gemini/anthropic handle reasoning elsewhere,
 * via conciergeReasoningParam / native path).
 */
export function conciergeOpenAiReasoningParam(
  isGpt5: boolean,
  hasTools: boolean,
  configuredEffort?: string,
): Record<string, string> {
  if (!isGpt5) return {};
  if (hasTools) return { reasoning_effort: 'none' };
  return configuredEffort ? { reasoning_effort: configuredEffort } : {};
}

/**
 * Native @anthropic-ai/sdk path for the concierge (prompt caching +
 * thinking-disable), gated behind CONCIERGE_ANTHROPIC_NATIVE. Only meaningful
 * when the provider is 'anthropic' — the OpenAI-compat surface Polina uses today
 * silently drops both cache_control and thinking (docs-confirmed), and ignores
 * reasoning_effort, so the native SDK is the only way to actually cache the
 * ~12-16 KB stable prefix + cap reasoning.
 *
 * Default FALSE → the existing OpenAI-compat path (today's working behavior).
 * Flip to true to enable; unset/false to instantly revert with no code change.
 */
export function conciergeAnthropicNativeEnabled(): boolean {
  return (
    conciergeProvider() === 'anthropic' &&
    (process.env.CONCIERGE_ANTHROPIC_NATIVE ?? 'false').toLowerCase() === 'true'
  );
}
