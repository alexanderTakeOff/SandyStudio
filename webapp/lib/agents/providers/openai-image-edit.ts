// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/openai-image-edit.ts
// OpenAI Images Edits adapter — gpt-image-1 image-to-image.
//
// Used by EREF v2 runner to anchor episode reference frames on Bible LOCKED
// character / location reference PNGs. The edits API accepts an input image
// + prompt and returns a new image that combines both — preserving visual
// identity (e.g. Sandy's silhouette) while applying the requested scene.
//
// Cost: ~$0.04/edit medium quality (same as generation).
// API: POST https://api.openai.com/v1/images/edits  multipart/form-data
//   image: <file> (or array)
//   prompt: <string>
//   model: gpt-image-1
//   size, quality, n
// ──────────────────────────────────────────────────────────────────────────────

import type { GptImageQuality, GptImageSize } from './openai-image';

export interface OpenAIImageEditInput {
  /** Base64-encoded PNG of the source image (no data: URI prefix). */
  imageBase64: string;
  /** Mime of the source image — usually 'image/png'. */
  imageMime?: string;
  /** Filename hint for multipart payload (informational; does not need to be unique). */
  imageFilename?: string;
  /** Edit prompt. */
  prompt: string;
  size?: GptImageSize;
  quality?: GptImageQuality;
}

export interface OpenAIImageEditResult {
  status: 'success';
  provider: 'gpt-image-1-edit';
  format: 'PNG';
  width: number;
  height: number;
  size_bytes: number;
  /** base64 (no data: URI prefix) */
  b64_data: string;
  cost_usd: number;
  revised_prompt?: string;
}

export class OpenAIImageEditError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly body: string | null = null,
  ) {
    super(message);
    this.name = 'OpenAIImageEditError';
  }
}

// Same cost ladder as text-to-image (same model, same render cost).
const COST_TABLE: Record<GptImageQuality, Record<string, number>> = {
  low: { '1024x1024': 0.011, '1024x1536': 0.016, '1536x1024': 0.016, auto: 0.016 },
  medium: { '1024x1024': 0.042, '1024x1536': 0.063, '1536x1024': 0.063, auto: 0.063 },
  high: { '1024x1024': 0.167, '1024x1536': 0.25, '1536x1024': 0.25, auto: 0.25 },
  auto: { '1024x1024': 0.042, '1024x1536': 0.063, '1536x1024': 0.063, auto: 0.063 },
};

function dimensionsFor(size: GptImageSize): { width: number; height: number } {
  if (size === '1024x1024') return { width: 1024, height: 1024 };
  if (size === '1024x1536') return { width: 1024, height: 1536 };
  if (size === '1536x1024') return { width: 1536, height: 1024 };
  return { width: 1024, height: 1024 };
}

export async function editImageOpenAI(input: OpenAIImageEditInput): Promise<OpenAIImageEditResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenAIImageEditError('OPENAI_API_KEY is not set');
  }
  const size = input.size ?? '1024x1024';
  const quality = input.quality ?? 'medium';
  const mime = input.imageMime ?? 'image/png';
  const filename = input.imageFilename ?? 'source.png';

  const formData = new FormData();
  // Convert base64 to Blob for multipart.
  const buf = Buffer.from(input.imageBase64, 'base64');
  // Wrap as Uint8Array so Blob() handles ArrayBufferLike correctly under Node's File typings.
  const blob = new Blob([new Uint8Array(buf)], { type: mime });
  formData.append('image', blob, filename);
  formData.append('prompt', input.prompt);
  formData.append('model', 'gpt-image-1');
  formData.append('size', size);
  formData.append('quality', quality);
  formData.append('n', '1');

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new OpenAIImageEditError(
      `OpenAI Image Edits API ${res.status}`,
      res.status,
      errBody.slice(0, 800),
    );
  }

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; revised_prompt?: string }>;
  };
  const first = json.data?.[0];
  const b64 = first?.b64_json;
  if (!b64) {
    throw new OpenAIImageEditError(
      `OpenAI Image Edits returned no b64_json (response: ${JSON.stringify(json).slice(0, 400)})`,
    );
  }

  const { width, height } = dimensionsFor(size);
  const sizeBytes = Math.round(b64.length * 0.75);
  const cost = COST_TABLE[quality][size] ?? 0.042;

  return {
    status: 'success',
    provider: 'gpt-image-1-edit',
    format: 'PNG',
    width,
    height,
    size_bytes: sizeBytes,
    b64_data: b64,
    cost_usd: cost,
    revised_prompt: first.revised_prompt,
  };
}

/** Helper: read a local staging file (browserUrl like `/staging/...`) → base64. */
export async function readBibleImageAsBase64(browserUrl: string): Promise<string | null> {
  if (!browserUrl.startsWith('/staging/')) return null;
  // Convert /staging/<file> → webapp/public/staging/<file>
  const path = await import('node:path');
  const fs = await import('node:fs/promises');
  const abs = path.join(process.cwd(), 'public', browserUrl.slice(1));
  try {
    const buf = await fs.readFile(abs);
    return buf.toString('base64');
  } catch {
    return null;
  }
}
