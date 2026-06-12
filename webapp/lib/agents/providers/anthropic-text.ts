// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/anthropic-text.ts
// Generic Anthropic Claude text adapter for production text agents
// (Screenwriter, Script Reviewer, Storyboarder, World Checker, Copywriter, etc.).
//
// Mirrors the pattern of providers/anthropic-brief.ts but generalised:
// - any system prompt + user message
// - any model id (haiku / sonnet / opus)
// - optional fenced ```json block parsing for structured outputs
// - cost computation from response.usage
//
// Usage example (from a per-agent runner):
//
//   const result = await generateAnthropicText({
//     systemPrompt,
//     userMessage,
//     model: 'claude-sonnet-4-6',
//     maxOutputTokens: 4000,
//     expectsJson: true,
//   });
//
// Returns: { markdown, body, costUsd, model, stopReason, usage }
// ──────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { generateGeminiTextRaw } from './gemini-text';
import { checkersFreeTierEnabled } from '../chain-flags';

/**
 * TEXT_LLM_DEBUG_TIER (Director q8b 2026-06-11): when on, EVERY text-agent
 * call in this server process routes to the Gemini free tier instead of
 * Anthropic — for Mode-4 / smoke pipeline runs so they cost $0 in API
 * credits. Process-wide by design (smoke servers run one episode at a time);
 * Mode 1-3 production servers must keep this flag OFF.
 */
function debugTierEnabled(): boolean {
  const v = process.env.TEXT_LLM_DEBUG_TIER;
  return v === 'true' || v === '1';
}

/**
 * F7 (2026-06-12) — pure routing decision, exported as a test seam.
 * Free tier when: the process-wide debug kill-switch is on (Mode-4 smokes,
 * frees EVERYTHING), or the call is a `checker` and CHECKERS_FREE_TIER is on
 * (default). Creators stay on paid Anthropic in Modes 1-3.
 */
export function wantsGeminiFreeTier(agentClass?: 'creator' | 'checker'): boolean {
  return (
    debugTierEnabled() || (agentClass === 'checker' && checkersFreeTierEnabled())
  );
}

export interface AnthropicTextInput {
  /** System prompt — usually loaded from agents/exec/<role>.md by the caller. */
  systemPrompt: string;
  /** User message — upstream context (brief, script, etc.) + task instructions. */
  userMessage: string;
  /** Model id from registry.ts resolveModelId(). */
  model: string;
  /** Hard cap on output tokens. Default 4000. */
  maxOutputTokens?: number;
  /**
   * If true, runner asks Claude to end the response with a single fenced
   * ```json block. Adapter parses it and returns it as `body`. If parsing
   * fails, throws AnthropicTextError (caller can decide to retry or fail).
   */
  expectsJson?: boolean;
  /**
   * F7 (2026-06-12) — per-agent-class routing. `checker` (critics, reviewers,
   * mechanical extraction) routes to the Gemini free tier in ALL modes while
   * CHECKERS_FREE_TIER is on (default). Default class is `creator` (paid
   * Anthropic, unless the process-wide TEXT_LLM_DEBUG_TIER kill-switch frees
   * everything for Mode-4 smokes).
   */
  agentClass?: 'creator' | 'checker';
}

export interface AnthropicTextResult {
  /** Full markdown response, exactly as returned by Claude (incl. fenced JSON). */
  markdown: string;
  /** Parsed last fenced ```json block, or null when expectsJson === false. */
  body: Record<string, unknown> | null;
  /** USD cost computed from usage tokens × per-million rate for the chosen model. */
  costUsd: number;
  /** Same model id we passed in. */
  model: string;
  /** Anthropic stop reason — `end_turn` is normal, `max_tokens` means truncated. */
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
}

export class AnthropicTextError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AnthropicTextError';
  }
}

// Per-million-tokens USD rates. Source: Anthropic public pricing
// (https://www.anthropic.com/pricing). Stored as a const map so cost computation
// stays a pure function of (usage, model). When a new model lands, add a row.
//
// We match by *prefix* — model ids include date suffixes (e.g. -20251001) that
// we don't want to hardcode; the family id alone is enough for pricing.
interface ModelRate {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}
const MODEL_RATES: ReadonlyArray<{ prefix: string; rate: ModelRate }> = [
  { prefix: 'claude-haiku-4',  rate: { inputUsdPerMillion: 0.80, outputUsdPerMillion: 4.00 } },
  { prefix: 'claude-sonnet-4', rate: { inputUsdPerMillion: 3.00, outputUsdPerMillion: 15.00 } },
  { prefix: 'claude-opus-4',   rate: { inputUsdPerMillion: 15.00, outputUsdPerMillion: 75.00 } },
];

function rateFor(model: string): ModelRate {
  const found = MODEL_RATES.find((r) => model.startsWith(r.prefix));
  if (!found) {
    // Unknown model — use Sonnet rates as a conservative default and let the
    // cost ceiling on the contract catch any surprise. Don't throw — that
    // would block production work over a pricing-table miss.
    return MODEL_RATES.find((r) => r.prefix === 'claude-sonnet-4')!.rate;
  }
  return found.rate;
}

export function computeCostUsd(
  usage: { inputTokens: number; outputTokens: number },
  model: string,
): number {
  const rate = rateFor(model);
  const usd =
    (usage.inputTokens * rate.inputUsdPerMillion) / 1_000_000 +
    (usage.outputTokens * rate.outputUsdPerMillion) / 1_000_000;
  // Round to 4 decimals for predictable cost ledgers.
  return Math.round(usd * 10_000) / 10_000;
}

/**
 * Extract the LAST fenced ```json block from a markdown body.
 * Last (not first) so models that include schema examples in their reasoning
 * still emit the canonical JSON at the end.
 *
 * Returns null when no parseable block is found — caller decides whether
 * that's an error.
 */
export function extractLastJsonBlock(markdown: string): Record<string, unknown> | null {
  // Non-greedy match on inner content; allow any whitespace/newlines.
  const matches = [...markdown.matchAll(/```json\s*([\s\S]+?)```/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]?.[1];
  if (!last) return null;
  try {
    const parsed: unknown = JSON.parse(last.trim());
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export async function generateAnthropicText(
  input: AnthropicTextInput,
): Promise<AnthropicTextResult> {
  const maxTokens = input.maxOutputTokens ?? 4000;

  let markdown: string;
  let model: string;
  let stopReason: string | null;
  let usage: { inputTokens: number; outputTokens: number };
  let costUsd: number;

  // F7 routing: process-wide debug tier (Mode-4 smokes) frees everything;
  // otherwise checkers ride the free tier per CHECKERS_FREE_TIER (default on).
  // Missing GEMINI_API_KEY falls back to Anthropic LOUDLY rather than killing
  // the critic chain — free tier is an optimisation, not a dependency.
  const wantsFreeTier = wantsGeminiFreeTier(input.agentClass);
  const geminiKeyOk = Boolean(process.env.GEMINI_API_KEY?.trim());
  if (wantsFreeTier && !geminiKeyOk && !debugTierEnabled()) {
    // eslint-disable-next-line no-console
    console.warn(
      '[anthropic-text] checker free tier requested but GEMINI_API_KEY missing — falling back to Anthropic (paid)',
    );
  }

  if (wantsFreeTier && (geminiKeyOk || debugTierEnabled())) {
    // Debug tier — Gemini free tier, $0. Same raw shape; the shared JSON
    // post-processing below applies identically to both branches.
    let raw: Awaited<ReturnType<typeof generateGeminiTextRaw>>;
    try {
      raw = await generateGeminiTextRaw({
        systemPrompt: input.systemPrompt,
        userMessage: input.userMessage,
        maxOutputTokens: maxTokens,
      });
    } catch (err: unknown) {
      throw new AnthropicTextError(
        `Debug-tier (gemini) call failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
    markdown = raw.markdown;
    model = raw.model;
    stopReason = raw.stopReason;
    usage = raw.usage;
    costUsd = 0;
  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new AnthropicTextError('ANTHROPIC_API_KEY is not set');
    }

    const client = new Anthropic({ apiKey });

    let response: Awaited<ReturnType<typeof client.messages.create>>;
    try {
      response = await client.messages.create({
        model: input.model,
        max_tokens: maxTokens,
        system: input.systemPrompt,
        messages: [{ role: 'user', content: input.userMessage }],
      });
    } catch (err: unknown) {
      throw new AnthropicTextError(
        `Anthropic call failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    markdown = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    model = input.model;
    stopReason = response.stop_reason ?? null;
    usage = {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };
    costUsd = computeCostUsd(usage, model);
  }

  if (!markdown) {
    throw new AnthropicTextError(
      `Empty response from ${model} (stop_reason=${stopReason ?? 'unknown'})`,
    );
  }

  let body: Record<string, unknown> | null = null;
  if (input.expectsJson) {
    body = extractLastJsonBlock(markdown);
    if (!body) {
      throw new AnthropicTextError(
        `Expected fenced \`\`\`json block at end of response but none parsed (stop_reason=${stopReason ?? 'unknown'}, output ${markdown.length} chars)`,
      );
    }
  }

  return {
    markdown,
    body,
    costUsd,
    model,
    stopReason,
    usage,
  };
}
