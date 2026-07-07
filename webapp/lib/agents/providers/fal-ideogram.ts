// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/fal-ideogram.ts
// Ideogram v3 image generation via fal.ai queue REST API — the viral-thumbnail
// renderer's image provider (distribution tail, 2026-06-01).
//
// Why Ideogram over gpt-image-1 for thumbnails (research 2026):
//   - best-in-class TEXT rendering — bold styled captions baked INTO the image
//     (kills the cheap sharp overlay); ~98% text accuracy.
//   - poster/thumbnail-grade output (style=DESIGN), native 16:9 (landscape_16_9).
//   - `ideogram/character` keeps a canonical character on-model from one
//     reference image — so Sandy doesn't drift.
//
// Endpoint pattern (same as fal-seedance): POST queue.fal.run/<slug> →
//   { status_url, response_url } → poll status_url until COMPLETED →
//   GET response_url → { images: [{ url }] } → download url → base64.
// Auth: `Authorization: Key ${FAL_KEY}`. Image inputs accept inline data: URLs.
// ──────────────────────────────────────────────────────────────────────────────

import { fetchWithTimeout, FETCH_TIMEOUTS } from './fetch-with-timeout';

const QUEUE_BASE = 'https://queue.fal.run';
const V3_SLUG = 'fal-ai/ideogram/v3';
const CHARACTER_SLUG = 'fal-ai/ideogram/character';
const POLL_INTERVAL_MS = 3_000;
const MAX_WAIT_MS = 4 * 60 * 1000; // Ideogram stills run ~5-30s; generous headroom.

// Rough fal pricing per image (2026); used only for the cost ledger estimate.
const COST_BY_SPEED: Record<IdeogramRenderingSpeed, number> = {
  TURBO: 0.03,
  BALANCED: 0.06,
  QUALITY: 0.09,
};

export type IdeogramImageSize =
  | 'square_hd'
  | 'square'
  | 'portrait_4_3'
  | 'portrait_16_9'
  | 'landscape_4_3'
  | 'landscape_16_9';
export type IdeogramRenderingSpeed = 'TURBO' | 'BALANCED' | 'QUALITY';
/** v3 styles: AUTO/GENERAL/REALISTIC/DESIGN. character styles: AUTO/REALISTIC/FICTION. */
export type IdeogramStyle = 'AUTO' | 'GENERAL' | 'REALISTIC' | 'DESIGN' | 'FICTION';

export interface FalIdeogramInput {
  prompt: string;
  /** v3 only — ignored in character mode. */
  negativePrompt?: string;
  imageSize?: IdeogramImageSize;
  renderingSpeed?: IdeogramRenderingSpeed;
  style?: IdeogramStyle;
  seed?: number;
  /**
   * Character mode: a reference image of the canonical character as an inline
   * data URL (`data:image/png;base64,...`) or an http(s) URL. When set, the
   * call routes to `fal-ai/ideogram/character` so the character stays on-model.
   */
  referenceImageUrl?: string;
}

export interface FalIdeogramResult {
  b64_data: string;
  format: 'PNG' | 'JPEG';
  size_bytes: number;
  cost_usd: number;
  model: string;
  seed?: number;
}

export class FalIdeogramError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'FalIdeogramError';
  }
}

interface QueueSubmitResponse {
  status_url?: string;
  response_url?: string;
}
interface QueueStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  status_url?: string;
  response_url?: string;
}
interface IdeogramOutput {
  images?: Array<{ url?: string; content_type?: string }>;
  seed?: number;
}

async function pollUntilDone(apiKey: string, statusUrl: string): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const res = await fetchWithTimeout(statusUrl, { headers: { Authorization: `Key ${apiKey}` } }, FETCH_TIMEOUTS.POLL_MS);
    if (!res.ok) {
      throw new FalIdeogramError(`fal status poll failed (${res.status})`, res.status, (await res.text()).slice(0, 600));
    }
    const json = (await res.json()) as QueueStatusResponse;
    if (json.status === 'COMPLETED') return;
    if (json.status === 'FAILED' || json.status === 'CANCELLED') {
      throw new FalIdeogramError(`fal request terminated status=${json.status}`, null, JSON.stringify(json).slice(0, 600));
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new FalIdeogramError(`fal polling timed out after ${MAX_WAIT_MS / 1000}s`);
}

export async function generateIdeogram(input: FalIdeogramInput): Promise<FalIdeogramResult> {
  const apiKey = (process.env.FAL_KEY ?? process.env.FAL_API_KEY)?.trim();
  if (!apiKey) throw new FalIdeogramError('FAL_KEY is not set');

  const isCharacter = Boolean(input.referenceImageUrl);
  const slug = isCharacter ? CHARACTER_SLUG : V3_SLUG;
  const renderingSpeed = input.renderingSpeed ?? 'QUALITY';
  const imageSize = input.imageSize ?? 'landscape_16_9';

  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    image_size: imageSize,
    rendering_speed: renderingSpeed,
    num_images: 1,
    expand_prompt: true,
    style: input.style ?? (isCharacter ? 'AUTO' : 'DESIGN'),
  };
  if (isCharacter) {
    payload.reference_image_urls = [input.referenceImageUrl];
  } else if (input.negativePrompt) {
    payload.negative_prompt = input.negativePrompt;
  }
  if (typeof input.seed === 'number' && Number.isFinite(input.seed)) {
    payload.seed = Math.trunc(input.seed);
  }

  const submitRes = await fetchWithTimeout(`${QUEUE_BASE}/${slug}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Key ${apiKey}` },
    body: JSON.stringify(payload),
  }, FETCH_TIMEOUTS.QUEUE_SUBMIT_MS);
  if (!submitRes.ok) {
    const body = (await submitRes.text()).slice(0, 800);
    throw new FalIdeogramError(`fal submit failed (${submitRes.status}) — ${body || '<empty>'}`, submitRes.status, body);
  }
  const submit = (await submitRes.json()) as QueueSubmitResponse;
  const statusUrl = submit.status_url;
  const responseUrl = submit.response_url;
  if (!statusUrl || !responseUrl) {
    throw new FalIdeogramError('fal submit returned no status_url/response_url', null, JSON.stringify(submit).slice(0, 400));
  }

  await pollUntilDone(apiKey, statusUrl);

  const resultRes = await fetchWithTimeout(responseUrl, { headers: { Authorization: `Key ${apiKey}` } }, FETCH_TIMEOUTS.QUEUE_SUBMIT_MS);
  if (!resultRes.ok) {
    throw new FalIdeogramError(`fal result fetch failed (${resultRes.status})`, resultRes.status, (await resultRes.text()).slice(0, 600));
  }
  const out = (await resultRes.json()) as IdeogramOutput;
  const imageUrl = out.images?.[0]?.url;
  if (!imageUrl) {
    throw new FalIdeogramError('fal Ideogram response had no image url', null, JSON.stringify(out).slice(0, 400));
  }

  // Download the rendered image → base64 for persistBinary.
  const imgRes = await fetchWithTimeout(imageUrl, {}, FETCH_TIMEOUTS.BINARY_DOWNLOAD_MS);
  if (!imgRes.ok) throw new FalIdeogramError(`image download failed (${imgRes.status})`, imgRes.status);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const isJpeg = (out.images?.[0]?.content_type ?? '').includes('jpeg') || imageUrl.toLowerCase().includes('.jpg');

  return {
    b64_data: buf.toString('base64'),
    format: isJpeg ? 'JPEG' : 'PNG',
    size_bytes: buf.byteLength,
    cost_usd: COST_BY_SPEED[renderingSpeed],
    model: slug,
    seed: out.seed,
  };
}
