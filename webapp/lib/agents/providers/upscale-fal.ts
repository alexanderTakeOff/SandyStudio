// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/upscale-fal.ts
// 4K upscaler via fal.ai. Used by EREF v2 Phase E.5: after AI-APPROVE the
// runner upscales the candidate image to ~4K so downstream Animatic / VGEN
// can ingest high-resolution input. gpt-image-1 caps at 1792×1024;
// Flux Pro Ultra Redux at 1024×1024 unless explicit large-size requested.
// Either way the image needs an upscale pass before it's "Animatic-ready".
//
// Default model: `fal-ai/clarity-upscaler` — 4× scale factor, retains detail,
// ~$0.03 per image. Good blend of fidelity and cost. Director can swap to
// a creative-upscaler family later via app_config.
//
// Same queue+poll dance as flux-pro-ultra-fal.ts. Shares no code with that
// module on purpose — keeping fal.ai adapters independent makes it easy to
// retire one without touching the other.
// ──────────────────────────────────────────────────────────────────────────────

import { fetchWithTimeout, FETCH_TIMEOUTS } from './fetch-with-timeout';

const PROVIDER_ID = 'fal-clarity-upscaler';
const MODEL = 'clarity-upscaler';
const ENDPOINT = `https://queue.fal.run/fal-ai/${MODEL}`;
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 120;
/** Cost reported to the ledger. Re-tune when fal.ai price moves. */
const COST_PER_UPSCALE_USD = 0.03;

export class UpscaleError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'UpscaleError';
  }
}

export interface UpscaleInput {
  /** Source image base64 (no data: prefix). */
  image_b64: string;
  /**
   * Target — '4K' is the only supported preset for now.
   *   - clarity-upscaler is a fixed 4× scale; if input is 1024×1024 the
   *     output is 4096×4096 (matches our 4K requirement). Smaller inputs
   *     should be reported back so the runner can adjust expectations.
   */
  target?: '4K';
}

export interface UpscaleResult {
  b64_data: string;
  cost_usd: number;
  width: number;
  height: number;
  provider_id: string;
  model: string;
}

interface FalQueuedResponse {
  request_id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  status_url?: string;
  response_url?: string;
}

interface FalStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  response_url?: string;
}

interface FalUpscaleResponse {
  image: { url: string; width: number; height: number; content_type?: string };
}

async function falFetch<T>(url: string, init: RequestInit, apiKey: string): Promise<T> {
  const res = await fetchWithTimeout(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Key ${apiKey}`,
    },
  }, FETCH_TIMEOUTS.POLL_MS);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new UpscaleError(`fal.ai upscale ${res.status} on ${url}: ${body.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

async function pollUntilComplete(initial: FalQueuedResponse, apiKey: string): Promise<FalUpscaleResponse> {
  if (initial.status === 'COMPLETED' && initial.response_url) {
    return await falFetch<FalUpscaleResponse>(initial.response_url, { method: 'GET' }, apiKey);
  }
  const statusUrl = initial.status_url;
  if (!statusUrl) {
    throw new UpscaleError('fal.ai upscale missing status_url');
  }
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const s = await falFetch<FalStatusResponse>(statusUrl, { method: 'GET' }, apiKey);
    if (s.status === 'COMPLETED') {
      const responseUrl = s.response_url ?? statusUrl.replace('/status', '');
      return await falFetch<FalUpscaleResponse>(responseUrl, { method: 'GET' }, apiKey);
    }
    if (s.status === 'FAILED') {
      throw new UpscaleError('fal.ai upscale FAILED');
    }
  }
  throw new UpscaleError(
    `fal.ai upscale timed out after ${(POLL_INTERVAL_MS * POLL_MAX_ATTEMPTS) / 1000}s`,
  );
}

async function downloadAsBase64(imageUrl: string): Promise<string> {
  const res = await fetchWithTimeout(imageUrl, {}, FETCH_TIMEOUTS.BINARY_DOWNLOAD_MS);
  if (!res.ok) {
    throw new UpscaleError(`Failed to download upscaled image (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString('base64');
}

/**
 * Run a single upscale job against fal.ai clarity-upscaler.
 * Throws UpscaleError on any failure — caller decides whether to fall back
 * to the original (un-upscaled) image or fail the shot.
 */
export async function upscaleToFourK(input: UpscaleInput): Promise<UpscaleResult> {
  const apiKey = process.env.FAL_KEY?.trim() ?? process.env.FAL_API_KEY?.trim();
  if (!apiKey) {
    throw new UpscaleError('FAL_KEY (or FAL_API_KEY) is not set');
  }

  const dataUri = `data:image/png;base64,${input.image_b64}`;
  const queued = await falFetch<FalQueuedResponse>(
    ENDPOINT,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        image_url: dataUri,
        // clarity-upscaler defaults: scale_factor=4, creativity=0.35,
        // resemblance=0.6 — leave as-is; tunable later via Director Settings.
        scale_factor: 4,
        creativity: 0.35,
        resemblance: 0.6,
        output_format: 'png',
      }),
    },
    apiKey,
  );

  const result = await pollUntilComplete(queued, apiKey);
  if (!result.image?.url) {
    throw new UpscaleError('fal.ai upscale returned no image url');
  }
  const b64 = await downloadAsBase64(result.image.url);

  return {
    b64_data: b64,
    cost_usd: COST_PER_UPSCALE_USD,
    width: result.image.width,
    height: result.image.height,
    provider_id: PROVIDER_ID,
    model: MODEL,
  };
}
