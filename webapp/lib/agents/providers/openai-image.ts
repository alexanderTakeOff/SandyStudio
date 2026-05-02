// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/openai-image.ts
// Real OpenAI Images API adapter for the `image` contract.
// Used by EXEC-THUMB (initial integration) and EXEC-VGEN reference frames.
//
// Per provider_strategy.md §2.2 — `gpt-image-1` reuses the existing
// OPENAI_API_KEY (also used by Concierge gpt-5.4-mini). No new secret.
//
// Phase 8 first-call MVP: returned image is base64-encoded inline in the
// adapter result. Caller (saveAgentOutput) is responsible for persisting it.
// In Phase 8 step 10 we'll switch to Drive upload + drive_file_id.
// ──────────────────────────────────────────────────────────────────────────────

export type GptImageSize = '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
export type GptImageQuality = 'low' | 'medium' | 'high' | 'auto';

export interface OpenAIImageInput {
  prompt: string;
  /** Default 1536x1024 — landscape suitable for YouTube thumbnails. */
  size?: GptImageSize;
  /** Default 'medium'. 'low' is cheapest, 'high' costs ~10× medium. */
  quality?: GptImageQuality;
}

export interface OpenAIImageResult {
  status: 'success';
  provider: 'gpt-image-1';
  format: 'PNG';
  width: number;
  height: number;
  size_bytes: number;
  /** base64 (no data: URI prefix) */
  b64_data: string;
  /** Estimated cost — not authoritative, OpenAI bills the actual amount. */
  cost_usd: number;
  revised_prompt?: string;
}

// Estimated price ladder (USD per image, gpt-image-1 standard pricing).
// Source: openai.com/pricing. Prices change; we only track for budget hints.
const COST_TABLE: Record<GptImageQuality, Record<string, number>> = {
  low:    { '1024x1024': 0.011, '1024x1536': 0.016, '1536x1024': 0.016, auto: 0.016 },
  medium: { '1024x1024': 0.042, '1024x1536': 0.063, '1536x1024': 0.063, auto: 0.063 },
  high:   { '1024x1024': 0.167, '1024x1536': 0.250, '1536x1024': 0.250, auto: 0.250 },
  auto:   { '1024x1024': 0.042, '1024x1536': 0.063, '1536x1024': 0.063, auto: 0.063 },
};

function dimensionsFor(size: GptImageSize): { width: number; height: number } {
  if (size === '1024x1024') return { width: 1024, height: 1024 };
  if (size === '1024x1536') return { width: 1024, height: 1536 };
  if (size === '1536x1024') return { width: 1536, height: 1024 };
  return { width: 1536, height: 1024 }; // 'auto' best-guess for landscape
}

export class OpenAIImageError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly body: string | null = null,
  ) {
    super(message);
    this.name = 'OpenAIImageError';
  }
}

export async function generateImageOpenAI(
  input: OpenAIImageInput,
): Promise<OpenAIImageResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenAIImageError('OPENAI_API_KEY is not set');
  }

  const size = input.size ?? '1536x1024';
  const quality = input.quality ?? 'medium';

  const startedAt = Date.now();
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: input.prompt,
      n: 1,
      size,
      quality,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new OpenAIImageError(
      `OpenAI Images API ${res.status}`,
      res.status,
      errBody.slice(0, 800),
    );
  }

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; revised_prompt?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const first = json.data?.[0];
  const b64 = first?.b64_json;
  if (!b64) {
    throw new OpenAIImageError(
      `OpenAI Images returned no b64_json (response: ${JSON.stringify(json).slice(0, 400)})`,
    );
  }

  const { width, height } = dimensionsFor(size);
  const sizeBytes = Math.round(b64.length * 0.75);
  const cost = COST_TABLE[quality][size] ?? 0.042;

  // Touch latency value so the duration is measured even if not exposed —
  // useful for logging hooks once we wire them up.
  void (Date.now() - startedAt);

  return {
    status: 'success',
    provider: 'gpt-image-1',
    format: 'PNG',
    width,
    height,
    size_bytes: sizeBytes,
    b64_data: b64,
    cost_usd: cost,
    revised_prompt: first.revised_prompt,
  };
}
