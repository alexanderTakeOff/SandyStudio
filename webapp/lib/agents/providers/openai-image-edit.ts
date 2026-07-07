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
import { fetchWithTimeout, FETCH_TIMEOUTS } from './fetch-with-timeout';

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
  provider: 'gpt-image-2-edit';
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
// Sprint φ post-merge 2026-05-18 — upgraded to gpt-image-2 pricing (~+15%).
const COST_TABLE: Record<GptImageQuality, Record<string, number>> = {
  low: { '1024x1024': 0.013, '1024x1536': 0.018, '1536x1024': 0.018, auto: 0.018 },
  medium: { '1024x1024': 0.053, '1024x1536': 0.080, '1536x1024': 0.080, auto: 0.080 },
  high: { '1024x1024': 0.211, '1024x1536': 0.317, '1536x1024': 0.317, auto: 0.317 },
  auto: { '1024x1024': 0.053, '1024x1536': 0.080, '1536x1024': 0.080, auto: 0.080 },
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
  formData.append('model', 'gpt-image-2');
  formData.append('size', size);
  formData.append('quality', quality);
  formData.append('n', '1');

  const res = await fetchWithTimeout('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  }, FETCH_TIMEOUTS.IMAGE_API_MS);

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
  const cost = COST_TABLE[quality][size] ?? 0.053;

  return {
    status: 'success',
    provider: 'gpt-image-2-edit',
    format: 'PNG',
    width,
    height,
    size_bytes: sizeBytes,
    b64_data: b64,
    cost_usd: cost,
    revised_prompt: first.revised_prompt,
  };
}

/**
 * @deprecated Use `readAssetMediaAsBase64` from `lib/media-cache` directly with
 * the full `{ filename, driveFileId, stagingPath }` descriptor — that resolves
 * disk-cache → Drive → legacy staging. This helper only receives a staging URL,
 * so it can resolve Drive-backed assets only when their bytes already sit in the
 * worktree's `public/staging` (legacy, pre-migration files). It now delegates to
 * the canonical reader so any remaining caller is at least Drive-aware for the
 * paths the reader can derive from a `/staging/...` URL; callers should migrate
 * to pass `filename` + `driveFileId` so Drive resolution actually works.
 *
 * Signature preserved (`(browserUrl: string) => Promise<string | null>`) so
 * existing callers don't break.
 */
export async function readBibleImageAsBase64(browserUrl: string): Promise<string | null> {
  if (!browserUrl.startsWith('/staging/')) return null;
  const { readAssetMediaAsBase64 } = await import('../../media-cache');
  return readAssetMediaAsBase64({ stagingPath: browserUrl });
}
