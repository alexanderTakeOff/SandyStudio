// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/gemini-text.ts
// Gemini free-tier text adapter — the DEBUG TIER for pipeline text agents.
//
// Director directive 2026-06-11 (q8b): Mode-4 / smoke pipeline runs must not
// burn Anthropic API credits. This adapter mirrors anthropic-text's call shape
// so generateAnthropicText can delegate to it behind TEXT_LLM_DEBUG_TIER —
// no per-runner changes (the chokepoint routing is the anti-additive move).
//
// Free tier (2026): gemini-2.5-flash ~10 RPM / hundreds of req/day — ample for
// pilot-scope smokes. Live-verified 2026-06-11: follows the fenced ```json
// contract our agents rely on. NOT for Mode 1-3 production runs — creative
// quality and contract discipline are below Sonnet.
//
// Returns RAW text only. JSON extraction + error semantics stay in
// anthropic-text (single shared post-processing path, and no import cycle).
// ──────────────────────────────────────────────────────────────────────────────

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// gemini-3.5-flash rejected for this role: thinking-on-by-default consumes the
// maxOutputTokens budget (live test returned 7 visible tokens of 200).
const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash';

function getTextModel(): string {
  return process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL;
}

export class GeminiTextError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'GeminiTextError';
  }
}

export interface GeminiTextRawInput {
  systemPrompt: string;
  userMessage: string;
  /** Hard cap on output tokens (mirrors anthropic-text default 4000). */
  maxOutputTokens: number;
}

export interface GeminiTextRawResult {
  /** Full text response (markdown, incl. any fenced JSON). */
  markdown: string;
  /** Actual gemini model id used — surfaced in audit descriptions. */
  model: string;
  /** Mapped to anthropic-style stop reasons: end_turn / max_tokens / raw. */
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string; code?: number };
}

function mapStopReason(finishReason: string | undefined): string | null {
  if (!finishReason) return null;
  if (finishReason === 'STOP') return 'end_turn';
  if (finishReason === 'MAX_TOKENS') return 'max_tokens';
  return finishReason.toLowerCase();
}

export async function generateGeminiTextRaw(
  input: GeminiTextRawInput,
): Promise<GeminiTextRawResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new GeminiTextError('GEMINI_API_KEY is not set');

  const model = getTextModel();
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: input.maxOutputTokens,
  };
  // 2.5-family supports thinkingConfig; budget 0 keeps the whole token budget
  // for visible output (thinking would silently eat maxOutputTokens). Older
  // families 400 on the unknown field, so gate by prefix.
  if (model.startsWith('gemini-2.5')) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.systemPrompt }] },
      contents: [{ parts: [{ text: input.userMessage }] }],
      generationConfig,
    }),
  });

  let json: GeminiGenerateResponse;
  try {
    json = (await res.json()) as GeminiGenerateResponse;
  } catch (err: unknown) {
    throw new GeminiTextError(`Gemini text: non-JSON response (HTTP ${res.status})`, err);
  }
  if (!res.ok || json.error) {
    throw new GeminiTextError(
      `Gemini text call failed: ${json.error?.message ?? `HTTP ${res.status}`}`,
    );
  }

  const candidate = json.candidates?.[0];
  const markdown = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('\n')
    .trim();

  return {
    markdown,
    model,
    stopReason: mapStopReason(candidate?.finishReason),
    usage: {
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
