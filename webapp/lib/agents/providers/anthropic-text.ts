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

// ── D6 (2026-07-11): bound the Anthropic SDK call ────────────────────────────
// A bare `client.messages.create(...)` inherits the SDK's 10-minute DEFAULT
// timeout. That is exactly the exec-eprev critic tail-hang the Director hit on
// E27: a wedged provider socket rode to `finishTimeout: '10m'`, leasing the
// episode concurrency slot the whole time and starving the fanout. The SDK's own
// `timeout` option uses an AbortController — the SDK-native equivalent of the
// shared `fetchWithTimeout` wrapper (which the SDK bypasses).
//
// The budget is SCALED to maxTokens because a healthy non-streaming generation
// grows with output length: the Screenwriter (16k tokens) legitimately runs
// ~4-5 min while the critic (4k) finishes in ~1-2 min. A flat 120s (gemini-text's
// LLM_TEXT_MS) would false-abort the Writer and waste the paid generation. We
// budget a conservative ~33 tok/s floor + fixed overhead, clamped BELOW the 10m
// finishTimeout belt so the abort — plus one retry — settles the run and frees
// the slot instead of hanging.
const ANTHROPIC_TIMEOUT_FLOOR_MS = 60_000; // fixed overhead + short calls
const ANTHROPIC_TIMEOUT_MS_PER_TOKEN = 30; // ~33 tok/s conservative healthy rate
const ANTHROPIC_TIMEOUT_CAP_MS = 8 * 60_000; // < exec-* finishTimeout belt (10m)
const ANTHROPIC_MAX_RETRIES = 1; // timeout*(1+retries) stays < the 10m belt

/** Per-call SDK timeout (ms), scaled to output length. Exported as a test seam. */
export function anthropicTimeoutMs(maxTokens: number): number {
  return Math.min(
    ANTHROPIC_TIMEOUT_CAP_MS,
    ANTHROPIC_TIMEOUT_FLOOR_MS + Math.max(0, maxTokens) * ANTHROPIC_TIMEOUT_MS_PER_TOKEN,
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
  /**
   * Which engine actually produced this text:
   *   'anthropic'       — the requested Claude model (normal path)
   *   'gemini'          — Gemini free tier by routing (debug tier / checker free tier)
   *   'gemini-fallback' — Claude was OVERLOADED (HTTP 529) so we fell back to Gemini
   * Runners surface this so the activity feed shows when a shot was carried by
   * the fallback engine instead of failing on an Anthropic overload.
   */
  provider: 'anthropic' | 'gemini' | 'gemini-fallback';
}

export class AnthropicTextError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AnthropicTextError';
  }
}

// Per-million-tokens USD rates. Stored as a const map so cost computation stays a
// pure function of (usage, model). When a new model lands, add a row.
//
// Covers BOTH studio Anthropic agents AND the concierge (Polина) tiers — `cost.ts`
// calls computeCostUsd on whatever model Polина runs on, so non-Anthropic ids MUST
// be priced here or the cost ledger + the concierge cost-breaker silently default to
// Sonnet (the 2026-06-27 mis-pricing bug). Sources: Anthropic public pricing
// (anthropic.com/pricing); OpenAI (developers.openai.com/api/docs/pricing) + Gemini
// (ai.google.dev/gemini-api/docs/pricing), verified 2026-06-27.
//
// We match by *prefix* — model ids include date suffixes (e.g. -20251001) we don't
// hardcode; the family id alone is enough. ORDER MATTERS: find() returns the first
// match, so a more-specific prefix (gpt-5.4-mini) MUST precede a less-specific one
// (gpt-5.4).
interface ModelRate {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}
const MODEL_RATES: ReadonlyArray<{ prefix: string; rate: ModelRate }> = [
  { prefix: 'claude-haiku-4',   rate: { inputUsdPerMillion: 0.80, outputUsdPerMillion: 4.00 } },
  { prefix: 'claude-sonnet-4',  rate: { inputUsdPerMillion: 3.00, outputUsdPerMillion: 15.00 } },
  { prefix: 'claude-opus-4',    rate: { inputUsdPerMillion: 15.00, outputUsdPerMillion: 75.00 } },
  // Concierge (Polина) tiers — keep ahead-of-the-mini ordering in mind.
  { prefix: 'gpt-5.5',          rate: { inputUsdPerMillion: 5.00, outputUsdPerMillion: 30.00 } },
  { prefix: 'gpt-5.4-mini',     rate: { inputUsdPerMillion: 0.75, outputUsdPerMillion: 4.50 } },
  { prefix: 'gpt-5.4',          rate: { inputUsdPerMillion: 2.50, outputUsdPerMillion: 15.00 } },
  { prefix: 'gemini-2.5-flash', rate: { inputUsdPerMillion: 0.30, outputUsdPerMillion: 2.50 } },
];

/**
 * True when `model` has a real entry in MODEL_RATES — i.e. its recorded cost is
 * priced, not the Sonnet fallback below.
 *
 * Exported (2026-07-25) because the fallback is SILENT: an unlisted model still
 * produces a plausible-looking dollar figure, so a mispriced model is invisible in
 * the ledger. The Budget tab reads this to name the unpriced models it found
 * instead of quietly presenting guesses as facts. Add the model's real rate here
 * (verify against the vendor's live pricing page — training data lags) and the
 * warning disappears on its own.
 */
export function isModelPriced(model: string | null | undefined): boolean {
  if (!model) return false;
  return MODEL_RATES.some((r) => model.startsWith(r.prefix));
}

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

// Anthropic prompt-caching price multipliers on the BASE input rate (uniform
// across Claude tiers): a 5-minute cache WRITE costs 1.25× input, a cache READ
// costs 0.10× input. Non-Claude models never send cache tokens, so these apply
// only when cacheRead/cacheWrite are non-zero (Claude native path).
const CACHE_WRITE_MULT = 1.25;
const CACHE_READ_MULT = 0.1;

export function computeCostUsd(
  usage: {
    inputTokens: number;
    outputTokens: number;
    // Optional native-Anthropic cache accounting. Default 0 → identical to the
    // pre-cache math, so every existing caller stays byte-for-byte unchanged.
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  },
  model: string,
): number {
  const rate = rateFor(model);
  const inPerTok = rate.inputUsdPerMillion / 1_000_000;
  const outPerTok = rate.outputUsdPerMillion / 1_000_000;
  const usd =
    // native `input_tokens` already EXCLUDES cache read/write, so no double-count.
    usage.inputTokens * inPerTok +
    (usage.cacheWriteTokens ?? 0) * inPerTok * CACHE_WRITE_MULT +
    (usage.cacheReadTokens ?? 0) * inPerTok * CACHE_READ_MULT +
    usage.outputTokens * outPerTok;
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

/**
 * True for an Anthropic HTTP 529 `overloaded_error` — a transient capacity
 * signal that warrants a fallback, NOT a content/auth/contract failure (those
 * must still fail loud). Matches the SDK error `.status` and the message body.
 */
function isOverloadError(err: unknown): boolean {
  const status = (err as { status?: unknown })?.status;
  if (status === 529) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /\b529\b|overloaded_error|"type"\s*:\s*"overloaded_error"|overloaded/i.test(msg);
}

export async function generateAnthropicText(
  input: AnthropicTextInput,
): Promise<AnthropicTextResult> {
  const maxTokens = input.maxOutputTokens ?? 4000;

  // Definite-assignment: every non-throwing path through the branches below
  // assigns all six (gemini debug tier · anthropic success · gemini-fallback).
  let markdown!: string;
  let model!: string;
  let stopReason!: string | null;
  let usage!: { inputTokens: number; outputTokens: number };
  let costUsd!: number;
  let provider!: AnthropicTextResult['provider'];

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
    provider = 'gemini';
  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new AnthropicTextError('ANTHROPIC_API_KEY is not set');
    }

    const client = new Anthropic({ apiKey });

    let response: Awaited<ReturnType<typeof client.messages.create>> | null = null;
    try {
      response = await client.messages.create(
        {
          model: input.model,
          max_tokens: maxTokens,
          system: input.systemPrompt,
          messages: [{ role: 'user', content: input.userMessage }],
        },
        {
          // D6: hard per-call abort well under the exec-* 10m finishTimeout belt,
          // scaled to maxTokens so long legit generations (Writer 16k) don't clip.
          timeout: anthropicTimeoutMs(maxTokens),
          maxRetries: ANTHROPIC_MAX_RETRIES,
        },
      );
    } catch (err: unknown) {
      // Overload fallback (2026-06-23, Director): a 529 `overloaded_error` is a
      // TRANSIENT Anthropic-capacity signal, not a content/contract failure.
      // Rather than bouncing the whole shot (the live "Reference Designer failed
      // — 529" loop), fall back to the Gemini free tier so the work lands. The
      // result is tagged `gemini-fallback` so the activity feed shows which
      // engine carried it. Only overload falls back — auth/4xx/JSON errors still
      // fail loud. Needs GEMINI_API_KEY; absent → original Anthropic error.
      const geminiAvailable = Boolean(process.env.GEMINI_API_KEY?.trim());
      if (isOverloadError(err) && geminiAvailable) {
        // eslint-disable-next-line no-console
        console.warn(
          `[anthropic-text] ${input.model} overloaded (529) — falling back to Gemini free tier`,
        );
        try {
          const raw = await generateGeminiTextRaw({
            systemPrompt: input.systemPrompt,
            userMessage: input.userMessage,
            maxOutputTokens: maxTokens,
          });
          markdown = raw.markdown;
          model = raw.model;
          stopReason = raw.stopReason;
          usage = raw.usage;
          costUsd = 0;
          provider = 'gemini-fallback';
          response = null; // handled below by the provider branch
        } catch (geminiErr: unknown) {
          throw new AnthropicTextError(
            `Anthropic overloaded (529) and Gemini fallback also failed: ${geminiErr instanceof Error ? geminiErr.message : String(geminiErr)}`,
            geminiErr,
          );
        }
      } else {
        throw new AnthropicTextError(
          `Anthropic call failed: ${err instanceof Error ? err.message : String(err)}`,
          err,
        );
      }
    }

    if (response) {
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
      provider = 'anthropic';
    }
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
    provider,
  };
}
