// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/openai-edits-multi.ts
// OpenAI Image Edits adapter for multi-image conditioning.
//
// OpenAI's `/v1/images/edits` accepts an `image[]` array up to 16 entries.
// The model treats them as composite references — character A + character B
// + location all anchor visual identity simultaneously. That solves the
// root multi-character drift problem (Vial used to be regenerated text-only
// because v1 picked only the first character anchor; here all participants
// ride along).
//
// Limitations:
//   - No `strength` parameter is exposed by the API → identity is locked
//     hard, emotion/action prompt has weaker influence than Flux Pro Ultra.
//     This is what made v1 results emotionally flat. Use this provider for
//     consistency-critical shots (recurring characters in calm states).
//   - Per-reference weight not supported → all refs contribute equally.
// ──────────────────────────────────────────────────────────────────────────────

import type { GptImageQuality, GptImageSize } from './openai-image';
import type {
  MultiImageGenInput,
  MultiImageGenProvider,
  MultiImageGenResult,
} from './image-gen-multi';
import { MultiImageGenError } from './image-gen-multi';

const PROVIDER_ID = 'openai-edits-multi';
const MODEL = 'gpt-image-1';

// Edits API supports up to 16 input images per request — keep some margin.
const MAX_REFS = 16;

// Cost ladder mirrors openai-image-edit.ts (same model, same render cost).
// Multi-ref edits price the same as single-ref edits — OpenAI charges per
// generation, not per reference image fed in.
const COST_TABLE: Record<GptImageQuality, Record<string, number>> = {
  low:    { '1024x1024': 0.011, '1024x1536': 0.016, '1536x1024': 0.016, auto: 0.016 },
  medium: { '1024x1024': 0.042, '1024x1536': 0.063, '1536x1024': 0.063, auto: 0.063 },
  high:   { '1024x1024': 0.167, '1024x1536': 0.25,  '1536x1024': 0.25,  auto: 0.25 },
  auto:   { '1024x1024': 0.042, '1024x1536': 0.063, '1536x1024': 0.063, auto: 0.063 },
};

function dimensionsFor(size: GptImageSize): { width: number; height: number } {
  if (size === '1024x1024') return { width: 1024, height: 1024 };
  if (size === '1024x1536') return { width: 1024, height: 1536 };
  if (size === '1536x1024') return { width: 1536, height: 1024 };
  return { width: 1024, height: 1024 };
}

/**
 * Coerce free-form `MultiImageGenInput.size` to a GptImageSize the OpenAI
 * Edits API supports. Anything 4K-shaped collapses to 1536x1024 — the
 * provider does not generate 4K natively; the upscale step (Phase E.5)
 * handles 4K delivery.
 */
function clampSize(size: MultiImageGenInput['size']): GptImageSize {
  if (size === '1024x1024' || size === '1024x1536' || size === '1536x1024') return size;
  return '1024x1024';
}

export const openAIEditsMultiProvider: MultiImageGenProvider = {
  id: PROVIDER_ID,
  capabilities: {
    max_references: MAX_REFS,
    supports_strength: false,
    supports_per_ref_weight: false,
    default_strength: 1.0,
  },

  async generate(input: MultiImageGenInput): Promise<MultiImageGenResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new MultiImageGenError(
        'OPENAI_API_KEY is not set',
        PROVIDER_ID,
      );
    }
    if (input.references.length === 0) {
      throw new MultiImageGenError(
        'At least one reference image is required (use openai-image.ts for text-only)',
        PROVIDER_ID,
      );
    }
    if (input.references.length > MAX_REFS) {
      throw new MultiImageGenError(
        `OpenAI Edits supports at most ${MAX_REFS} references; got ${input.references.length}`,
        PROVIDER_ID,
      );
    }

    const size = clampSize(input.size);
    const quality: GptImageQuality = input.quality ?? 'medium';

    const formData = new FormData();
    // Append every reference under `image[]` — OpenAI accepts repeated keys.
    input.references.forEach((ref, idx) => {
      const buf = Buffer.from(ref.image_b64, 'base64');
      const blob = new Blob([new Uint8Array(buf)], { type: 'image/png' });
      formData.append('image[]', blob, `ref-${idx}-${ref.kind}.png`);
    });
    formData.append('prompt', input.prompt);
    formData.append('model', MODEL);
    formData.append('size', size);
    formData.append('quality', quality);
    formData.append('n', '1');

    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });
    } catch (err) {
      throw new MultiImageGenError(
        `OpenAI Edits network error: ${(err as Error).message}`,
        PROVIDER_ID,
        err,
      );
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new MultiImageGenError(
        `OpenAI Edits API ${res.status}: ${errBody.slice(0, 400)}`,
        PROVIDER_ID,
      );
    }

    const json = (await res.json()) as {
      data?: Array<{ b64_json?: string; revised_prompt?: string }>;
    };
    const first = json.data?.[0];
    const b64 = first?.b64_json;
    if (!b64) {
      throw new MultiImageGenError(
        `OpenAI Edits returned no b64_json (response: ${JSON.stringify(json).slice(0, 400)})`,
        PROVIDER_ID,
      );
    }

    const { width, height } = dimensionsFor(size);
    const cost = COST_TABLE[quality][size] ?? 0.042;

    return {
      b64_data: b64,
      cost_usd: cost,
      width,
      height,
      provider_id: PROVIDER_ID,
      model: MODEL,
      revised_prompt: first.revised_prompt,
    };
  },
};
